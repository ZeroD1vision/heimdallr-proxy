package collector

import (
	"context"
	"log/slog"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// Enforcer описывает действие, которое коллектор может делегировать в фоновую очередь.
type Enforcer interface {
	BlockUser(ctx context.Context, user models.User) error
}

// Pipeline — простая bounded-очередь для фоновых enforcement-задач.
// Она отделяет сбор статистики от потенциально более дорогих операций блокировки.
type Pipeline struct {
	tasks    chan models.User
	enforcer Enforcer
	workers  int
}

// NewPipeline создаёт очередь с фиксированным буфером и числом воркеров.
func NewPipeline(enforcer Enforcer, workers int) *Pipeline {
	return &Pipeline{
		tasks:    make(chan models.User, 100),
		enforcer: enforcer,
		workers:  workers,
	}
}

// Run поднимает воркеры и возвращает управление сразу.
// Воркеры завершаются вместе с ctx.
func (p *Pipeline) Run(ctx context.Context) {
	for i := 0; i < p.workers; i++ {
		go p.worker(ctx, i)
	}
}

// worker последовательно обрабатывает задачи из очереди.
func (p *Pipeline) worker(ctx context.Context, id int) {
	slog.Debug("enforcer worker started", "worker_id", id)
	for {
		select {
		case user := <-p.tasks:
			slog.Info("processing enforcement task", "email", user.Email, "worker_id", id)
			if err := p.enforcer.BlockUser(ctx, user); err != nil {
				slog.Error("enforcement failed", "email", user.Email, "error", err)
			}
		case <-ctx.Done():
			slog.Debug("worker stopping", "worker_id", id)
			return
		}
	}
}

// Submit кладёт задачу в очередь без блокировки вызывающего кода.
// Если буфер заполнен, задача сознательно отбрасывается, чтобы не тормозить сбор статистики.
func (p *Pipeline) Submit(user models.User) {
	select {
	case p.tasks <- user:
	default:
		slog.Error("enforcement pipeline overflow, task dropped", "email", user.Email)
	}
}
