/**
 * @file dashboard-api.ts
 * @description Типизированные запросы для дашборда.
 *
 * Принцип: apiFetch — это расширение базового request() из api.ts.
 * Единственное отличие — он автоматически подставляет JWT из tokenStorage
 * в заголовок Authorization. Все остальные эндпоинты (auth, media) работают
 * без токена и продолжают использовать базовый request().
 *
 * Почему отдельная функция, а не модифицировать request()?
 * Потому что auth-эндпоинты вызываются до того, как токен вообще существует.
 * Смешение их логики приведет к пздцу потом.
 */

import { tokenStorage } from '@/lib/api';
import type { SpaceUser, ServerStats, HistoryEntry, UserStat } from '@/components/dashboard/types';

// ─── Авторизованный HTTP-клиент ───────────────────────────────────────────────

/**
 * Выполняет авторизованный HTTP-запрос к API.
 * Автоматически подставляет JWT-токен из sessionStorage.
 *
 * Отличия от базового request() в lib/api.ts:
 *  1. Добавляет Authorization: Bearer <token>
 *  2. Обрабатывает 204 No Content корректно (возвращает undefined)
 *  3. Бросает Error с текстом из поля error в теле ответа, если есть
 *
 * @throws {Error} Если токен отсутствует или запрос вернул !ok статус
 */
export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const jwt = tokenStorage.getToken();

  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      // Токен может отсутствовать только если вызов произошёл до логина —
      // такого быть не должно, но страхуемся на всякий случай. 
      // В этом случае просто не добавляем заголовок.
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({})); // Если там не JSON или например HTML (при ошибке)
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Dashboard API ────────────────────────────────────────────────────────────

/**
 * Набор эндпоинтов API, специфичных для дашборда.
 * Каждый метод - тонкая обёртка над apiFetch с явной типизацией возврата.
 *
 * Зачем выносить в объект, а не просто функции?
 * Для удобного мокирования в тестах
 */
export const dashboardApi = {
  /** Список всех пользователей пространства */
  getUsers: () =>
    apiFetch<SpaceUser[]>('/api/admin/users'),

  /** Суммарная статистика всех пользователей за текущую сессию */
  getStats: () =>
    apiFetch<UserStat[]>('/api/stats'),

  /** История трафика (последние N записей) */
  getHistory: (limit = 20) =>
    apiFetch<HistoryEntry[]>(`/api/history?limit=${limit}`),

  /** Заморозить доступ пользователя */
  blockUser: (email: string) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(email)}/block`, { method: 'PATCH' }),

  /** Восстановить доступ пользователя */
  unblockUser: (email: string) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(email)}/unblock`, { method: 'PATCH' }),

  /** Обнулить счётчик трафика */
  resetTraffic: (email: string) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(email)}/reset-traffic`, { method: 'POST' }),

  /** Удалить пользователя из БД и Xray (необратимо) */
  deleteUser: (email: string) =>
    apiFetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  /** Создать нового пользователя */
  createUser: (payload: Record<string, unknown>) =>
    apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
};