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
	Api     *telebot.Bot
	AdminID int64
}

func NewBot() (*Bot, error) {
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
		Api:     api,
		AdminID: adminID,
	}, nil
}

func (b *Bot) Start(getStats func() (string, error)) {
	b.Api.Handle("/start", telebot.HandlerFunc(func(c telebot.Context) error {
		return c.Send("Welcome to Heimdallr Proxy!")
	}))

	b.Api.Handle("/stats", telebot.HandlerFunc(func(c telebot.Context) error {
		if c.Sender().ID != b.AdminID {
			log.Printf("Unauthorized access attempt from user ID: %d", c.Sender().ID)
			return c.Send("Access denied")
		}

		stats, err := getStats()
		if err != nil {
			log.Printf("Internal error retrieving stats: %v", err)
			return c.Send("Failed to retrieve statistics")
		}

		return c.Send(stats)
	}))

	maskedID := "*******"
	adminIDstr := strconv.FormatInt(b.AdminID, 10)
	if len(adminIDstr) > 3 {
		maskedID = "*******" + adminIDstr[len(adminIDstr)-3:]
	}
	log.Printf("Telegram bot started for admin ID: %s", maskedID)
	b.Api.Start()
}
