package collector

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// EnforcerStore описывает методы БД, нужные для блокировки
type EnforcerStore interface {
	UpdateUser(ctx context.Context, user *models.User) error
}

type Bouncer struct {
	store EnforcerStore
	// Здесь позже появится xrayClient для gRPC вызовов
}

// ВЫШЫБАЛА - отвечает за блокировку юзера в БД и отключение его от Xray.
func NewBouncer(store EnforcerStore) *Bouncer {
	return &Bouncer{store: store}
}

func (b *Bouncer) BlockUser(ctx context.Context, user models.User) error {
	slog.Warn("BOUNCER: blocking user", "email", user.Email)

	// 1. Меняем статус в базе данных
	user.State = "blocked"
	if err := b.store.UpdateUser(ctx, &user); err != nil {
		return fmt.Errorf("db update failed: %w", err)
	}

	// 2. TODO: Здесь будет вызов gRPC к Xray, чтобы реально отключить юзера
	// b.xray.RemoveUser(ctx, user.Email)

	slog.Info("BOUNCER: user successfully blocked", "email", user.Email)
	return nil
}