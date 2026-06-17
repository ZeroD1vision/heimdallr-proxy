# ==============================================================================
# HEIMDALLR MAKEFILE
# ==============================================================================

# Подгружаем переменные окружения
ifneq (,$(wildcard ./.env))
    include .env
	export $(shell sed 's/=.*//' .env)
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
REMOTE_ENV_PATH  := /var/www/heimdallr/.env

# --- Пути к прото файлам ---
PROTO_DIR := ./api/proto
PROTO_OUT := ./internal/xray/proto

# --- Proto toolchain ---
PROTOC        ?= protoc
PROTO_SRC_DIR := ./api/proto
PROTO_GEN_DIR := ./internal/xray/proto
PROTO_STAMP   := $(PROTO_GEN_DIR)/.stamp

PROTO_FILES := \
    $(PROTO_SRC_DIR)/app/proxyman/command/command.proto \
    $(PROTO_SRC_DIR)/app/proxyman/config.proto

PROTO_DEPS := \
    $(shell find $(PROTO_SRC_DIR) -type f -name '*.proto' 2>/dev/null)

# 1. Сначала пытаемся взять из .env (уже сделано через include)
# 2. Если переменная пустая или не задана, устанавливаем фолбек
ifeq ($(LOCAL_STATIC_DIR),)
    LOCAL_STATIC_DIR := ./web/ui/out
endif

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
.PHONY: help build ui-build ui-install go-build go-deps dev dev-ui tunnel stop clean db-reset \
        prod-check deploy-test stop-test tunnel-test setup \
		proto proto-check proto-clean proto-verify test-backend test-race

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
# PROTOBUF / GRPC CODEGEN
# ==============================================================================

proto-check: ## Проверить наличие protoc и go-плагинов
	@command -v $(PROTOC) >/dev/null || (echo "ERROR: protoc not found"; exit 1)
	@command -v protoc-gen-go >/dev/null || (echo "ERROR: protoc-gen-go not found"; exit 1)
	@command -v protoc-gen-go-grpc >/dev/null || (echo "ERROR: protoc-gen-go-grpc not found"; exit 1)
	@test -d "$(PROTO_SRC_DIR)" || (echo "ERROR: $(PROTO_SRC_DIR) not found"; exit 1)

$(PROTO_STAMP): $(PROTO_DEPS) proto-check
	@echo "--- [PROTO] Generating Go stubs ---"
	@mkdir -p $(PROTO_GEN_DIR)
	@$(PROTOC) -I $(PROTO_SRC_DIR) \
		--go_out=$(PROTO_GEN_DIR) --go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_GEN_DIR) --go-grpc_opt=paths=source_relative \
		$(PROTO_FILES)
	@touch $(PROTO_STAMP)
	@echo "✔ Proto generated"

proto: $(PROTO_STAMP) ## Сгенерировать protobuf/gRPC код

proto-clean: ## Очистить сгенерированные proto-файлы
	@rm -rf $(PROTO_GEN_DIR)
	@echo "✔ Proto artifacts removed"

proto-verify: proto ## Проверить, что сгенерированный код закоммичен (для CI)
	@git diff --quiet -- $(PROTO_GEN_DIR) || \
		(echo "ERROR: generated proto code is out of date. Run 'make proto' and commit changes."; exit 1)
	@echo "✔ Proto code is up-to-date"

# ==============================================================================
# BACKEND (GO)
# ==============================================================================

go-deps: ## Синхронизировать зависимости Go
	@echo "--- [GO] Tidying modules ---"
	go mod tidy

go-build: go-deps ## Собрать только Go бинарник
	@echo "--- [GO] Building binary ---"
	$(GO_BUILD_FLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(GO_PKG)

test-backend: ## Прогнать backend тесты (без frontend)
	@echo "--- [TEST] Running backend tests ---"
	go test ./cmd/... ./internal/...

test-race: ## Прогнать backend тесты с race detector
	@echo "--- [TEST] Running backend race tests ---"
	go test -race ./cmd/... ./internal/...


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
	@cp -r $(LOCAL_STATIC_DIR)/* $(BUILD_DIR)/test_isolation/out/
	@echo "✔ Binary moved to isolation. Checking go:embed..."
	# Запуск из папки без доступа к web/ui/out
	cd $(BUILD_DIR)/test_isolation && export $$(grep -v '^#' .env) && ./$(BINARY_NAME)

# nohup чтобы не закрывался процесс после закрытия ssh + перенаправление вывода в лог 
deploy-test: stop-test build ## Собрать и запустить тестовый бинарник на сервере (порт 4000)
	@echo "--- [DEPLOY] Sending test binary to /tmp on $(HOST) ---"
	scp -i $(KEY_PATH) -P $(PORT) $(BUILD_DIR)/$(BINARY_NAME) $(SSH_USER)@$(HOST):/tmp/$(TEST_BINARY_NAME)
# 	@echo "--- [DEPLOY] Sending test UI folder to /tmp on $(HOST) ---"
# 	scp -r -i $(KEY_PATH) -P $(PORT) $(LOCAL_STATIC_DIR)/ $(SSH_USER)@$(HOST):/tmp/out
	@echo "--- [UI] Archiving 110MB and sending (Fast Mode) ---"
	@# 1. Создаем архив локально (без лишних метаданных для скорости)
	@tar -czf ui_bundle.tar.gz -C $(LOCAL_STATIC_DIR) .

	@# 2. Перекидываем ОДИН файл
	scp -i $(KEY_PATH) -P $(PORT) ui_bundle.tar.gz $(SSH_USER)@$(HOST):/tmp/ui_bundle.tar.gz
	
	@# 3. Распаковываем на сервере и подметаем мусор
	ssh -i $(KEY_PATH) -p $(PORT) $(SSH_USER)@$(HOST) \
		"rm -rf /tmp/out/* && \
		mkdir -p /tmp/out && \
		tar -xzf /tmp/ui_bundle.tar.gz -C /tmp/out && \
		rm /tmp/ui_bundle.tar.gz"
	
	@# 4. Удаляем локальный архив
	@rm ui_bundle.tar.gz
	@echo "--- [REMOTE] Starting test instance on port $(TEST_PORT) ---"
	ssh -i $(KEY_PATH) -p $(PORT) $(SSH_USER)@$(HOST) "chmod +x /tmp/$(TEST_BINARY_NAME) && \
		cd /tmp && \
		(export \$$(grep -v '^#' $(REMOTE_ENV_PATH) | xargs) && \
		(API_PORT=$(TEST_PORT) nohup ./$(TEST_BINARY_NAME) > ./$(TEST_BINARY_NAME).log 2>&1 &) </dev/null) & sleep 1"
	@echo "✔ Test instance is running. Use 'make tunnel-test' to see UI."

# Прибиваем процесс и вычищаем мусор за собой, чтобы не оставлять на сервере временные файлы 
# и не создавать конфликтов при повторных запусках
stop-test: ## Остановить тест на сервере и удалить все временные файлы (какашки)
	@echo "--- [REMOTE] Stopping test instance and cleaning up /tmp ---"
	ssh -i $(KEY_PATH) -p $(PORT) $(SSH_USER)@$(HOST) "pkill -x $(TEST_BINARY_NAME) || true; \
		rm -f /tmp/$(TEST_BINARY_NAME) /tmp/$(TEST_BINARY_NAME).log"
	@echo "✔ Remote /tmp is clean."

tunnel-test: ## Прокинуть порт 4000 через SSH (безопасный доступ к тестам)
	@echo "--- [NET] Mapping remote :$(TEST_PORT) to localhost:$(TEST_PORT) ---"
	@echo "✔ UI available at: http://localhost:$(TEST_PORT)"
	ssh -i $(KEY_PATH) -p $(PORT) -NL $(TEST_PORT):localhost:$(TEST_PORT) $(SSH_USER)@$(HOST)