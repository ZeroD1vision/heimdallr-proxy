package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/bot"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/xray"
)

func main() {
	// Инициализация логов
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	fmt.Println("✔ heimdallr-proxy initialized")

	tgBot, err := bot.NewBot()
	if err != nil {
		fmt.Printf("✘ Failed to initialize bot: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✔ Telegram bot module loaded")

	// Тестовый запрос статистики при запуске
	log.Println("Performing initial Xray gRPC connectivity check...")
	_, err = xray.GetStats()
	if err != nil {
		fmt.Printf("✘ Connectivity check failed: %v\n", err)
		// Не выходим, так как туннель может подняться позже или Xray быть временно оффлайн
	} else {
		fmt.Println("✔ Connection to Xray gRPC API established")
	}

	maskedID := "*******"
	adminIDstr := strconv.FormatInt(tgBot.AdminID, 10)
	if len(adminIDstr) > 3 {
		maskedID = "*******" + adminIDstr[len(adminIDstr)-3:]
	}
	fmt.Printf("✔ Service is running. Admin ID: %s\n", maskedID)

	// Запуск бота
	tgBot.Start(xray.GetStats)
}
