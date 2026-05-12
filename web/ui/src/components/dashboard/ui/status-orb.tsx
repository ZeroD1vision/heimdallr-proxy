/**
 * @file status-orb.tsx
 * @description Индикатор статуса пользователя — цветная точка с пульсацией.
 *
 * Online → зелёный + анимация пульса (показывает живое соединение)
 * Offline → серый (нет активности)
 * Blocked → красный (доступ заморожен)
 */

import { motion } from 'framer-motion';
import type { SpaceUser } from '@/components/dashboard/types';

// Цветовая карта статусов.
// Вынесена за пределы компонента — не пересоздаётся при каждом рендере.
const STATUS_COLORS: Record<SpaceUser['status'], string> = {
  online:  '#00ff88',
  offline: 'rgba(255,255,255,0.2)',
  blocked: '#ff3b5c',
};

interface StatusOrbProps {
  status: SpaceUser['status'];
}

export function StatusOrb({ status }: StatusOrbProps) {
  const color = STATUS_COLORS[status];

  return (
    <span className="relative flex-shrink-0 w-2 h-2">
      {/* Основная точка */}
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color }}
      />

      {/* Пульс — рендерится только для онлайн-статуса */}
      {status === 'online' && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
}