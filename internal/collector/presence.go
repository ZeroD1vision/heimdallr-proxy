package collector

import "sync"

type PresenceCache struct {
	mu    sync.RWMutex
	state map[string]bool
}

func NewPresenceCache() *PresenceCache {
	return &PresenceCache{state: make(map[string]bool)}
}

func (p *PresenceCache) Set(email string, online bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.state[email] = online
}

func (p *PresenceCache) IsOnline(email string) bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.state[email]
}
