package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
	"github.com/glebarez/sqlite"
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
	// SQLite создаёт файл сам, но директория должна существовать заранее.
	dir := filepath.Dir(dsn)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create db directory %s: %w", dir, err)
	}

	// Добавляем параметры оптимизации к DSN
    // WAL позволяет читать и писать одновременно без блокировок
    optimizedDSN := dsn + "?_journal_mode=WAL&_busy_timeout=5000"

    db, err := gorm.Open(sqlite.Open(optimizedDSN), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Silent),
    })
    if err != nil {
        return nil, fmt.Errorf("failed to connect db: %w", err)
    }

    sqlDB, err := db.DB()
    if err != nil {
        return nil, err
    }

	// Ограничиваем до 1 соединения для записи, так как SQLite — это файл.
    // Это наш системный семафор на уровне драйвера.
    sqlDB.SetMaxOpenConns(1)

	// Автомиграция создает таблицы по указанным моделям при запуске
    if err := db.AutoMigrate(
		&models.User{}, 
		&models.UserHistory{},
		&models.OTPCode{},
	); err != nil {
        return nil, fmt.Errorf("migration failed: %w", err)
    }
	
	return &Store{ db: db }, nil
}

