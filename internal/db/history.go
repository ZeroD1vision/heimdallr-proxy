package db

import (
	"context"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// SaveHistory сохраняет снимок трафика как неизменяемую запись во временной ряд.
// История здесь используется и для аудита, и для построения графиков на фронте.
func (s *Store) SaveHistory(ctx context.Context, history *models.UserHistory) error {
	err := s.db.WithContext(ctx).Create(history).Error
	if err != nil {
		return fmt.Errorf("save history for %s: %w", history.Email, err)
	}
	return nil
}

// GetHistory возвращает последние записи истории по пользователю.
// Сортировка идёт от новых к старым, чтобы UI мог брать верхнюю часть выборки без дополнительной обработки.
func (s *Store) GetHistory(ctx context.Context, email string, limit int) ([]models.UserHistory, error) {
	var histories []models.UserHistory
	err := s.db.WithContext(ctx).
		Where("email = ?", email).
		Order("created_at DESC").
		Limit(limit).
		Find(&histories).Error
	if err != nil {
		return nil, fmt.Errorf("get history for %s: %w", email, err)
	}
	return histories, nil
}

// GetHistorySince возвращает историю с указанного момента.
// Используется для выборок по окну времени, когда нужен не весь ряд, а только свежий интервал.
func (s *Store) GetHistorySince(ctx context.Context, email string, since time.Time) ([]models.UserHistory, error) {
	var histories []models.UserHistory
	err := s.db.WithContext(ctx).
		Where("email = ? AND created_at >= ?", email, since).
		Order("created_at DESC").
		Find(&histories).Error
	if err != nil {
		return nil, fmt.Errorf("get history since %s for %s: %w", since.Format(time.RFC3339), email, err)
	}
	return histories, nil
}
