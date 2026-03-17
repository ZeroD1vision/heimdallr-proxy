package bot

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	telebot "gopkg.in/telebot.v3"
)

type Bot struct {
	Api           *telebot.Bot
	AdminID       int64
	adminEmail    string
	statsProvider models.StatsProvider
}

func NewBot(sp models.StatsProvider, adminEmail string) (*Bot, error) {
	token := os.Getenv("TG_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("environment variable TG_BOT_TOKEN is not set")
	}

	adminIDStr := os.Getenv("TG_ADMIN_ID")
	adminID, err := strconv.ParseInt(adminIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid TG_ADMIN_ID %q: %w", adminIDStr, err)
	}

	api, err := telebot.NewBot(telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Telegram bot: %w", err)
	}

	return &Bot{
		Api:           api,
		AdminID:       adminID,
		adminEmail:    adminEmail,
		statsProvider: sp,
	}, nil
}

func (b *Bot) Start() {
	b.Api.Handle("/start", telebot.HandlerFunc(b.handleStart))
	b.Api.Handle("/stats", telebot.HandlerFunc(b.handleStats))

	slog.Info("telegram bot started", "admin_id", maskID(b.AdminID))
	b.Api.Start()
}

// SendOTP отправляет одноразовый код администратору в Telegram.
// Реализует интерфейс api.Notifier — сервер вызывает этот метод при запросе 2FA.
// Метод публичный и принимает конкретный telegramID — в будущем можно слать разным юзерам.
func (b *Bot) SendOTP(ctx context.Context, telegramID int64, code string) error {
	recipient := &telebot.User{ID: telegramID}
	msg := fmt.Sprintf(
		"Ваш код подтверждения: <b>%s</b>\n\nДействует 5 минут. Никому не сообщайте.",
		code,
	)
	_, err := b.Api.Send(recipient, msg, telebot.ModeHTML)
	if err != nil {
		return fmt.Errorf("send otp to telegram_id %d: %w", telegramID, err)
	}
	return nil
}

func (b *Bot) handleStart(c telebot.Context) error {
	slog.Info("bot command received", "command", "/start", "user_id", c.Sender().ID)
	return c.Send("Welcome to Heimdallr Proxy!")
}

func (b *Bot) handleStats(c telebot.Context) error {
	slog.Info("bot command received", "command", "/stats", "user_id", c.Sender().ID)
 
	if c.Sender().ID != b.AdminID {
		slog.Warn("unauthorized /stats attempt",
			"user_id", c.Sender().ID,
			"username", c.Sender().Username,
		)
		return c.Send("Access denied.")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
 
	stats, err := b.statsProvider.GetUserStats(ctx, b.adminEmail)
	if err != nil {
		slog.Error("bot: failed to get stats", "error", err, "user_id", c.Sender().ID)
		return c.Send("Failed to retrieve statistics. Please try again later.")
	}
 
	msg := fmt.Sprintf(
		"Статистика (%s)\n↓ Down: %.2f MB\n↑ Up:   %.2f MB",
		stats.Email,
		float64(stats.Downlink)/(1024*1024),
		float64(stats.Uplink)/(1024*1024),
	)
	return c.Send(msg)
}

func maskID(id int64) string {
	s := strconv.FormatInt(id, 10)
	if len(s) <= 3 {
		return "*******"
	}
	return "*******" + s[len(s)-3:]
}