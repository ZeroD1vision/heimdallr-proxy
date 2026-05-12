/**
 * @file utils.ts
 * @description Чистые утилиты дашборда — форматирование, без side-эффектов.
 *
 * Все функции здесь:
 *  - не зависят от React
 *  - не имеют state
 *  - легко тестируются в изоляции
 */

// ─── Форматирование байт ──────────────────────────────────────────────────────

/**
 * Форматирует количество байт в человекочитаемую строку.
 *
 * @example
 * fmt(0)           // '0 B'
 * fmt(1536)        // '1.5 KB'
 * fmt(1073741824)  // '1.0 GB'
 */
export function fmt(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

// ─── Форматирование срока действия ───────────────────────────────────────────

/**
 * Форматирует ISO-дату истечения доступа в человекочитаемую строку.
 *
 * Логика:
 *  - null → бессрочно (∞)
 *  - просрочено → 'expired'
 *  - меньше суток → 'today'
 *  - до 30 дней → '14d'
 *  - больше 30 дней → 'Jun 15'
 *
 * @param iso - ISO 8601 строка или null (бессрочный доступ)
 */
export function fmtExpiry(iso: string | null): string {
  if (!iso) return '∞';

  const d = new Date(iso);
  const diff = d.getTime() - Date.now();

  if (diff < 0) return 'expired';

  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days}d`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}