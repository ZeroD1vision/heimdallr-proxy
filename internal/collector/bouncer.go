package collector

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// EnforcerStore описывает методы БД, нужные для блокировки
type EnforcerStore interface {
	UpdateStatus(ctx context.Context, email string, isBlocked bool, expiresAt *time.Time) error
}

type EnforcerXray interface {
	RemoveUser(ctx context.Context, inboundTag, email string) error
}

type AlertNotifier interface {
	SendAlert(ctx context.Context, text string) error
}

type Bouncer struct {
	store    EnforcerStore
	xray     EnforcerXray
	notifier AlertNotifier
}

// ВЫШЫБАЛА - отвечает за блокировку юзера в БД и отключение его от Xray.
func NewBouncer(store EnforcerStore, xray EnforcerXray, notifier AlertNotifier) *Bouncer {
	return &Bouncer{store: store, xray: xray, notifier: notifier}
}

func (b *Bouncer) BlockUser(ctx context.Context, user models.User) error {
	slog.Warn("BOUNCER: blocking user", "email", user.Email)

	// 1. Меняем статус в базе данных
	if err := b.store.UpdateStatus(ctx, user.Email, true, user.ExpiresAt); err != nil {
		return fmt.Errorf("db update failed: %w", err)
	}

	// 2. Удаляем пользователя из inbound в Xray.
	if err := b.xray.RemoveUser(ctx, user.InboundTag, user.Email); err != nil {
		return fmt.Errorf("xray remove failed: %w", err)
	}

	if b.notifier != nil {
		msg := fmt.Sprintf("🚨 Пользователь %s автоматически заблокирован: превышен лимит трафика", user.Email)
		if err := b.notifier.SendAlert(ctx, msg); err != nil {
			slog.Error("failed to send block alert", "email", user.Email, "error", err)
		}
	}

	slog.Info("BOUNCER: user successfully blocked", "email", user.Email)
	return nil
}