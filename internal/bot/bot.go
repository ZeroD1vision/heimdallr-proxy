package bot

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	telebot "gopkg.in/telebot.v3"
)

type Bot struct {
	api     *telebot.Bot
	adminID int64
}

func NewBot() (*Bot, error) {
	token := os.Getenv("TG_BOT_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("environment variable TG_BOT_TOKEN is not set")
	}

	adminID, err := strconv.ParseInt(os.Getenv("TG_ADMIN_ID"), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("environment variable TG_ADMIN_ID is not set or invalid: %w", err)
	}

	api, err := telebot.NewBot(telebot.Settings{
		Token:  token,
		Poller: &telebot.LongPoller{Timeout: 10 * time.Second},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Telegram bot: %w", err)
	}

	return &Bot{
		api:     api,
		adminID: adminID,
	}, nil
}

func (b *Bot) Start(getStats func() (string, error)) {
	b.api.Handle("start", telebot.HandlerFunc(func(c telebot.Context) error {
		return c.Send("Welcome to Heimdallr Proxy!")
	}))

	b.api.Handle("stats", telebot.HandlerFunc(func(c telebot.Context) error {
		if c.Sender().ID != b.adminID {
			return c.Send("You are not authorized to view stats.")
		}

		stats, err := getStats()
		if err != nil {
			log.Println("Error getting stats:", err)
			return c.Send("Failed to retrieve stats.")
		}

		return c.Send(stats)
	}))

	b.api.Start()
}
