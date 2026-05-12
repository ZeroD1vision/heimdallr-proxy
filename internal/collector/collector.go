// Package collector объединяет сбор живой статистики, запись истории и принятие решения о блокировке.
// Его задача — регулярно опрашивать Xray, обновлять presence-кэш и при необходимости ставить задачи в pipeline.
package collector

import (
	"context"
	"log/slog"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// CollectorStore описывает только те операции хранилища, которые нужны коллектору в ежедневном цикле.
// Объединяем в один интерфейс намеренно: оба метода работают с БД,
// это одна сущность с точки зрения коллектора.
// GetAllUsers вызывается каждый тик — список всегда актуален,
// новые пользователи подхватываются без перезапуска сервиса.
type CollectorStore interface {
	GetAllUsers(ctx context.Context) ([]models.User, error)
	SaveHistory(ctx context.Context, history *models.UserHistory) error
}

// XrayClient остаётся отдельным интерфейсом, потому что это другая подсистема: сетевой клиент к Xray.
// Store может быть доступен даже тогда, когда Xray временно недоступен, и наоборот.
type XrayClient interface {
	GetUserStats(ctx context.Context, email string) (models.UserStats, error)
	AddUser(ctx context.Context, user models.User) error
}

// PresenceStore — минимальный контракт для кэша online/offline статусов и текущих счетчиков трафика.
// Коллектор пишет в этот кэш после каждой попытки опроса Xray.
type PresenceStore interface {
	SetStats(email string, uplink, downlink int64)
	IsOnline(email string) bool
}

type Collector struct {
	store    CollectorStore
	xray     XrayClient
	presence PresenceStore
	pipeline *Pipeline
	interval time.Duration
}

// NewCollector собирает фоновый job, который раз в interval опрашивает Xray и синхронизирует состояние.
// Пайплайн передаётся внутрь, чтобы решения о блокировке не выполнялись в тике синхронно.
// NewCollector создаёт экземпляр сборщика.
// Он принимает pipeline — это наша точка входа в асинхронную обработку.
// Мы не блокируем основной цикл сбора (tick) тяжелыми операциями блокировки,
// а просто выкидываем задачу в пайплайн.
func NewCollector(store CollectorStore, xray XrayClient, presence PresenceStore, pipe *Pipeline, interval time.Duration) *Collector {
	return &Collector{
		store:    store,
		xray:     xray,
		presence: presence,
		pipeline: pipe,
		interval: interval,
	}
}

// Run запускает бесконечный цикл тика до отмены контекста.
// Это фоновый процесс, который нельзя вызвать дважды без понимания, что будет два независимых опроса.
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

// tick выполняет один полный проход по всем пользователям: читает БД, опрашивает Xray,
// обновляет presence-кэш, пишет историю и при необходимости ставит задачу на блокировку.
// tick — один цикл сбора
// В том числе делегируем задачи по блокировке пользователей в pipeline
func (c *Collector) tick(ctx context.Context) {
	users, err := c.store.GetAllUsers(ctx)
	if err != nil {
		slog.Error("collector: failed to fetch users", "error", err)
		return
	}

	for _, user := range users {
		// Пропускаем уже заблокированных
		if user.IsBlocked {
			continue
		}

		stats, err := c.xray.GetUserStats(ctx, user.Email)
		if err != nil {
			// Ошибка при получении stats — нет информации об активности
			// Оставляем lastActivity как была, IsOnline проверит timeout
			slog.Error("collector: failed to fetch stats from Xray API", "email", user.Email, "error", err)
			err := c.xray.AddUser(ctx, user) // Пытаемся добавить пользователя в Xray, если его там нет
			if err != nil {
				slog.Error("collector: failed to add user to Xray", "email", user.Email, "error", err)
			}
			continue
		}

		// Обновляем статистику и автоматически меняем online/offline на основе прироста трафика
		if c.presence != nil {
			c.presence.SetStats(user.Email, stats.Uplink, stats.Downlink)
		}

		// Лимит: Downlink + Uplink
		if user.TrafficLimit > 0 && (stats.Downlink+stats.Uplink) > user.TrafficLimit {
			slog.Warn("limit exceeded, submitting to pipeline", "email", user.Email)
			c.pipeline.Submit(user)
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
