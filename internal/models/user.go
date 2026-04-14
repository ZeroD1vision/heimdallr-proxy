package models

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User — учётная запись клиента для управления доступом в Xray.
// UUID генерируется автоматически на стороне бэкенда (BeforeCreate),
// чтобы исключить доверие к внешнему вводу.
type User struct {
	ID           uint       `json:"id"             gorm:"primaryKey"`
	Email        string     `json:"email"          gorm:"uniqueIndex;not null"`
	TelegramID   int64      `json:"telegram_id"    gorm:"uniqueIndex"`
	// UUID хранится в legacy-совместимой колонке xray_uuid.
	// Это позволяет обновлять сервис без ручного rename колонки на проде.
	UUID         string     `json:"uuid"           gorm:"column:xray_uuid;uniqueIndex;not null"`
	InboundTag   string     `json:"inbound_tag"    gorm:"index;not null;default:'inbound-main'"`
	Flow         string     `json:"flow"           gorm:"default:''"`
	VlessFlow    string     `json:"vless_flow"     gorm:"default:''"`
	TrafficLimit int64      `json:"traffic_limit"`
	IsBlocked    bool       `json:"is_blocked"     gorm:"index;default:false"`
	ExpiresAt    *time.Time `json:"expires_at"     gorm:"index"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// BeforeCreate гарантирует RFC4122 UUID до вставки записи в БД.
func (u *User) BeforeCreate(_ *gorm.DB) error {
	if u.Email == "" {
		return fmt.Errorf("user email must not be empty")
	}
	if u.UUID == "" {
		u.UUID = uuid.NewString()
	}
	if _, err := uuid.Parse(u.UUID); err != nil {
		return fmt.Errorf("invalid uuid format: %w", err)
	}
	if u.InboundTag == "" {
		u.InboundTag = "inbound-main"
	}
	return nil
}
