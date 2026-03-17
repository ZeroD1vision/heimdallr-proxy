package db

import (
	"context"
	"errors"
	"fmt"

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