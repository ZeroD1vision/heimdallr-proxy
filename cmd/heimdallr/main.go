package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/api"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/bot"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/xray"
)

func main() {
	// Инициализация логов
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	fmt.Println("✔ heimdallr-proxy initialized")
	apiAddr := os.Getenv("XRAY_API_ADDR")
	if apiAddr == "" {
		fmt.Println("✘ XRAY_API_ADDR environment variable is not set")
		defaultAddr := "localhost:10085"
		fmt.Printf("Using default address: %s\n", defaultAddr)
		apiAddr = defaultAddr
	}

	xrayClient := xray.NewClient(apiAddr)

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

	addr := os.Getenv("API_PORT")
	if addr == "" {
		log.Printf("API_PORT environment variable is not set, default port 3000")
		fmt.Println("✘ API_PORT environment variable is not set")
		defaultPort := "3000"
		fmt.Printf("Using default port: %s\n", defaultPort)
		addr = defaultPort
	}
	apiServer := api.NewServer(addr, xrayClient)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		err := apiServer.Start()
		if err != nil {
			log.Printf("API server error: %v", err)
			fmt.Printf("✘ API server failed to start: %v\n", err)
			os.Exit(1)
		}
	}()

	go func() {
		fmt.Println("✔ Starting Telegram bot...")
		tgBot.Start()
	}()

	<-stop
	fmt.Println("\n✔ Shutting down gracefully...")

  shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Second*10)
  defer cancel()

  if err := apiServer.Shutdown(shutdownCtx); err != nil {
    log.Printf("Error during API server shutdown: %v", err)
  }

  fmt.Println("✔ API server stopped")

  tgBot.Api.Stop()
  log.Println("✔ Telegram bot stopped")
  fmt.Println("✔ Telegram bot stopped")
  
  log.Println("✔ Heimdallr-proxy exited")
}
