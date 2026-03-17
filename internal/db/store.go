package db

import (
	"fmt"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Store — единственная точка доступа к базе данных.
// Приватное поле db *gorm.DB не утекает наружу никогда.
// Все методы определены в соседних файлах пакета db.
type Store struct {
	db *gorm.DB
}

func NewStore(dsn string) (*Store, error) {
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
        return nil, fmt.Errorf("failed to connect db: %w", err)
    }

	// Автомиграция создает таблицы по указанным моделям при запуске
    if err := db.AutoMigrate(&models.User{}, &models.UserHistory{}); err != nil {
        return nil, fmt.Errorf("migration failed: %w", err)
    }
	
	return &Store{ db: db }, nil
}

