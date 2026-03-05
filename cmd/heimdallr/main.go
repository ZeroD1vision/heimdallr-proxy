package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/bot"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/xray"
)

func main() {
	// Инициализация логов
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	fmt.Println("✔ heimdallr-proxy initialized")
  addr := os.Getenv("XRAY_API_ADDR")
  if addr == "" {
    fmt.Println("✘ XRAY_API_ADDR environment variable is not set")
    defaultAddr := "localhost:10085"
    fmt.Printf("Using default address: %s\n", defaultAddr)
    addr = defaultAddr
  }
  xrayClient := xray.NewClient(addr)

	tgBot, err := bot.NewBot(xrayClient)
	if err != nil {
		fmt.Printf("✘ Failed to initialize bot: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("✔ Telegram bot module loaded")

	// Тестовый запрос статистики при запуске
	log.Println("Performing initial Xray gRPC connectivity check...")
	
  ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
  defer cancel()
  _, err = xrayClient.GetStats(ctx)
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
	tgBot.Start()
}
