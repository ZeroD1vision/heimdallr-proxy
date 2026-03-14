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
	statsProvider models.StatsProvider
}

func NewBot(sp models.StatsProvider) (*Bot, error) {
	token := os.Getenv("TG_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("environment variable TG_BOT_TOKEN is not set")
	}

	adminID, err := strconv.ParseInt(os.Getenv("TG_ADMIN_ID"), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid TG_ADMIN_ID: %w", err)
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
		statsProvider: sp,
	}, nil
}

func (b *Bot) Start() {
	b.Api.Handle("/start", telebot.HandlerFunc(func(c telebot.Context) error {
		slog.Info("bot command received", "command", "/start", "user_id", c.Sender().ID)
		return c.Send("Welcome to Heimdallr Proxy!")
	}))

	b.Api.Handle("/stats", telebot.HandlerFunc(func(c telebot.Context) error {
		slog.Info("bot command received", "command", "/stats", "user_id", c.Sender().ID)
		if c.Sender().ID != b.AdminID {
			slog.Warn("Unauthorized access attempt to /stats command", 
				"user_id", c.Sender().ID,
				"username", c.Sender().Username,
			)
			slog.Error("Unauthorized access attempt to /stats command", "user_id", c.Sender().ID)
			
			return c.Send("Access denied")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		stats, err := b.statsProvider.GetStats(ctx)
		if err != nil {
			slog.Error("Internal error retrieving stats", "error", err)
			return c.Send("Failed to retrieve statistics")
		}

		msg := fmt.Sprintf("Статистика:\nEmail: %s\n↓ Down: %.2f\n↑ Up: %.2f", stats.Email, stats.Downlink, stats.Uplink)
		return c.Send(msg)
	}))

	maskedID := "*******"
	adminIDstr := strconv.FormatInt(b.AdminID, 10)
	if len(adminIDstr) > 3 {
		maskedID = "*******" + adminIDstr[len(adminIDstr)-3:]
	}
	slog.Info("Telegram bot started", "admin_id", maskedID)
	b.Api.Start()
}
