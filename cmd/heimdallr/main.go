package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/api"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/bot"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/collector"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/db"
	"github.com/ZeroD1vision/heimdallr-proxy/internal/xray"
)

func main() {
	// -------------------------------------------------------------------------
	// 1. Логирование — JSON для systemd/journald
	// -------------------------------------------------------------------------
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	slog.Info("heimdallr-proxy starting", "version", "0.3.0")

	// -------------------------------------------------------------------------
	// 2. Конфигурация — весь os.Getenv только здесь
	// -------------------------------------------------------------------------
	cfg := loadConfig()

	// -------------------------------------------------------------------------
	// 3. База данных
	// -------------------------------------------------------------------------
	store, err := db.NewStore(cfg.dbPath)
	if err != nil {
		slog.Error("failed to initialize database", "path", cfg.dbPath, "error", err)
		os.Exit(1)
	}
	slog.Info("database initialized", "path", cfg.dbPath)

	// -------------------------------------------------------------------------
	// 4. Xray gRPC клиент
	// -------------------------------------------------------------------------
	xrayClient, initErr := xray.NewClient(cfg.xrayAddr)
	if initErr != nil {
		// Не fatal — переподключится при первом вызове
		slog.Warn("xray initial dial failed, will retry on first request",
			"addr", cfg.xrayAddr,
			"error", initErr,
		)
	} else {
		slog.Info("xray client initialized", "addr", cfg.xrayAddr)
	}

	// Проверка соединения при старте (информационная, не fatal)
	checkCtx, checkCancel := context.WithTimeout(context.Background(), 5*time.Second)
	if _, err := xrayClient.GetUserStats(checkCtx, cfg.adminEmail); err != nil {
		slog.Warn("xray connectivity check failed", "error", err)
	} else {
		slog.Info("xray connectivity check passed")
	}
	checkCancel()

	// -------------------------------------------------------------------------
	// 5. Коллектор — фоновый сбор статистики в БД
	// -------------------------------------------------------------------------
	// store реализует collector.HistoryStore и collector.UserStore неявно —
	// у него есть методы SaveHistory и GetAllUsers.
	// xrayClient реализует collector.StatsClient — есть метод GetUserStats.
	statsCollector := collector.NewCollector(store, xrayClient, 30*time.Second)

	collectorCtx, collectorCancel := context.WithCancel(context.Background())
	defer collectorCancel()
	go statsCollector.Run(collectorCtx)

	// -------------------------------------------------------------------------
	// 6. API сервер
	// -------------------------------------------------------------------------
	// store реализует api.HistoryProvider — есть метод GetHistory.
	// xrayClient реализует api.StatsProvider — есть метод GetUserStats.
	apiServer := api.NewServer(cfg.apiPort, cfg.apiKey, cfg.adminEmail, xrayClient, store)

	// -------------------------------------------------------------------------
	// 7. Telegram бот
	// -------------------------------------------------------------------------
	// xrayClient реализует bot.StatsProvider — есть метод GetUserStats.
	tgBot, err := bot.NewBot(xrayClient, cfg.adminEmail)
	if err != nil {
		slog.Error("failed to initialize telegram bot", "error", err)
		os.Exit(1)
	}

	// -------------------------------------------------------------------------
	// 8. Запуск
	// -------------------------------------------------------------------------
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := apiServer.Start(); err != nil {
			slog.Error("api server stopped unexpectedly", "error", err)
			os.Exit(1)
		}
	}()

	go tgBot.Start()

	slog.Info("heimdallr-proxy running",
		"api_port", cfg.apiPort,
		"xray_addr", cfg.xrayAddr,
		"admin_email", cfg.adminEmail,
		"collect_interval", cfg.collectInterval,
	)
	fmt.Println("✔ heimdallr-proxy is running")

	// -------------------------------------------------------------------------
	// 9. Graceful shutdown — в обратном порядке запуска
	// -------------------------------------------------------------------------
	<-stop
	slog.Info("shutdown signal received")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	collectorCancel() // 1. Коллектор — перестаём писать в БД

	if err := apiServer.Shutdown(shutdownCtx); err != nil { // 2. API
		slog.Error("api server shutdown error", "error", err)
	}

	tgBot.Api.Stop() // 3. Бот

	if err := xrayClient.Close(); err != nil { // 4. gRPC
		slog.Error("xray client close error", "error", err)
	}

	slog.Info("heimdallr-proxy stopped")
}

type config struct {
	dbPath     string
	xrayAddr   string
	apiPort    string
	apiKey     string
	adminEmail string
	collectInterval time.Duration
}

func loadConfig() config {
	cfg := config{
		dbPath:     getEnv("DB_PATH", "data/heimdallr.db"),
		xrayAddr:   getEnv("XRAY_API_ADDR", "localhost:10085"),
		apiPort:    getEnv("API_PORT", "3000"),
		apiKey:     os.Getenv("API_ADMIN_TOKEN"),
		adminEmail: getEnv("ADMIN_EMAIL", "zd_pc"),
		collectInterval: parseDuration("COLLECT_INTERVAL", 30*time.Second),
	}

	if cfg.apiKey == "" {
		slog.Error("API_ADMIN_TOKEN is not set")
		os.Exit(1)
	}

	return cfg
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	slog.Warn("env not set, using default", "key", key, "default", fallback)
	return fallback
}
 
// parseDuration читает интервал из env в формате Go duration ("5s", "1m30s", "2m").
// Если переменная не задана или невалидна — возвращает fallback.
func parseDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		slog.Warn("invalid duration in env, using default",
			"key", key,
			"value", v,
			"default", fallback,
		)
		return fallback
	}
	return d
}