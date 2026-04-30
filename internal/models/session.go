package models

import "time"

// SessionStatus описывает состояние временной auth-сессии.
//
// Используется в двух флоу:
//  1. Регистрация: PENDING → APPROVED (бот подтвердил привязку TG)
//  2. 2FA при логине: PENDING → APPROVED (бот отправил OTP, юзер ввёл)
type SessionStatus string

const (
	// SessionPending — сессия создана, ожидает действия в Telegram.
	SessionPending SessionStatus = "PENDING"

	// SessionApproved — бот подтвердил сессию. Фронт получит JWT через polling.
	SessionApproved SessionStatus = "APPROVED"

	// SessionExpired — TTL истёк или сессия аннулирована вручную.
	SessionExpired SessionStatus = "EXPIRED"
)

// SessionKind разделяет две разные причины создания сессии.
// Это позволяет боту и фронту по-разному обрабатывать каждый тип.
type SessionKind string

const (
	// SessionKindRegister — сессия для привязки TG при регистрации.
	// После апрува: WebUser.Status → ACTIVE, WebUser.TelegramID = sender.ID
	SessionKindRegister SessionKind = "REGISTER"

	// SessionKindLogin2FA — сессия для подтверждения личности при логине.
	// После апрува: выдаётся JWT.
	SessionKindLogin2FA SessionKind = "LOGIN_2FA"
)

// AuthSession — краткоживущая запись, связывающая веб-сессию с действием в Telegram.
//
// TTL: 10 минут. После истечения — помечается EXPIRED и удаляется фоновым джобом.
//
// Поле OTPCode заполняется только для SessionKindLogin2FA —
// при регистрации код не нужен, достаточно факта нажатия START в боте.
type AuthSession struct {
	ID         string        `json:"id"           gorm:"primaryKey;type:text"`
	WebUserID  uint          `json:"web_user_id"  gorm:"index;not null"`
	Kind       SessionKind   `json:"kind"         gorm:"not null"`
	OTPCode    string        `json:"-"            gorm:"default:''"` // только для LOGIN_2FA; не сериализуется
	Status     SessionStatus `json:"status"       gorm:"index;not null;default:'PENDING'"`
	ExpiresAt  time.Time     `json:"expires_at"   gorm:"not null"`
	CreatedAt  time.Time     `json:"created_at"`
}