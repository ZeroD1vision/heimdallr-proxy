package collector

import (
	"context"
	"log/slog"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

type Enforcer interface {
	BlockUser(ctx context.Context, user models.User) error
}

type Pipeline struct {
	tasks    chan models.User
	enforcer Enforcer
	workers  int
}

func NewPipeline(enforcer Enforcer, workers int) *Pipeline {
	return &Pipeline{
		tasks:    make(chan models.User, 100),
		enforcer: enforcer,
		workers:  workers,
	}
}

func (p *Pipeline) Run(ctx context.Context) {
	for i := 0; i < p.workers; i++ {
		go p.worker(ctx, i)
	}
}

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

func (p *Pipeline) Submit(user models.User) {
	select {
	case p.tasks <- user:
	default:
		slog.Error("enforcement pipeline overflow, task dropped", "email", user.Email)
    }
}