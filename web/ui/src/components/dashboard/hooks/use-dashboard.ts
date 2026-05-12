/**
 * @file use-dashboard.ts
 * @description Хук, инкапсулирующий всю бизнес-логику дашборда.
 *
 * Принцип: компонент DashboardPage не должен знать ничего про fetch,
 * polling, encodeURIComponent или структуру API-ответов.
 * Он только рендерит то, что возвращает этот хук.
 *
 * Что живёт здесь:
 *  - загрузка данных (users, stats, history)
 *  - polling каждые 10 секунд
 *  - выполнение действий (block/unblock/reset/delete)
 *  - derived state (online, frozen, filtered)
 *  - локальный UI-стейт (filter, search, confirmAction, showCreate)
 *  - нотификации об успехе/ошибке синхронизации и действиях над пользователями
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useNotify, NotificationPresets } from '@/hooks/use-notify';
import { tokenStorage } from '@/lib/api';
import { useVisualStore } from '@/store/use-visual-store';
import { dashboardApi } from '@/components/dashboard/api/dashboard-api';
import type { SpaceUser, ServerStats, HistoryEntry, ConfirmAction, UserFilter, UserStat, EnrichedUser } from '@/components/dashboard/types';

// ─── Утилита слияния ──────────────────────────────────────────────────────────
 
/**
 * Мержит список пользователей из БД с живой статистикой из presence-кэша.
 *
 * Почему здесь, а не в компоненте?
 * Компонент не должен знать про два разных источника данных.
 * Он получает уже готовый EnrichedUser и просто рендерит.
 *
 * Логика: строим Map<email, UserStat> из массива stats O(n),
 * затем проходим по users O(n) — итого O(n) вместо O(n²).
 */
function mergeUsersWithStats(users: SpaceUser[], stats: UserStat[]): EnrichedUser[] {
  const statsMap = new Map(stats.map((s) => [s.email, s]));
 
  return users.map((u) => {
    const live = statsMap.get(u.email);
    return {
      ...u,
      // Живые данные из presence-кэша, если юзер там есть.
      // Fallback 0 — юзер ещё ни разу не появлялся в кэше (новый или оффлайн с начала сессии).
      uplink_bytes:   live?.uplink_bytes   ?? 0,
      downlink_bytes: live?.downlink_bytes ?? 0,
    };
  });
}

// ─── Константы ────────────────────────────────────────────────────────────────

/** Интервал автоматической синхронизации данных в мс */
const POLL_INTERVAL_MS = 10_000;

// ─── Хук ──────────────────────────────────────────────────────────────────────

export function useDashboard() {
  const router = useRouter();
  const { notify } = useNotify();

  // ── Данные с бэка ─────────────────────────────────────────────────────────
  const [users,   setUsers  ] = useState<SpaceUser[]>([]);
  const [stats,   setStats  ] = useState<UserStat[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── UI-стейт ──────────────────────────────────────────────────────────────
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showCreate,    setShowCreate   ] = useState(false);
  const [filter,        setFilter       ] = useState<UserFilter>('all');
  const [search,        setSearch       ] = useState('');

  // Рефы для дедупликации нотификаций:
  // не хотим показывать "Dashboard synced" при каждом тике поллинга —
  // только один раз при первой успешной загрузке и после ошибок
  const hasAnnouncedSyncRef      = useRef(false);
  const hasAnnouncedSyncErrorRef = useRef(false);

  // ── Инициализация сцены ───────────────────────────────────────────────────

  useEffect(() => {
    // Защита роута: если токена нет — редиректим на логин
    if (!tokenStorage.getToken()) {
      router.replace('/login');
      return;
    }

    // Переключаем фоновое видео на dashboard-сцену, пока что заглушка - auth
    useVisualStore.getState().setScene('auth');
  }, [router]);

  // ── Загрузка данных ───────────────────────────────────────────────────────

  /**
   * Параллельно загружает users, stats и history.
   * Использует Promise.allSettled, чтобы частичный сбой одного эндпоинта
   * не блокировал отображение данных из остальных двух.
   */
  const fetchAll = useCallback(async () => {
    const [usersRes, statsRes, histRes] = await Promise.allSettled([
      dashboardApi.getUsers(),
      dashboardApi.getStats(),
      dashboardApi.getHistory(20),
    ]);

    if (usersRes.status === 'fulfilled') setUsers(usersRes.value ?? []);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    if (histRes.status === 'fulfilled')  setHistory(histRes.value ?? []);

    const allSuccess =
      usersRes.status === 'fulfilled' &&
      statsRes.status === 'fulfilled' &&
      histRes.status === 'fulfilled';

    if (allSuccess) {
      if (!hasAnnouncedSyncRef.current) {
        notify(NotificationPresets.success('Dashboard synced', 'dashboard_sync'));
        hasAnnouncedSyncRef.current = true;
      }
      // Сбрасываем флаг ошибки — следующий сбой снова покажет уведомление
      hasAnnouncedSyncErrorRef.current = false;
    } else {
      if (!hasAnnouncedSyncErrorRef.current) {
        notify(NotificationPresets.error('Sync failed', 'dashboard_fetch'));
        hasAnnouncedSyncErrorRef.current = true;
      }
    }

    setLoading(false);
  }, [notify]);

  // Запускаем fetchAll сразу и затем по таймеру.
  // Таймер чистится при анмаунте чтобы не было утечек.
  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  // ── Действия над пользователями ───────────────────────────────────────────

  /**
   * Выполняет действие из confirmAction и обновляет список пользователей.
   * Вызывается только после того как юзер подтвердил действие в ConfirmModal
   * модальном окне (операции с юзерами). Говорим что confirmAction не может быть null, 
   * так как ConfirmModal не может вызвать этот метод, если confirmAction === null. 
   * Это гарантирует типизацию. Если же по какой-то причине confirmAction будет null, 
   * то мы просто ничего не сделаем, так как это не должно происходить в нормальных условиях.
   */
  const executeAction = useCallback(async (a: NonNullable<ConfirmAction>) => {
    try {
      switch (a.kind) {
        case 'block':
          await dashboardApi.blockUser(a.email);
          notify(NotificationPresets.success(`${a.email} frozen`, 'user_block'));
          break;
        case 'unblock':
          await dashboardApi.unblockUser(a.email);
          notify(NotificationPresets.success(`${a.email} restored`, 'user_unblock'));
          break;
        case 'reset':
          await dashboardApi.resetTraffic(a.email);
          notify(NotificationPresets.success(`Traffic reset for ${a.email}`, 'user_reset'));
          break;
        case 'delete':
          await dashboardApi.deleteUser(a.email);
          notify(NotificationPresets.success(`${a.email} removed`, 'user_delete'));
          break;
      }
      // После любого действия сразу перезагружаем список
      fetchAll();
    } catch (e: unknown) {
      notify(NotificationPresets.error(
        e instanceof Error ? e.message : 'Operation failed',
        'user_action_err',
      ));
    }

    setConfirmAction(null);
  }, [notify, fetchAll]);

  /**
   * Обогащённый список — SpaceUser + живые байты из presence-кэша.
   * Именно его используют UserRow и TrafficBar.
   * Пересчитывается только когда меняются users или stats.
   */
  const enriched = mergeUsersWithStats(users, stats);
 
  const online = users.filter((u) => u.status === 'online').length;
  const frozen = users.filter((u) => u.status === 'blocked').length;
 
  /**
   * Суммарный трафик по всем юзерам — для карточек Uplink/Downlink в шапке.
   * Считаем из enriched, чтобы не делать отдельный проход по stats.
   */
  const totalUplink   = enriched.reduce((acc, u) => acc + u.uplink_bytes,   0);
  const totalDownlink = enriched.reduce((acc, u) => acc + u.downlink_bytes, 0);
 
  const filtered = enriched.filter((u) => {
    const matchQ = !search || u.email.toLowerCase().includes(search.toLowerCase());
    const matchF = filter === 'all' || u.status === filter;
    return matchQ && matchF;
  });

  // ── Публичный API хука ────────────────────────────────────────────────────

  return {
    // Данные
    users,
    stats,
    history,
    loading,

    // Агрегаты для карточек шапки
    totalUplink,
    totalDownlink,

    // Derived
    online,
    frozen,
    filtered,

    // UI стейт
    filter,        setFilter,
    search,        setSearch,
    confirmAction, setConfirmAction,
    showCreate,    setShowCreate,

    // Экшены
    fetchAll,
    executeAction,
  };
}