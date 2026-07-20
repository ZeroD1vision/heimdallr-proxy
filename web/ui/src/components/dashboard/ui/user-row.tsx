/**
 * @file user-row.tsx
 * @description Строка пользователя в таблице дашборда.
 *
 * Раскрывается по клику, показывая:
 *  - TrafficBar (прогресс трафика)
 *  - Telegram ID (если привязан)
 *  - ActionBtn'ы (Freeze/Restore, Reset traffic, Remove)
 *
 * ActionBtn живёт в этом же файле как приватный sub-component —
 * он не используется нигде кроме UserRow, поэтому выносить его
 * в отдельный файл было бы over-engineering.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, RotateCcw, Trash2, ChevronRight } from 'lucide-react';
import { StatusOrb } from '@/components/dashboard/ui/status-orb';
import { TrafficBar } from '@/components/dashboard/ui/traffic-bar';
import { fmtExpiry } from '@/components/dashboard/utils';
import type { SpaceUser, ConfirmAction } from '@/components/dashboard/types';

// ─── ActionBtn ────────────────────────────────────────────────────────────────

/**
 * Кнопка действия в развёрнутой строке пользователя.
 *
 * danger=true усиливает стиль: фон и граница становятся ярче.
 * Используется для деструктивных действий (Remove).
 *
 * e.stopPropagation() в onClick нужен, чтобы клик по кнопке
 * не сворачивал строку (так как клик по строке тоже вызывает expanded).
 */
interface ActionBtnProps {
  icon: React.ReactNode;
  label: string;
  color?: string;
  danger?: boolean;
  onClick: () => void;
}

function ActionBtn({ icon, label, color, danger, onClick }: ActionBtnProps) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-ui-nano uppercase tracking-[0.15em] font-bold
        border transition-all duration-200"
      style={{
        color:       color ?? 'rgba(255,255,255,0.4)',
        borderColor: danger ? `${color}25` : 'rgba(255,255,255,0.07)',
        background:  danger ? `${color}08` : 'rgba(255,255,255,0.03)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background   = color ? `${color}15` : 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor  = color ? `${color}40` : 'rgba(255,255,255,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background   = danger ? `${color}08` : 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor  = danger ? `${color}25` : 'rgba(255,255,255,0.07)';
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────

interface UserRowProps {
  user: SpaceUser;
  /** Порядковый индекс в списке — используется для stagger-анимации появления */
  index: number;
  /** Колбэк при нажатии на action-кнопку. Открывает ConfirmModal на уровне страницы. */
  onAction: (email: string, kind: NonNullable<ConfirmAction>['kind']) => void;
}

export function UserRow({ user, index, onAction }: UserRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Суммируем трафик за сессию. Поля могут отсутствовать у оффлайн-юзеров.
  const total = (user.uplink_bytes ?? 0) + (user.downlink_bytes ?? 0);

  const statusLabel: Record<SpaceUser['status'], string> = {
    online:  'Online',
    offline: 'Offline',
    blocked: 'Frozen',
  };

  // Цвет бейджа статуса
  const statusStyle: Record<SpaceUser['status'], React.CSSProperties> = {
    online:  { background: 'rgba(0,255,136,0.1)',  color: '#00ff88' },
    offline: { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.25)' },
    blocked: { background: 'rgba(255,59,92,0.1)',  color: '#ff3b5c' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`border-b border-white/4 transition-colors duration-200
        ${user.is_blocked ? 'opacity-45' : 'hover:bg-white/[0.02]'}`}
    >
      {/* ── Основная строка ── */}
      <div
        className="grid items-center gap-3 px-5 py-3.5 cursor-pointer"
        style={{ gridTemplateColumns: '1fr auto auto auto' }}
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Идентификатор */}
        <div className="flex items-center gap-3 min-w-0">
          <StatusOrb status={user.status} />
          <div className="min-w-0">
            <p className="text-ui-sm text-white/90 font-geist-mono truncate">
              {user.email}
            </p>
            <p className="text-ui-nano text-white/25 truncate tracking-wide mt-0.5">
              {user.inbound_tag}
            </p>
          </div>
        </div>

        {/* Статус-бейдж */}
        <span
          className="text-ui-nano uppercase tracking-[0.15em] px-2 py-1 rounded-md font-bold"
          style={statusStyle[user.status]}
        >
          {statusLabel[user.status]}
        </span>

        {/* Срок действия (скрыт на мобилке) */}
        <span className="text-ui-xs text-white/25 font-geist-mono hidden sm:block">
          {fmtExpiry(user.expires_at)}
        </span>

        {/* Стрелка раскрытия */}
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight size={13} className="text-white/20" />
        </motion.span>
      </div>

      {/* ── Развёрнутая панель ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-3">
              {/* Трафик */}
              <div className="flex items-center gap-4">
                <span className="text-ui-nano text-white/25 uppercase tracking-widest w-16">
                  Traffic
                </span>
                <TrafficBar used={total} limit={user.traffic_limit} />
              </div>

              {/* Telegram ID — только если привязан */}
              {user.telegram_id > 0 && (
                <div className="flex items-center gap-4">
                  <span className="text-ui-nano text-white/25 uppercase tracking-widest w-16">
                    Telegram
                  </span>
                  <span className="text-ui-xs text-white/40 font-geist-mono">
                    {user.telegram_id}
                  </span>
                </div>
              )}

              {/* Действия */}
              <div className="flex items-center gap-2 pt-1">
                {user.is_blocked ? (
                  <ActionBtn
                    icon={<Unlock size={11} />}
                    label="Restore"
                    color="#00ff88"
                    onClick={() => onAction(user.email, 'unblock')}
                  />
                ) : (
                  <ActionBtn
                    icon={<Lock size={11} />}
                    label="Freeze"
                    color="#ff3b5c"
                    onClick={() => onAction(user.email, 'block')}
                  />
                )}
                <ActionBtn
                  icon={<RotateCcw size={11} />}
                  label="Reset traffic"
                  onClick={() => onAction(user.email, 'reset')}
                />
                <ActionBtn
                  icon={<Trash2 size={11} />}
                  label="Remove"
                  color="#ff3b5c"
                  danger
                  onClick={() => onAction(user.email, 'delete')}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}