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
// Используется в ответе GET /api/stats — фронт получает массив,
// может отрисовать шкалы для каждого юзера и при желании сложить итог сам.
type UserStats struct {
	Email    string `json:"email"`
	Uplink   int64  `json:"uplink_bytes"`
	Downlink int64  `json:"downlink_bytes"`
	Online   bool   `json:"online"`
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

// OTPCode — одноразовый код для 2FA.
// TTL контролируется полем ExpiresAt — фоновая чистка удаляет просроченные записи.
// Один активный код на пользователя — при запросе нового старый перезаписывается.
type OTPCode struct {
	ID        uint      `json:"id"         gorm:"primaryKey"`
	AdminID   int64     `json:"admin_id"   gorm:"uniqueIndex;not null"`
	Code      string    `json:"-"          gorm:"not null"`
	ExpiresAt time.Time `json:"expires_at" gorm:"not null"`
	Used      bool      `json:"-"          gorm:"default:false"`
}