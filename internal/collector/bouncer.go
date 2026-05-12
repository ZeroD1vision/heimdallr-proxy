// Package collector содержит фоновую часть системы: сбор статистики, очередь enforcement-задач,
// логику блокировки пользователей и in-memory presence-кэш. Этот пакет не обслуживает HTTP напрямую.
package collector

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// EnforcerStore описывает минимальный набор операций БД, который нужен только для блокировки пользователя.
// Интерфейс узкий специально: bouncer не должен зависеть от полноценного store-слоя.
type EnforcerStore interface {
	UpdateStatus(ctx context.Context, email string, isBlocked bool, expiresAt *time.Time) error
}

// EnforcerXray описывает сетевую часть блокировки: удаление пользователя из Xray inbound.
type EnforcerXray interface {
	RemoveUser(ctx context.Context, inboundTag, email string) error
}

// AlertNotifier отправляет оператору уведомление о срабатывании автоматической блокировки.
type AlertNotifier interface {
	SendAlert(ctx context.Context, text string) error
}

// Bouncer выполняет финальный этап enforcement-пайплайна: меняет статус в БД,
// вычищает пользователя из Xray и, при наличии notifier, сообщает о событии оператору.
type Bouncer struct {
	store    EnforcerStore
	xray     EnforcerXray
	notifier AlertNotifier
}

// NewBouncer собирает блокировщик из трёх узких зависимостей.
// Вынесен отдельно, чтобы pipeline получал готовый исполнимый объект, а не собирал зависимости сам.
func NewBouncer(store EnforcerStore, xray EnforcerXray, notifier AlertNotifier) *Bouncer {
	return &Bouncer{store: store, xray: xray, notifier: notifier}
}

// BlockUser переводит пользователя в заблокированное состояние и удаляет его из Xray.
// Это основной enforcement-путь, который вызывается асинхронно из Pipeline, чтобы не тормозить сбор статистики.
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
