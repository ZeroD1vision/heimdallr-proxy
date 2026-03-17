package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SaveOTP сохраняет OTP код для пользователя.
// Используем Upsert (ON CONFLICT UPDATE) — один активный код на пользователя.
// Если код уже был — перезаписываем. Так не копятся "мёртвые" коды в таблице.
func (s *Store) SaveOTP(ctx context.Context, otp *models.OTPCode) error {
	result := s.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{ Name: "admin_id" }},
			DoUpdates: clause.AssignmentColumns([]string{"code", "expires_at", "used"}),
		}).
		Create(otp)
	if result.Error != nil {
		return fmt.Errorf("save otp for admin_id %d: %w", otp.AdminID, result.Error)
	}
	return nil
}
 
// FindValidOTP ищет неиспользованный непросроченный код для пользователя.
// Возвращает db.ErrNotFound если код не найден, истёк или уже использован.
func (s *Store) FindValidOTP(ctx context.Context, adminID int64, code string) (*models.OTPCode, error) {
	var otp models.OTPCode
	result := s.db.WithContext(ctx).
		Where("admin_id = ? AND code = ? AND expires_at > ? AND used = false", adminID, code, time.Now().UTC()).
		First(&otp)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}

	if result.Error != nil {
		return nil, fmt.Errorf("find otp for admin_id %d: %w", adminID, result.Error)
	}
	return &otp, nil
}


// MarkOTPUsed помечает код как использованный.
// Вызывается сразу после успешной верификации — код нельзя использовать повторно.
func (s *Store) MarkOTPUsed(ctx context.Context, id uint) error {
	result := s.db.WithContext(ctx).
		Model(&models.OTPCode{}).
		Where("id = ?", id).
		Update("used", true)
	if result.Error != nil {
		return fmt.Errorf("mark otp %d as used: %w", id, result.Error)
	}
	return nil
}
 
// DeleteExpiredOTPs удаляет все просроченные и использованные коды.
// Вызывать при старте и периодически — чтобы таблица не росла бесконечно.
func (s *Store) DeleteExpiredOTPs(ctx context.Context) error {
	result := s.db.WithContext(ctx).
		Where("expires_at < ? OR used = true", time.Now().UTC()).
		Delete(&models.OTPCode{})
	if result.Error != nil {
		return fmt.Errorf("delete expired otps: %w", result.Error)
	}
	return nil
}