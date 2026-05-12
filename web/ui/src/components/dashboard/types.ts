/**
 * @file types.ts
 * @description Все типы данных для дашборда.
 *
 * Принцип: типы живут отдельно от логики и компонентов.
 * Любой файл в папке dashboard может импортировать отсюда,
 * не создавая циклических зависимостей.
 */

// ─── Сущности API ─────────────────────────────────────────────────────────────

/**
 * Пользователь VPN-пространства (SpaceUser).
 * Приходит с бэка из /api/admin/users.
 *
 * uplink_bytes / downlink_bytes — опциональны: бэк возвращает их
 * только когда пользователь активен прямо сейчас (есть xray-сессия).
 */
export interface SpaceUser {
  id: number;
  email: string;
  telegram_id: number;
  inbound_tag: string;
  vless_flow: string;
  traffic_limit: number;
  expires_at: string | null;
  is_blocked: boolean;
  created_at: string;
  status: 'online' | 'offline' | 'blocked';
  /** Текущий аплинк за сессию (байты). Присутствует только у онлайн-юзеров. */
  uplink_bytes?: number;
  /** Текущий даунлинк за сессию (байты). Присутствует только у онлайн-юзеров. */
  downlink_bytes?: number;
}

/**
 * Суммарная статистика сервера за текущую сессию.
 * Приходит с бэка из /api/stats.
 */
export interface ServerStats {
  email: string;
  uplink_bytes: number;
  downlink_bytes: number;
}

/**
 * Статистика одного пользователя из presence-кэша бэка.
 * Приходит с /api/stats как массив — по одному объекту на каждого юзера.
 *
 * Отличие от SpaceUser: здесь только живые данные текущей сессии из Xray.
 * SpaceUser — это запись из БД (лимиты, флаги, метаданные).
 * UserStat — это то что коллектор видит прямо сейчас.
 */
export interface UserStat {
  email: string;
  uplink_bytes: number;
  downlink_bytes: number;
  online: boolean;
}
 
/**
 * SpaceUser обогащённый живой статистикой из presence-кэша.
 * Получается слиянием SpaceUser + UserStat по полю email в use-dashboard.
 * Именно этот тип используют все компоненты — UserRow, TrafficBar и т.д.
 */
export type EnrichedUser = SpaceUser & {
  uplink_bytes: number;
  downlink_bytes: number;
};
 
/**
 * Одна запись в журнале безопасности.
 * Приходит с бэка из /api/history.
 */
export interface HistoryEntry {
  id: number;
  email: string;
  uplink_bytes: number;
  downlink_bytes: number;
  recorded_at: string;
}

// ─── UI-специфичные типы ──────────────────────────────────────────────────────

/**
 * Описание действия, ожидающего подтверждения в модальном окне.
 * null — модалка закрыта.
 */
export type ConfirmAction = {
  email: string;
  kind: 'block' | 'unblock' | 'reset' | 'delete';
} | null;

/**
 * Поля формы создания нового пользователя.
 * Живут как строки — конвертация в числа/даты происходит
 * в submit-обработчике перед отправкой на бэк.
 */
export interface CreateForm {
  email: string;
  telegram_id: string;
  inbound_tag: string;
  traffic_gb: string;
  expires_at: string;
}

/**
 * Фильтр списка пользователей.
 * 'all' — без фильтра, остальные значения совпадают со SpaceUser.status.
 */
export type UserFilter = 'all' | 'online' | 'offline' | 'blocked';