.PHONY: build run tunnel dev

# Сборка под текущую ОС (для тестов на ноуте)
build:
	go build -o bin/heimdallr ./cmd/heimdallr

# Запуск локально
run: build
	./bin/heimdallr

# Туннель к серверу
tunnel:
	ssh -f -N -L 10085:127.0.0.1:10085 root@185.125.230.29

dev: tunnel run