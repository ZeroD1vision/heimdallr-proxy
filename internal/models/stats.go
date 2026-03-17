package models

import (
	"context"
	"time"
)

// StatsProvider — интерфейс для получения живой статистики.
// Реализуется сервисным слоем (service.StatsService).
// Бот и API зависят от этого интерфейса, а не от конкретного сервиса.
type StatsProvider interface {
	GetUserStats(ctx context.Context, email string) (UserStats, error)
}

// UserStats — транспортная структура для передачи живых данных из Xray.
// Не является моделью БД — тегов gorm здесь нет намеренно.
// Uplink и Downlink хранятся в байтах (raw от Xray).
type UserStats struct {
	Email    string `json:"email"`
	Downlink int64  `json:"downlink_bytes"`
	Uplink   int64  `json:"uplink_bytes"`
}

// UserHistory — запись в БД, один снимок состояния трафика пользователя.
// Таблица растёт со временем — это временной ряд.
// Email здесь просто index (не uniqueIndex) — у одного пользователя много записей.
type UserHistory struct {
	ID        uint      `json:"id"          gorm:"primaryKey"`
	Email     string    `json:"email"       gorm:"index;not null"`
	Downlink  int64     `json:"downlink_bytes"`
	Uplink    int64     `json:"uplink_bytes"`
	
	ActiveConns int  `json:"active_conns"`
	IsBlocked   bool `json:"is_blocked"`

	CreatedAt time.Time `json:"created_at"  gorm:"index;not null"`
}

// User — учётная запись клиента.
// Центральная модель: связывает email (идентификатор в Xray),
// Telegram ID (для 2FA и бота) и UUID (для VLESS конфига).
type User struct {
	ID           uint   `json:"id"            gorm:"primaryKey"`
	Email        string `json:"email"         gorm:"uniqueIndex;not null"`
	TelegramID   int64  `json:"telegram_id"   gorm:"uniqueIndex"`
	XrayUUID     string `json:"xray_uuid"     gorm:"uniqueIndex;not null"`
	TrafficLimit int64  `json:"traffic_limit"` // байты, 0 = без лимита
	State        string `json:"state"         gorm:"default:'active'"` // active | blocked | pending
}