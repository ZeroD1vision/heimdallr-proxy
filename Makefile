# ==============================================================================
# HEIMDALLR MAKEFILE
# ==============================================================================

# Подгружаем переменные окружения
ifneq (,$(wildcard ./.env))
    include .env
endif

# --- Константы путей ---
FRONTEND_DIR := ./web/ui
BUILD_DIR    := ./bin
BINARY_NAME  := heimdallr
GO_PKG       := ./cmd/heimdallr

# --- Параметры туннеля ---
SSH_USER := $(SSH_DEPLOY_USER)
KEY_PATH := $(SSH_DEPLOY_USER_KEY)
HOST     := $(SSH_HOST)
PORT     := $(SSH_PORT)
L_PORT   := $(CLIENT_TUNNEL_PORT)
R_PORT   := $(SERVER_TUNNEL_PORT)

# --- Параметры тестирования (Shadow Deploys) ---
TEST_BINARY_NAME := heimdallr-test
TEST_PORT        := 4000

# --- Настройки сборки ---
# Используем CGO_ENABLED=0 для создания переносимого бинарника (Static Binary)
GO_BUILD_FLAGS := CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"
# Выносим флаги npm install в отдельную переменную для избежания встроенного парсинга Makefile
# Игнорируем скрипты, так как там хаски и ей подобные, которые выполнятся при каждом npm install
# а для нас это критично, так как мы используем монорепо а там несколько package.json с 
# разными скриптами, которые не должны выполняться при установке зависимостей и ломают сборку
# --include=dev нужен для установки devDependencies, так как они не будут устаналвиваться изза 
# --ignore-scripts, а для сборки фронтенда они нужны
NPM_INSTALL_FLAGS := --ignore-scripts --include=dev

# .PHONY сообщает make, что это команды, а не названия файлов на диске
.PHONY: help build ui-build ui-install go-build dev dev-ui tunnel stop clean db-reset \
        prod-check deploy-test stop-test tunnel-test setup

# Команда по умолчанию
all: build

help: ## Показать справку по всем командам.
	@grep -Eh '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


# ==============================================================================
# ИНИЦИАЛИЗАЦИЯ И УСТАНОВКА
# ==============================================================================

setup: ## Полная инициализация проекта (Go + Node + Husky)
	@echo "--- [INIT] Setting up development environment ---"
	go mod download
	npm install
	@echo "✔ Environment ready. Husky hooks installed."


# ==============================================================================
# FRONTEND (NEXT.JS)
# ==============================================================================

ui-install: ## Установить зависимости через монорепо
	@echo "--- [UI] Installing all dependencies from root ---"
	npm install $(NPM_INSTALL_FLAGS)

ui-build: ui-install ## Собрать фронтенд через workspace
	@echo "--- [UI] Building static export ---"
	NODE_ENV=production npm run build -w web/ui

dev-ui: ## Запустить dev-сервер фронтенда
	@echo "--- [UI] Starting dev server ---"
	npm run dev -w web/ui

# ==============================================================================
# BACKEND (GO)
# ==============================================================================

go-deps: ## Синхронизировать зависимости Go
	@echo "--- [GO] Tidying modules ---"
	go mod tidy

go-build: go-deps ## Собрать только Go бинарник
	@echo "--- [GO] Building binary ---"
	$(GO_BUILD_FLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(GO_PKG)

# ==============================================================================
# КОМБИНИРОВАННЫЕ КОМАНДЫ (DEVELOPMENT & PROD)
# ==============================================================================

build: ui-build go-build ## Полная сборка проекта: фронтенд вшивается в бинарник
	@echo "✔ Project successfully built in $(BUILD_DIR)/$(BINARY_NAME)"

dev: tunnel ## Запуск бэкенда с активным туннелем (для работы над API)
	@echo "--- [DEV] Starting backend with tunnel ---"
	go run $(GO_PKG)

tunnel: ## Открыть SSH туннель к удаленному серверу для стат Xray
	@echo "--- [NET] Opening tunnel to $(HOST) ---"
	@pkill -f "^ssh.*$(L_PORT):127.0.0.1:$(R_PORT)" || true
	@ssh -i $(KEY_PATH) -p $(PORT) -f -N -L $(L_PORT):127.0.0.1:$(R_PORT) $(SSH_USER)@$(HOST)
	@echo "✔ Tunnel active: localhost:$(L_PORT) -> remote:$(R_PORT)"

# Ищем только процесс, который заканчивается на /$(BINARY_NAME)
# или является именно этим бинарником, исключая саму команду make
stop: ## Остановить все локальные фоновые процессы (туннели)
	@echo "--- [CLEAN] Stopping local processes ---"
	@pkill -f "^ssh.*$(L_PORT):127.0.0.1:$(R_PORT)" || true
	@pkill -f "/$(BINARY_NAME)$$" || true
	@echo "✔ Done"

db-reset: ## Удалить локальную БД для чистого старта
	@rm -f data/heimdallr.db
	@echo "✔ Database reset"

clean: stop ## Полная очистка артефактов сборки
	rm -rf $(BUILD_DIR)
	rm -rf $(FRONTEND_DIR)/out
	rm -rf $(FRONTEND_DIR)/.next
	@echo "✔ Artifacts removed"

# ==============================================================================
# ТЕСТИРОВАНИЕ И ВАЛИДАЦИЯ (SHADOW DEPLOY)
# ==============================================================================

# Копируем .env, чтобы бинарник не падал из-за отсутствия токенов 
prod-check: clean ui-build go-build ## Проверка билда в изоляции (имитируем сервер локально)
	@echo "--- [TEST] Running production-ready binary in isolation ---"
	@mkdir -p $(BUILD_DIR)/test_isolation/out
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(BUILD_DIR)/test_isolation/
	@cp .env $(BUILD_DIR)/test_isolation/ 2>/dev/null || echo "WARN: .env not found"
	@cp -r web/ui/out/* $(BUILD_DIR)/test_isolation/out/
	@echo "✔ Binary moved to isolation. Checking go:embed..."
	# Запуск из папки без доступа к web/ui/out
	cd $(BUILD_DIR)/test_isolation && export $$(grep -v '^#' .env) && ./$(BINARY_NAME)

# nohup позволяет процессу жить после закрытия SSH сессии, а перенаправление вывода в лог 
# помогает отлавливать ошибки и видеть, что происходит внутри тестового экземпляра
deploy-test: stop-test build ## Собрать и запустить тестовый бинарник на сервере (порт 4000)
	@echo "--- [DEPLOY] Sending test binary to /tmp on $(HOST) ---"
	scp -i $(KEY_PATH) -P $(PORT) $(BUILD_DIR)/$(BINARY_NAME) $(SSH_USER)@$(HOST):/tmp/$(TEST_BINARY_NAME)
	@echo "--- [REMOTE] Starting test instance on port $(TEST_PORT) ---"
	ssh -i $(KEY_PATH) -p $(PORT) $(SSH_USER)@$(HOST) "chmod +x /tmp/$(TEST_BINARY_NAME) && \
		PORT=$(TEST_PORT) nohup /tmp/$(TEST_BINARY_NAME) > /tmp/$(TEST_BINARY_NAME).log 2>&1 &"
	@echo "✔ Test instance is running. Use 'make tunnel-test' to see UI."

# Прибиваем процесс и вычищаем мусор за собой, чтобы не оставлять на сервере временные файлы 
# и не создавать конфликтов при повторных запусках
stop-test: ## Остановить тест на сервере и УДАЛИТЬ все временные файлы (какашки)
	@echo "--- [REMOTE] Stopping test instance and cleaning up /tmp ---"
	ssh -i $(KEY_PATH) -p $(PORT) $(SSH_USER)@$(HOST) "pkill -f $(TEST_BINARY_NAME) || true; \
		rm -f /tmp/$(TEST_BINARY_NAME) /tmp/$(TEST_BINARY_NAME).log"
	@echo "✔ Remote /tmp is clean."

tunnel-test: ## Прокинуть порт 4000 через SSH (безопасный доступ к тестам)
	@echo "--- [NET] Mapping remote :$(TEST_PORT) to localhost:$(TEST_PORT) ---"
	@echo "✔ UI available at: http://localhost:$(TEST_PORT)"
	ssh -i $(KEY_PATH) -p $(PORT) -NL $(TEST_PORT):localhost:$(TEST_PORT) $(SSH_USER)@$(HOST)