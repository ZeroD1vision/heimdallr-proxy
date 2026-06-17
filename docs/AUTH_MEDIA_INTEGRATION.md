# Auth Pages — Scene-Based Video Loading

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│ API: mediaApi.getMediaConfig()                                │
│ GET /api/media/assets → { assets: [{section, url}, ...] }     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ MediaManager (lib/media-manager.ts)                           │
│ - Кэширует конфиг один раз                                    │
│ - Резолвит URL для каждой сцены ('hero', 'data', 'auth')      │
│ - Fallback на статические пути, если API недоступен           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Visual Orchestrator (lib/visual-orchestrator.ts)              │
│ - initGlobalLoading() инициализирует MediaManager             │
│ - Загружает видео для всех сцен через mediaManager            │
│ - Хранит видео-элементы в store.videoElements                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Visual Store (store/use-visual-store.ts)                      │
│ - scene: 'landing' | 'auth'                                   │
│ - videoElements: { hero, data, auth }                         │
│ - setScene() выбирает какое видео воспроизводить              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Auth Pages (app/(auth)/login/page.tsx)                        │
│ - Вызвать store.setScene('auth') в useEffect                  │
│ - Видео уже загружено → переключение мгновенно                │
└─────────────────────────────────────────────────────────────┘
```

---

## API бекенда

**Эндпоинт:** `GET /api/media/assets`

**Ответ от сервера:**
```json
{
  "assets": [
    {
      "section": "hero",
      "url": "/assets/videos/720/hero_section_animation_720.mp4",
      "format": "mp4",
      "bitrate": "720p"
    },
    {
      "section": "data",
      "url": "/assets/videos/720/data_section_animation_720.mp4"
    },
    {
      "section": "auth",
      "url": "/assets/videos/720/auth_section_animation_720.mp4"
    }
  ],
  "timestamp": 1704067200
}
```

**Важно:**
- URL может быть полный (`https://...`) или относительный (`/assets/...`)
- Если бэк недоступен → фронт использует fallback пути (`/assets/videos/720/{section}_section_animation_720.mp4`)
- Timestamp помогает отслеживать когда последний раз обновлялся конфиг

---

## Дебаг

В консоли браузера:

```javascript
// Проверить инициализирован ли MediaManager
const { mediaManager } = await import('@/lib/media-manager');
mediaManager.isInitialized();

// Получить конфиг видеоресурсов
mediaManager.getConfig();

// Получить URL для auth-видео
mediaManager.getVideoUrl('auth', '720');

// Пересоздать конфиг (refresh)
await mediaManager.refresh();

// Проверить текущую сцену
const { useVisualStore } = await import('@/store/use-visual-store');
useVisualStore.getState().scene;

// Посмотреть все видео-элементы
useVisualStore.getState().videoElements;
```

---

## Преимущества базированного на сценах подхода

| Аспект | Phase-Based | Scene-Based |
|--------|------------|-----------|
| **Инкапсуляция** | Видео привязано к UI-логике | Видео управляется глобально |
| **Кэширование** | Перезагрузка на каждую фазу | Загрузка один раз, переключение быстрое |
| **Масштабируемость** | Сложно добавить новые фазы | Просто добавить новые сцены |
| **Производительность** | Медленнее (перезагрузки) | Быстрее (только переключение) |
| **DX** | Нужна логика в компонентах | Простое `setScene()` |

---

## Пример работы

```
1. Загрузка приложения
   ↓
2. initGlobalLoading() вызывается
   ├─ mediaManager.init() → GET /api/media/assets
   ├─ Загружается hero video
   ├─ Загружается transition frames
   ├─ Загружается data video
   └─ Загружается auth video
   ↓
3. Юзер направляется в /login
   ↓
4. LoginPage монтируется
   ├─ вызывает store.setScene('auth')
   └─ играет auth-video (уже в кеше, не перезагружаем!)
   ↓
5. Юзер входит (логин)
   ↓
6. LoginPage размонтируется
   ├─ Вызывается store.setScene('landing')
   └─ landing-video продолжает играть
```
