// Package collector содержит не только сборщик и блокировщик, но и in-memory представление текущего присутствия.
// PresenceCache нужен, чтобы API мог отвечать мгновенно, не обращаясь в Xray на каждый запрос.
package collector

import (
	"sync"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

type userPresence struct {
	lastActivity  time.Time
	totalUplink   int64
	totalDownlink int64
}

// PresenceCache — in-memory кэш онлайн-статусов и трафика.
// Коллектор пишет сюда на каждом тике через SetStats.
// API читает отсюда — без обращений к Xray напрямую.
type PresenceCache struct {
	mu      sync.RWMutex
	state   map[string]userPresence
	timeout time.Duration // порог неактивности для offline
}

// NewPresenceCache создаёт пустой кэш с дефолтным таймаутом неактивности.
// Значение timeout выбрано как быстрый, но не слишком шумный сигнал о живой активности.
func NewPresenceCache() *PresenceCache {
	return &PresenceCache{
		state:   make(map[string]userPresence),
		timeout: 10 * time.Second, // если 10 секунд нет трафика — считаем offline
	}
}

// SetStats обновляет агрегированное состояние пользователя и переопределяет lastActivity только при новом трафике.
// Такое поведение позволяет считать пользователя online по факту движения данных, а не по факту наличия записи.
// SetStats обновляет статистику и время последней активности.
// Если трафик изменился (новые данные больше предыдущих) — обновляем lastActivity.
// Если трафик не изменился — lastActivity остается как была.
func (p *PresenceCache) SetStats(email string, uplink, downlink int64) {
	p.mu.Lock()
	defer p.mu.Unlock()

	prev, exists := p.state[email]
	now := time.Now()

	// Проверяем, был ли прирост трафика
	hasNewTraffic := uplink > prev.totalUplink || downlink > prev.totalDownlink

	// Обновляем время активности только если есть новый трафик
	lastActivity := prev.lastActivity
	if hasNewTraffic || !exists {
		lastActivity = now
	}

	p.state[email] = userPresence{
		lastActivity:  lastActivity,
		totalUplink:   uplink,
		totalDownlink: downlink,
	}
}

// IsOnline быстро проверяет, был ли пользователь активен в пределах timeout.
// Этот метод нужен API и admin-эндпоинтам для дешёвой отрисовки статуса.
// IsOnline возвращает true если пользователь был активен в пределах timeout.
func (p *PresenceCache) IsOnline(email string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()

	presence, exists := p.state[email]
	if !exists {
		return false
	}

	// Если активность была недавно — онлайн
	if time.Since(presence.lastActivity) < p.timeout {
		return true
	}

	// Если давно неактивен — офлайн
	return false
}

// GetAllStats отдаёт фронту снимок всех известных пользователей сразу одним массивом.
// Это позволяет UI сам решать, как агрегировать данные и какие метрики показывать.
// GetAllStats возвращает слайс UserStats по всем пользователям в кэше.
//
// Фронт получает один объект со всеми юзерами — может отрисовать
// индивидуальные шкалы трафика и при желании агрегировать на своей стороне.
// Один RLock на весь проход — не держим мьютекс дольше необходимого.
func (p *PresenceCache) GetAllStats() []models.UserStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	result := make([]models.UserStats, 0, len(p.state))
	now := time.Now()

	for email, presence := range p.state {
		result = append(result, models.UserStats{
			Email:    email,
			Uplink:   presence.totalUplink,
			Downlink: presence.totalDownlink,
			Online:   now.Sub(presence.lastActivity) < p.timeout,
		})
	}
	return result
}
