package main

import (
	"context"
	"fmt"
	"log/slog"
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
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// Функция-помощник для красивого вывода в терминал без дублирования в логи
    printStatus := func(msg string, err error) {
        if err != nil {
            fmt.Fprintf(os.Stderr, "✘ %s: %v\n", msg, err)
            slog.Error(msg, "error", err) // В лог пишем только ошибку
        } else {
            fmt.Fprintf(os.Stderr, "✔ %s\n", msg)
            // Успешные шаги инициализации в логи можно не писать, чтобы не раздувать их
        }
    }

	slog.Info("heimdallr-proxy initialized", "version", "1.0.0")
	fmt.Println("✔ heimdallr-proxy initialized")

	// 1. Xray Client
    apiAddr := os.Getenv("XRAY_API_ADDR")
    if apiAddr == "" {
        apiAddr = "localhost:10085"
        slog.Warn("XRAY_API_ADDR not set", "using", apiAddr)
    }
    xrayClient := xray.NewClient(apiAddr)
    printStatus("Xray client initialized", nil)

	tgBot, err := bot.NewBot(xrayClient)
	if err != nil {
		fmt.Printf("✘ Failed to initialize bot: %v\n", err)
		os.Exit(1)
	}
	printStatus("Telegram bot module loaded", nil)

	// Тестовый запрос статистики при запуске
	slog.Info("Performing initial Xray gRPC connectivity check...")

	// 3. Connectivity Check (логируем только если упало)
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    _, err = xrayClient.GetStats(ctx)
    cancel()
    if err != nil {
        printStatus("Initial connectivity check (Xray might be offline)", err)
    } else {
        printStatus("Connection to Xray gRPC API established", nil)
    }

	maskedID := "*******"
	adminIDstr := strconv.FormatInt(tgBot.AdminID, 10)
	if len(adminIDstr) > 3 {
		maskedID = "*******" + adminIDstr[len(adminIDstr)-3:]
	}
	slog.Info("Service is running", "admin_id", maskedID)
	printStatus("Service is running", nil)

	addr := os.Getenv("API_PORT")
	if addr == "" {
		slog.Info("API_PORT environment variable is not set, default port 3000")
		fmt.Println("✘ API_PORT environment variable is not set")
		defaultPort := "3000"
		fmt.Printf("Using default port: %s\n", defaultPort)
		addr = defaultPort
	}
	apiServer := api.NewServer(addr, xrayClient)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	// 4. Запуск серверов
    go func() {
        if err := apiServer.Start(); err != nil {
            slog.Error("API server failed", "error", err)
            os.Exit(1)
        }
    }()

	go func() {
		fmt.Println("✔ Starting Telegram bot...")
		tgBot.Start()
	}()

	<-stop

	printStatus("Shutting down gracefully...", nil)
	ShutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Останавливаем API сервер
	if err := apiServer.Shutdown(ShutdownCtx); err != nil {
		printStatus("API server shutdown error", err)
	} else {
		printStatus("API server stopped", nil)
	}

	// 2. Останавливаем Telegram бота
	tgBot.Api.Stop()
	printStatus("Telegram bot stopped", nil)

	// 3. ЗАКРЫВАЕМ gRPC соединение
	if err := xrayClient.Close(); err != nil {
		printStatus("Failed to close Xray gRPC connection", err)
	} else {
		printStatus("Xray gRPC connection closed", nil)
	}

	printStatus("Heimdallr-proxy exited", nil)
}
