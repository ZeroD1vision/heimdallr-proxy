/**
 * @file confirm-modal.tsx
 * @description Модальное окно подтверждения деструктивных действий.
 *
 * Рендерится поверх всего (z-50) с backdrop-blur.
 * Клик за пределами модалки вызывает onCancel.
 *
 * Конфигурация заголовка/текста/цвета определяется по action.kind —
 * таким образом один компонент покрывает все 4 типа действий.
 */

import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import type { ConfirmAction } from '@/components/dashboard/types';

// Мета-данные для каждого типа действия.
// Вынесены в константу — не пересоздаются при рендере.
const ACTION_META = {
  block:   { title: 'Freeze Access',  desc: (e: string) => `${e} will be immediately disconnected.`,             btn: 'Freeze',  color: '#ff3b5c' },
  unblock: { title: 'Restore Access', desc: (e: string) => `${e} will regain network access.`,                    btn: 'Restore', color: '#00ff88' },
  reset:   { title: 'Reset Traffic',  desc: (e: string) => `Traffic counter for ${e} will be zeroed.`,            btn: 'Reset',   color: '#f0b429' },
  delete:  { title: 'Remove Entity',  desc: (e: string) => `${e} will be purged from DB and Xray. Permanent.`,    btn: 'Purge',   color: '#ff3b5c' },
} as const;

interface ConfirmModalProps {
  action: NonNullable<ConfirmAction>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ action, onConfirm, onCancel }: ConfirmModalProps) {
  const meta = ACTION_META[action.kind];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      // Клик по оверлею = отмена
      onClick={onCancel}
    >
      {/* Затемнённый backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-sm mx-4"
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        // Блокируем всплытие клика, чтобы клик внутри не закрывал модалку
        onClick={(e) => e.stopPropagation()}
      >
        <GlassPane className="inset-0 rounded-2xl" style={{ borderRadius: '16px' }} />
        <GlassPaneContent className="p-7 space-y-5">
          {/* Иконка предупреждения в цвете действия */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: `${meta.color}15`,
              border: `1px solid ${meta.color}30`,
            }}
          >
            <AlertTriangle size={16} style={{ color: meta.color }} />
          </div>

          {/* Заголовок и описание */}
          <div>
            <h3 className="font-jakarta font-black text-base uppercase tracking-widest text-white mb-1.5">
              {meta.title}
            </h3>
            <p className="text-[11px] text-white/40 leading-relaxed tracking-wide">
              {meta.desc(action.email)}
            </p>
          </div>

          {/* Кнопки */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-jakarta font-bold uppercase tracking-widest
                text-white/40 border border-white/8 hover:border-white/20 hover:text-white/60
                transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-jakarta font-bold uppercase tracking-widest
                text-black transition-all duration-200 hover:brightness-110"
              style={{ background: meta.color }}
            >
              {meta.btn}
            </button>
          </div>
        </GlassPaneContent>
      </motion.div>
    </motion.div>
  );
}