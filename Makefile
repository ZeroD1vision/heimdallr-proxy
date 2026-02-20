ifneq (,$(wildcard ./.env))
    include .env
    export
endif

.PHONY: build run tunnel dev

SSH_USER = $(SSH_DEPLOY_USER)
KEY_PATH = $(SSH_DEPLOY_USER_KEY)
HOST     = $(SSH_HOST)
PORT     = $(SSH_PORT)
L_PORT   = $(CLIENT_TUNNEL_PORT)
R_PORT   = $(SERVER_TUNNEL_PORT)

# Сборка под текущую ОС
build:
	@go build -o bin/heimdallr ./cmd/heimdallr

# Запуск локально
run: build
	@./bin/heimdallr

# Запуск туннеля
tunnel:
	@echo "Opening tunnel to $(HOST) port $(PORT)..."
	@pkill -f "^ssh.*$(L_PORT):127.0.0.1:$(R_PORT)" || true
	@ssh -i $(KEY_PATH) -p $(PORT) -f -N -L $(L_PORT):127.0.0.1:$(R_PORT) $(SSH_USER)@$(HOST)
	@echo "✔ Tunnel is ready: client port $(L_PORT) -> server port $(R_PORT)"

stop-tunnel:
	@echo "Closing tunnel to $(HOST) port $(PORT)..."
	@pkill -f "$(L_PORT):127.0.0.1:$(R_PORT)" && echo "✔ Tunnel closed" || echo "[warn] no tunnel found"

dev: tunnel run