package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"gorm.io/gorm"
)

// ── WebUser CRUD ──────────────────────────────────────────────────────────────

// CreateWebUser сохраняет нового пользователя. Email уникален — вернёт ошибку при дубликате.
// Вызывающий код должен заранее захешировать пароль (bcrypt) и передать хеш в PasswordHash.
func (s *Store) CreateWebUser(ctx context.Context, u *models.WebUser) error {
	if err := s.db.WithContext(ctx).Create(u).Error; err != nil {
		return fmt.Errorf("create web_user %q: %w", u.Email, err)
	}
	return nil
}

// GetWebUserByEmail ищет пользователя по email (case-sensitive, как хранится в БД).
// Возвращает ErrNotFound если не существует.
func (s *Store) GetWebUserByEmail(ctx context.Context, email string) (*models.WebUser, error) {
	var u models.WebUser
	err := s.db.WithContext(ctx).
		Where("email = ?", email).
		First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get web_user by email %q: %w", email, err)
	}
	return &u, nil
}

// GetWebUserByTelegramID ищет пользователя по telegram_id.
// Используется ботом: получил START с session_id — находит юзера чтобы привязать TG.
// Возвращает ErrNotFound если не существует или TelegramID == NULL.
func (s *Store) GetWebUserByTelegramID(ctx context.Context, telegramID int64) (*models.WebUser, error) {
	var u models.WebUser
	err := s.db.WithContext(ctx).
		Where("telegram_id = ?", telegramID).
		First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get web_user by telegram_id %d: %w", telegramID, err)
	}
	return &u, nil
}

// GetWebUserByID ищет пользователя по первичному ключу.
func (s *Store) GetWebUserByID(ctx context.Context, id uint) (*models.WebUser, error) {
	var u models.WebUser
	if err := s.db.WithContext(ctx).First(&u, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get web_user by id %d: %w", id, err)
	}
	return &u, nil
}

// ActivateWebUser привязывает TelegramID и переводит аккаунт в ACTIVE.
// Вызывается ботом после того как пользователь нажал START по ссылке регистрации.
//
// Использует SELECT ... FOR UPDATE чтобы избежать гонки если пользователь
// дважды кликнул ссылку или бот получил дублированный апдейт.
func (s *Store) ActivateWebUser(ctx context.Context, userID uint, telegramID int64) error {
	result := s.db.WithContext(ctx).
		Model(&models.WebUser{}).
		Where("id = ? AND status = ?", userID, models.WebUserPending).
		Updates(map[string]any{
			"telegram_id": telegramID,
			"status":      models.WebUserActive,
			"updated_at":  time.Now().UTC(),
		})
	if result.Error != nil {
		return fmt.Errorf("activate web_user %d: %w", userID, result.Error)
	}
	// RowsAffected == 0 означает что юзер уже активен (повторный вызов — идемпотентно).
	return nil
}

// UpdateWebUserLogin фиксирует IP и время последнего входа.
// Вызывается при каждом успешном логине для аудита.
func (s *Store) UpdateWebUserLogin(ctx context.Context, userID uint, ip string) error {
	now := time.Now().UTC()
	result := s.db.WithContext(ctx).
		Model(&models.WebUser{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"last_login_ip": ip,
			"last_login_at": &now,
			"updated_at":    now,
		})
	if result.Error != nil {
		return fmt.Errorf("update web_user login meta %d: %w", userID, result.Error)
	}
	return nil
}

// SetWebUserStatus меняет статус аккаунта (ACTIVE ↔ SUSPENDED).
// Используется администратором через admin API.
func (s *Store) SetWebUserStatus(ctx context.Context, userID uint, status models.WebUserStatus) error {
	result := s.db.WithContext(ctx).
		Model(&models.WebUser{}).
		Where("id = ?", userID).
		Updates(map[string]any{
			"status":     status,
			"updated_at": time.Now().UTC(),
		})
	if result.Error != nil {
		return fmt.Errorf("set web_user status %d → %s: %w", userID, status, result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
