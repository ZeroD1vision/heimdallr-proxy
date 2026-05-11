package collector

import (
	"sync"
	"time"
)

type userPresence struct {
	lastActivity time.Time
	totalUplink  int64
	totalDownlink int64
}

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
