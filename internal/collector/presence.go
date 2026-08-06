// Package collector содержит не только сборщик и блокировщик, но и in-memory представление текущего присутствия.
// PresenceCache нужен, чтобы API мог отвечать мгновенно, не обращаясь в Xray на каждый запрос.
package collector

import (
	"sync"
	"time"

	"github.com/ZeroD1vision/heimdallr-proxy/internal/models"
)

// TODO: я чет намудрил со структурами, userPresence - копия userStats, надо что то придумать, для изоляции и для ликивдации дублирования всех полей кроме lastActivity и email (в userStats)
type userPresence struct {
	lastActivity  time.Time
	totalUplink   int64
	totalDownlink int64
	wasOnline     bool
}

// PresenceCache — in-memory кэш онлайн-статусов и трафика.
// Коллектор пишет сюда на каждом тике через SetStats.
// API читает отсюда — без обращений к Xray напрямую.
// Хранит мапы по email и ownerID, чтобы не сортировать и не выделять 
// большой слайс каждый раз при запросе пользователей только одного web_user'а (админа).
type PresenceCache struct {
	mu      sync.RWMutex
	state   map[string]userPresence
	timeout time.Duration // порог неактивности для offline
	// Основной поиск по Email (для коллектора)
	byEmail map[string]*models.UserStats
	// Индекс по OwnerID (для API и WS-клиентов)
	// ownerID -> email -> *UserStats
	byOwner map[int64]map[string]*models.UserStats
}

// NewPresenceCache создаёт пустой кэш с дефолтным таймаутом неактивности.
// Значение timeout выбрано как быстрый, но не слишком шумный сигнал о живой активности.
func NewPresenceCache() *PresenceCache {
	return &PresenceCache{
		state:   make(map[string]userPresence),
		timeout: 10 * time.Second, // если 10 секунд нет трафика — считаем offline
		byEmail: make(map[string]*models.UserStats),
		byOwner: make(map[int64]map[string]*models.UserStats),
	}
}

// SetStats обновляет агрегированное состояние пользователя и переопределяет lastActivity только при новом трафике.
// Такое поведение позволяет считать пользователя online по факту движения данных, а не по факту наличия записи.
// SetStats обновляет статистику и время последней активности.
// Если трафик изменился (новые данные больше предыдущих) — обновляем lastActivity.
// Если трафик не изменился — lastActivity остается как была.
// Возвращает:
// isOnline — активен ли юзер прямо сейчас
// shouldNotify — нужно ли отправлять ивент в WS
func (p *PresenceCache) SetStats(ownerID int64, email string, uplink, downlink int64) (isOnline bool, shouldNotify bool) {
	p.mu.Lock()
	defer p.mu.Unlock()

	prev, exists := p.state[email]
	now := time.Now()

	// 1. Проверяем, был ли прирост трафика
	hasNewTraffic := uplink > prev.totalUplink || downlink > prev.totalDownlink

	// 2. Обновляем время активности только если есть новый трафик
	lastActivity := prev.lastActivity
	if hasNewTraffic || !exists {
		lastActivity = now
	}

	// 3. Определяем текущий онлайн-статус
	isOnline = now.Sub(lastActivity) < p.timeout

	// 4. Определяем, нужно ли уведомлять о смене статуса
	//    - Есть новый трафик
	//    - Или изменился статус (например, перешел из online в offline)
	//    - Или это первая запись юзера
	shouldNotify = hasNewTraffic || (prev.wasOnline != isOnline) || !exists

	p.state[email] = userPresence{
		lastActivity:  lastActivity,
		totalUplink:   uplink,
		totalDownlink: downlink,
		wasOnline:     isOnline,
	}

	// 5. Синхронизируем указатели в byEmail и byOwner
	stat, ok := p.byEmail[email]
	if !ok {
		stat = &models.UserStats{
			Email: email,
		}
		p.byEmail[email] = stat
	}

	// 6. Добавляем во вторичный индекс по OwnerID
	if _, ok := p.byOwner[ownerID]; !ok {
		p.byOwner[ownerID] = make(map[string]*models.UserStats)
	}
	p.byOwner[ownerID][email] = stat

	// 7. Обновляем значения объекта по ссылке
	stat.Uplink = uplink
	stat.Downlink = downlink
	stat.Online = isOnline

	return isOnline, shouldNotify
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

	result := make([]models.UserStats, 0, len(p.byEmail))
	for _, stat := range p.byEmail {
		result = append(result, *stat)
	}
	return result
}

// GetStatsByOwner возвращает метрики за O(K) ТОЛЬКО для указанного ownerID.
// Не делает полного обхода O(N) и лишней фильтрации.
func (p *PresenceCache) GetStatsByOwner(ownerID int64) []models.UserStats {
	p.mu.RLock()
	defer p.mu.RUnlock()

	ownerMap, ok := p.byOwner[ownerID]
	if !ok || len(ownerMap) == 0 {
		return []models.UserStats{}
	}

	result := make([]models.UserStats, 0, len(ownerMap))
	for _, stat := range ownerMap {
		result = append(result, *stat)
	}

	return result
}

// RemoveUser чистит память при удалении пользователя из системы.
func (p *PresenceCache) RemoveUser(ownerID int64, email string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	delete(p.state, email)
	delete(p.byEmail, email)

	if ownerMap, ok := p.byOwner[ownerID]; ok {
		delete(ownerMap, email)
		if len(ownerMap) == 0 {
			delete(p.byOwner, ownerID)
		}
	}
}