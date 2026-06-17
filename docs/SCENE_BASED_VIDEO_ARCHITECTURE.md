# Scene-Based Video Architecture

> Правильный способ управления видеоресурсами для разных сцен (landing, auth) через API и кэширование

## Кратко: кто за что отвечает

- [web/ui/src/lib/api.ts](../web/ui/src/lib/api.ts) — типизированный клиент API; здесь `mediaApi.getMediaConfig()` запрашивает конфиг видео.
- [web/ui/src/lib/media-manager.ts](../web/ui/src/lib/media-manager.ts) — singleton-слой для резолва URL, кэша конфига и fallback-путей.
- [web/ui/src/lib/visual-orchestrator.ts](../web/ui/src/lib/visual-orchestrator.ts) — глобальная загрузка: инициализирует `mediaManager`, грузит видео и кадры, кладёт их в store.
- [web/ui/src/store/use-visual-store.ts](../web/ui/src/store/use-visual-store.ts) — глобальное состояние сцены (`landing` / `auth`) и ссылки на загруженные видео-элементы.
- [web/ui/src/components/layout/background-player.tsx](../web/ui/src/components/layout/background-player.tsx) — отрисовывает фон и выбирает правильный источник: `hero`, `data` или `auth`.
- [web/ui/src/components/auth/auth-layout.tsx](../web/ui/src/components/auth/auth-layout.tsx) — выставляет сцену `auth` на входе в auth-страницы и запускает auth-видео.
- [web/ui/src/app/(auth)/login/page.tsx](../web/ui/src/app/(auth)/login/page.tsx) — экран логина; переключает сцену на `auth` и использует auth-фон.
- [web/ui/src/app/(auth)/register/page.tsx](../web/ui/src/app/(auth)/register/page.tsx) — экран регистрации; делает то же самое для auth-сцены.

## Поток вызовов

1. Приложение монтируется → `initGlobalLoading()`.
2. `visual-orchestrator` вызывает `mediaManager.init()`.
3. `mediaManager` идёт в `mediaApi.getMediaConfig()` и получает URL видео.
4. Видео-элементы сохраняются в `useVisualStore`.
5. Auth-страницы вызывают `setScene('auth')`.
6. `background-player` видит сцену `auth` и рисует `videoElements.auth`.

---

## Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│                       User's Browser                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ App Mount                                              │  │
│  │  → initGlobalLoading()                                 │  │
│  │     ├─ mediaManager.init()                             │  │
│  │     │  └─ GET /api/media/assets                        │  │
│  │     │     → { hero, data, auth } URLs                  │  │
│  │     │     → Cache in mediaManager                      │  │
│  │     │                                                   │  │
│  │     ├─ loadVideo('hero') → use mediaManager URL        │  │
│  │     ├─ loadVideo('data') → use mediaManager URL        │  │
│  │     └─ loadVideo('auth') → use mediaManager URL        │  │
│  │        → Store video elements in useVisualStore        │  │
│  └────────────────────────────────────────────────────────┘  │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ User navigates to /login                               │  │
│  │  → LoginPage mounts                                    │  │
│  │     ├─ useEffect → store.setScene('auth')             │  │
│  │     ├─ Video already cached → instant switch!          │  │
│  │     └─ play() auth video                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ User submits login form                                │  │
│  │  → [Optional] refresh auth video                       │  │
│  │  → await mediaManager.refresh()                        │  │
│  │  → Load new video if config changed                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                         ↓                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Redirect to /dashboard                                 │  │
│  │  → LoginPage unmounts                                  │  │
│  │  → store.setScene('landing')                           │  │
│  │  → Resume landing video                                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
           ↑
           │ (only once during app init)
           │
    ┌──────────────────────────────────────────┐
    │          Backend                         │
    ├──────────────────────────────────────────┤
    │ GET /api/media/assets                    │
    │ Response:                                │
    │ {                                        │
    │   "assets": [                            │
    │     {"section": "hero", "url": "..."},  │
    │     {"section": "data", "url": "..."},  │
    │     {"section": "auth", "url": "..."}   │
    │   ]                                      │
    │ }                                        │
    └──────────────────────────────────────────┘
```

---

## Преимущества

| Feature | Benefit |
|---------|---------|
| **Scene-Based** | Decouple video logic from UI phase/step logic |
| **Cached** | Load once, switch instantly (no reload) |
| **API-Driven** | Change video URLs without code deploy |
| **Fallback** | Uses static paths if backend unavailable |
| **Scalable** | Easy to add new scenes (e.g., 'admin', 'onboarding') |

---

### Manual Browser Testing
1. Open DevTools → Network tab
2. Load app → should see `GET /api/media/assets` request
3. Navigate to `/login` → video switches instantly
4. Check console for any errors

---

## FAQ

**Q: Why not just load videos on-demand when auth page mounts?**
A: Scene-based is better because:
1. Videos are pre-loaded during app initialization (not blocking UI)
2. Switching scenes is instant (no reload delay)
3. Separates video logic from component logic (cleaner DX)

**Q: What if `/api/media/assets` is slow or fails?**
A: MediaManager has built-in fallback to static paths. Users won't notice.

**Q: Can I change video URLs without deploying?**
A: Yes! Update backend response, no frontend code changes needed.

**Q: How do I test this locally without backend?**
A: MediaManager falls back to static paths. Just ensure video files exist at `/assets/videos/720/...`.

---

## Related Files

- [lib/api.ts](../web/ui/src/lib/api.ts) — API client
- [lib/media-manager.ts](../web/ui/src/lib/media-manager.ts) — MediaManager singleton
- [lib/visual-orchestrator.ts](../web/ui/src/lib/visual-orchestrator.ts) — Global loading
- [store/use-visual-store.ts](../web/ui/src/store/use-visual-store.ts) — Global state
- [app/(auth)/login/page.tsx](../web/ui/src/app/(auth)/login/page.tsx) — Example usage
- [docs/AUTH_MEDIA_INTEGRATION.md](AUTH_MEDIA_INTEGRATION.md) — Full integration guide
