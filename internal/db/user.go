package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"gorm.io/gorm"
)

// ErrNotFound возвращается когда запись не найдена.
// Определён здесь чтобы вызывающий код делал errors.Is(err, db.ErrNotFound)
// без импорта gorm — снаружи никто не должен знать что внутри GORM.
var ErrNotFound = errors.New("record not found")

func (s *Store) CreateUser(ctx context.Context, user *models.User) error {
	err := s.db.WithContext(ctx).Create(user).Error
	if err != nil {
		return fmt.Errorf("create user %s: %w", user.Email, err)
	}
	return nil
}

func (s *Store) GetAllUsers(ctx context.Context) ([]models.User, error) {
	var users []models.User
	err := s.db.WithContext(ctx).Find(&users).Error
	if err != nil {
		return nil, fmt.Errorf("fetch users: %w", err)
	}
	return users, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := s.db.WithContext(ctx).
		Where("email = ?", email).
		First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by email %s: %w", email, err)
	}
	return &user, nil
}

func (s *Store) FindUserByTelegramID(ctx context.Context, telegramID int64) (*models.User, error) {
	var user models.User
	err := s.db.WithContext(ctx).Where("telegram_id = ?", telegramID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("find user by telegram_id %d: %w", telegramID, err)
	}
	return &user, nil
}

func (s *Store) UpdateUser(ctx context.Context, user *models.User) error {
	err := s.db.WithContext(ctx).Save(user).Error
	if err != nil {
		return fmt.Errorf("update user %s: %w", user.Email, err)
	}
	return nil
}

func (s *Store) DeleteUser(ctx context.Context, email string) error {
	result := s.db.WithContext(ctx).Where("email = ?", email).Delete(&models.User{})
	if result.Error != nil {
		return fmt.Errorf("delete user %s: %w", email, result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateStatus обновляет статус блокировки и дату истечения доступа.
func (s *Store) UpdateStatus(ctx context.Context, email string, isBlocked bool, expiresAt *time.Time) error {
	user := models.User{
		IsBlocked: isBlocked,
		ExpiresAt: expiresAt,
	}

	result := s.db.WithContext(ctx).
		Model(&models.User{}).
		Where("email = ?", email).
		Select("is_blocked", "expires_at").
		Updates(&user)
	if result.Error != nil {
		return fmt.Errorf("update user status %s: %w", email, result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ResetTraffic сбрасывает лимит трафика пользователя (0 = без лимита).
func (s *Store) ResetTraffic(ctx context.Context, email string) error {
	result := s.db.WithContext(ctx).
		Model(&models.User{}).
		Where("email = ?", email).
		Update("traffic_limit", 0)
	if result.Error != nil {
		return fmt.Errorf("reset traffic for %s: %w", email, result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
