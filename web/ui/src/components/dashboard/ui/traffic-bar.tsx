/**
 * @file traffic-bar.tsx
 * @description Прогресс-бар использования трафика.
 *
 * Логика цвета:
 *  - до 85% использования → зелёный→голубой градиент (норма)
 *  - после 85% → красный→оранжевый (предупреждение о лимите)
 *  - лимит = 0 → бессрочный, показываем ∞
 *
 * Анимация ширины через framer-motion даёт плавное появление
 * при первом рендере строки пользователя.
 */

import { motion } from 'framer-motion';
import { fmt } from '@/components/dashboard/utils';

interface TrafficBarProps {
  /** Использованный трафик в байтах */
  used: number;
  /** Лимит трафика в байтах. 0 = безлимитный */
  limit: number;
}

export function TrafficBar({ used, limit }: TrafficBarProps) {
  // Безлимитный тариф — просто символ
  if (!limit) {
    return (
      <span className="text-[10px] text-white/25 tracking-widest">∞</span>
    );
  }

  const pct    = Math.min((used / limit) * 100, 100);
  const danger = pct > 85;

  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      {/* Полоса прогресса */}
      <div className="h-[2px] rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: danger
              ? 'linear-gradient(90deg, #ff3b5c, #ff6b35)'
              : 'linear-gradient(90deg, #00ff88, #38bdf8)',
          }}
        />
      </div>

      {/* Числовое значение под полосой */}
      <span className="text-[9px] text-white/25">
        {fmt(used)} / {fmt(limit)}
      </span>
    </div>
  );
}