package db

import (
	"context"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

func (s *Store) SaveHistory(ctx context.Context, history *models.UserHistory) error {
	err := s.db.WithContext(ctx).Create(history).Error
	if err != nil {
		return fmt.Errorf("save history for %s: %w", history.Email, err)
	}
	return nil
}

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