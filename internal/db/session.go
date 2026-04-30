package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"gorm.io/gorm"
)

// ── AuthSession CRUD ──────────────────────────────────────────────────────────

// SaveSession создаёт новую auth-сессию.
// Каждый вызов создаёт новую запись — старые сессии не перезаписываются,
// это позволяет иметь несколько параллельных попыток входа (например с разных устройств).
// Фоновый джоб чистит просроченные записи через DeleteExpiredSessions.
func (s *Store) SaveSession(ctx context.Context, session *models.AuthSession) error {
	if err := s.db.WithContext(ctx).Create(session).Error; err != nil {
		return fmt.Errorf("save auth_session %s: %w", session.ID, err)
	}
	return nil
}

// FindValidSession ищет активную (не просроченную, не EXPIRED) сессию по ID.
//
// Возвращает ErrNotFound если:
//   - сессия не существует
//   - TTL истёк (expires_at < now)
//   - статус == EXPIRED
func (s *Store) FindValidSession(ctx context.Context, sessionID string) (*models.AuthSession, error) {
	var session models.AuthSession
	err := s.db.WithContext(ctx).
		Where(
			"id = ? AND expires_at > ? AND status != ?",
			sessionID,
			time.Now().UTC(),
			models.SessionExpired,
		).
		First(&session).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find auth_session %s: %w", sessionID, err)
	}
	return &session, nil
}

// UpdateSessionStatus переводит сессию в новый статус.
// Вызывается ботом (PENDING → APPROVED) и фоновым джобом (→ EXPIRED).
func (s *Store) UpdateSessionStatus(ctx context.Context, sessionID string, status models.SessionStatus) error {
	result := s.db.WithContext(ctx).
		Model(&models.AuthSession{}).
		Where("id = ?", sessionID).
		Update("status", status)
	if result.Error != nil {
		return fmt.Errorf("update auth_session status %s → %s: %w", sessionID, status, result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteExpiredSessions удаляет все просроченные и завершённые сессии.
// Вызывается при старте приложения и периодически (каждые 5 минут) из main.go.
func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	result := s.db.WithContext(ctx).
		Where("expires_at < ? OR status = ?", time.Now().UTC(), models.SessionExpired).
		Delete(&models.AuthSession{})
	if result.Error != nil {
		return fmt.Errorf("delete expired auth_sessions: %w", result.Error)
	}
	return nil
}