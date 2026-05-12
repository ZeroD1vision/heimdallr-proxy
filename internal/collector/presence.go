package collector

import (
	"sync"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

type userPresence struct {
	lastActivity time.Time
	totalUplink  int64
	totalDownlink int64
}

// PresenceCache — in-memory кэш онлайн-статусов и трафика.
// Коллектор пишет сюда на каждом тике через SetStats.
// API читает отсюда — без обращений к Xray напрямую.
type PresenceCache struct {
	mu       sync.RWMutex
	state    map[string]userPresence
	timeout  time.Duration // порог неактивности для offline
}


func NewPresenceCache() *PresenceCache {
	return &PresenceCache{
		state:   make(map[string]userPresence),
		timeout: 10 * time.Second, // если 10 секунд нет трафика — считаем offline
	}
}

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

// GetAllStats возвращает срез UserStats по всем пользователям в кэше.
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
