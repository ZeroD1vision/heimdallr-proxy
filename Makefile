# ==============================================================================
# HEIMDALLR MAKEFILE
# ==============================================================================

# Подгружаем переменные окружения
ifneq (,$(wildcard ./.env))
    include .env
    export
endif

# --- Константы путей ---
FRONTEND_DIR := ./web/ui
BUILD_DIR    := ./bin
BINARY_NAME  := heimdallr
GO_PKG       := ./cmd/heimdallr

# --- Параметры туннеля (из .env) ---
SSH_USER := $(SSH_DEPLOY_USER)
KEY_PATH := $(SSH_DEPLOY_USER_KEY)
HOST     := $(SSH_HOST)
PORT     := $(SSH_PORT)
L_PORT   := $(CLIENT_TUNNEL_PORT)
R_PORT   := $(SERVER_TUNNEL_PORT)

# --- Настройки сборки ---
# Используем CGO_ENABLED=0 для создания переносимого бинарника (Static Binary)
# Это стандарт для Go в Docker и продакшене.
GO_BUILD_FLAGS := CGO_ENABLED=0 go build -trimpath -ldflags="-s -w"

# .PHONY сообщает make, что это команды, а не названия файлов на диске
.PHONY: help build ui-build ui-install go-build dev dev-ui tunnel stop clean db-reset

# Команда по умолчанию
all: build

help: ## Показать справку по всем командам. Флаг -h (или --no-filename) заставляет grep не выводить имена файлов.
	@grep -Eh '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ==============================================================================
# FRONTEND (NEXT.JS)
# ==============================================================================

ui-install: ## Установить зависимости фронтенда (только если package.json изменился)
	@echo "--- [UI] Checking dependencies ---"
	cd $(FRONTEND_DIR) && npm ci

ui-build: ui-install ## Собрать фронтенд в статичный HTML (out/)
	@echo "--- [UI] Building static export ---"
	cd $(FRONTEND_DIR) && npm run build

dev-ui: ## Запустить фронтенд в режиме горячей перезагрузки
	@echo "--- [UI] Starting dev server (localhost:3000) ---"
	cd $(FRONTEND_DIR) && npm run dev

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

tunnel: ## Открыть SSH туннель к удаленному серверу
	@echo "--- [NET] Opening tunnel to $(HOST) ---"
	@pkill -f "^ssh.*$(L_PORT):127.0.0.1:$(R_PORT)" || true
	@ssh -i $(KEY_PATH) -p $(PORT) -f -N -L $(L_PORT):127.0.0.1:$(R_PORT) $(SSH_USER)@$(HOST)
	@echo "✔ Tunnel active: localhost:$(L_PORT) -> remote:$(R_PORT)"

stop: ## Остановить все фоновые процессы (туннели, серверы)
	@echo "--- [CLEAN] Stopping processes ---"
	@pkill -f "^ssh.*$(L_PORT):127.0.0.1:$(R_PORT)" || true
	@pkill -f "$(BINARY_NAME)" || true
	@echo "✔ Done"

db-reset: ## Удалить локальную БД для чистого старта
	@rm -f data/heimdallr.db
	@echo "✔ Database reset"

clean: stop ## Полная очистка артефактов сборки
	rm -rf $(BUILD_DIR)
	rm -rf $(FRONTEND_DIR)/out
	rm -rf $(FRONTEND_DIR)/.next
	@echo "✔ Artifacts removed"