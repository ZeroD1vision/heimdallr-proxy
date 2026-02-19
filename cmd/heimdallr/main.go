package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

func main() {
	log.Println("heimdallr-proxy is running...")
	err := godotenv.Load()
	if err != nil {
		val := os.Getenv("APP_ENV")
		log.Printf("Значение APP_ENV из системы: [%s]", val)
		log.Fatalf("Критическая ошибка: %v", err) // Если файла нет, программа тут же остановится с ошибкой
	}

	// Тут в будущем мы запустим:
	// 1. Подключение к БД
	// 2. gRPC клиент к Xray
	// 3. Telegram бот
	// 4. API сервер для Vue

	// fmt.Println("Heimdallr: proxy is ready to handle requests.")

	if os.Getenv("APP_ENV") == "local" {
		log.Println("Running in local environment. Downloading .env file...")
		log.Printf("Starting Heimdallr in %s mode...", os.Getenv("APP_ENV"))
	}
}
