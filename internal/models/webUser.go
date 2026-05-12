package models

import (
	"time"
)

// WebUserStatus описывает жизненный цикл веб-аккаунта.
//
// Переходы состояний:
//
//	PENDING   → ACTIVE     (после успешной привязки Telegram через бота)
//	ACTIVE    → SUSPENDED  (ручная блокировка администратором)
//	SUSPENDED → ACTIVE     (ручное восстановление)
type WebUserStatus string

const (
	// WebUserPending — аккаунт создан, Telegram ещё не привязан.
	// Пользователь видит QR/ссылку для привязки. Доступ к Xray-данным закрыт.
	WebUserPending WebUserStatus = "PENDING"

	// WebUserActive — Telegram привязан, полный доступ к UI.
	// Доступ к метрикам Xray зависит от наличия Xray-аккаунта (отдельная сущность).
	WebUserActive WebUserStatus = "ACTIVE"

	// WebUserSuspended — аккаунт заблокирован администратором вручную.
	WebUserSuspended WebUserStatus = "SUSPENDED"
)

// WebUser — учётная запись в веб-интерфейсе Heimdallr.
//
// Намеренно отделена от models.User (Xray-аккаунт):
//   - WebUser может существовать без Xray-аккаунта (до покупки подписки)
//   - Связь с Xray устанавливается по Email при необходимости
//   - Это позволяет менять логику биллинга независимо от auth-слоя
//
// Индексы:
//   - email       — уникальный, основной идентификатор для входа
//   - telegram_id — уникальный, NULL до привязки TG; используется ботом
//   - status      — для быстрой фильтрации активных/заблокированных
type WebUser struct {
	ID           uint          `json:"id"            gorm:"primaryKey"`
	Email        string        `json:"email"         gorm:"uniqueIndex;not null"`
	PasswordHash string        `json:"-"             gorm:"not null"` // bcrypt, никогда не сериализуется
	DisplayName  string        `json:"display_name"  gorm:"default:''"`
	TelegramID   *int64        `json:"telegram_id"   gorm:"uniqueIndex"` // NULL до привязки TG
	Status       WebUserStatus `json:"status"        gorm:"index;not null;default:'PENDING'"`
	LastLoginIP  string        `json:"last_login_ip" gorm:"default:''"`
	LastLoginAt  *time.Time    `json:"last_login_at"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

// IsActive возвращает true если пользователь прошёл привязку TG и не заблокирован.
func (u *WebUser) IsActive() bool {
	return u.Status == WebUserActive
}

// HasTelegram возвращает true если Telegram уже привязан к аккаунту.
func (u *WebUser) HasTelegram() bool {
	return u.TelegramID != nil
}
