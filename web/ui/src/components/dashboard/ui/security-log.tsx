/**
 * @file security-log.tsx
 * @description Журнал последних событий трафика.
 *
 * Показывает последние 15 записей из /api/history.
 * Каждая запись анимируется с небольшой задержкой (stagger),
 * создавая эффект последовательного появления.
 *
 * Пустое состояние рендерится отдельно — не показываем пустой div.
 */

import { motion } from 'framer-motion';
import { Activity, Clock } from 'lucide-react';
import { fmt } from '@/components/dashboard/utils';
import type { HistoryEntry } from '@/components/dashboard/types';

/** Максимальное количество отображаемых записей */
const MAX_ENTRIES = 15;

interface SecurityLogProps {
  entries: HistoryEntry[];
}

export function SecurityLog({ entries }: SecurityLogProps) {
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Clock size={20} className="text-white/10" />
        <p className="text-[10px] text-white/20 uppercase tracking-widest">No events</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/4">
      {entries.slice(0, MAX_ENTRIES).map((h, i) => (
        <motion.div
          key={h.id ?? i}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          // Stagger: каждая следующая строка появляется на 30ms позже предыдущей
          transition={{ delay: i * 0.03, duration: 0.3 }}
          className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
        >
          {/* Иконка события */}
          <div
            className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{
              background: 'rgba(56,189,248,0.08)',
              border: '1px solid rgba(56,189,248,0.12)',
            }}
          >
            <Activity size={10} className="text-sky-400" />
          </div>

          {/* Email + трафик */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/70 font-geist-mono truncate">
              {h.email}
            </p>
            <p className="text-[9px] text-white/25 mt-0.5">
              <span className="text-emerald-400/60">↑{fmt(h.uplink_bytes)}</span>
              {' · '}
              <span className="text-sky-400/60">↓{fmt(h.downlink_bytes)}</span>
            </p>
          </div>

          {/* Время события */}
          <span className="text-[9px] text-white/20 font-geist-mono flex-shrink-0">
            {new Date(h.recorded_at).toLocaleTimeString('en-US', {
              hour:   '2-digit',
              minute: '2-digit',
            })}
          </span>
        </motion.div>
      ))}
    </div>
  );
}