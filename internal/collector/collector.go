package collector

import (
	"context"
	"log/slog"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// CollectorStore — всё что коллектору нужно от хранилища.
// Объединяем в один интерфейс намеренно: оба метода работают с БД,
// это одна сущность с точки зрения коллектора.
// GetAllUsers вызывается каждый тик — список всегда актуален,
// новые пользователи подхватываются без перезапуска сервиса.
type CollectorStore interface {
	GetAllUsers(ctx context.Context) ([]models.User, error)
	SaveHistory(ctx context.Context, history *models.UserHistory) error
}

// XrayClient остаётся отдельным интерфейсом — это другая сущность (сетевой клиент),
// он может быть недоступен пока Store работает нормально.
type XrayClient interface {
	GetUserStats(ctx context.Context, email string) (models.UserStats, error)
}

type Collector struct {
	store    CollectorStore
	xray     XrayClient
	interval time.Duration
}

func NewCollector(store CollectorStore, xray XrayClient, interval time.Duration) *Collector {
	return &Collector{
		store: store,
		xray: xray,
		interval: interval,
	}
}

// Run запускает коллектор. Блокирует до отмены ctx.
// Вызывать: go collector.Run(ctx)
func (c *Collector) Run(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	slog.Info("collector started", "interval", c.interval)

	for {
		select {
		case <-ticker.C:
			c.tick(ctx)
		case <-ctx.Done():
			slog.Info("collector stopped")
			return
		}
	}
}

// tick — один цикл сбора
func (c *Collector) tick(ctx context.Context) {
	users, err := c.store.GetAllUsers(ctx)
	if err != nil {
		slog.Error("collector: failed to fetch users", "error", err)
		return
	}

	for _, user := range users {
		stats, err := c.xray.GetUserStats(ctx, user.Email)
		if err != nil {
			// Ошибка одного пользователя не останавливает остальных.
			slog.Error("collector: failed to fetch stats from Xray API", "email", user.Email, "error", err)
			continue
		}

		history := &models.UserHistory{
			Email:     stats.Email,
			Downlink:  stats.Downlink,
			Uplink:    stats.Uplink,
			CreatedAt: time.Now().UTC(),
		}
 
		if err := c.store.SaveHistory(ctx, history); err != nil {
			slog.Error("collector: failed to save history", "email", user.Email, "error", err)
		}
	}
}