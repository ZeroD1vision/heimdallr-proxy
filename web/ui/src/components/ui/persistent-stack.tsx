/**
 * @file persistent-stack.tsx
 * @description Стек иконок, отображаемый СЛЕВА от стеклянного острова.
 *
 * Визуальный контракт:
 *   - До 3 иконок накладываются друг на друга с небольшим z-offset (иллюзия стека).
 *   - Бейдж с общим количеством появляется над стеком, когда overflow > 0.
 *   - Клик открывает простую панель со списком ниже.
 *   - Весь компонент выезжает слева за счёт расширения ширины острова.
 *     Левая граница острова "растёт" влево — анимацией управляет
 *     родительский компонент Navbar; этот компонент абсолютно позиционирован
 *     слева от контейнера острова.
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import {
  usePersistentStack,
  selectVisibleItems,
  selectOverflowCount,
  selectTotalCount,
} from '@/store/use-persistent-stack';
import type { NotificationIcon } from '@/store/use-notification-machine';
import type { PersistentItem } from '@/store/use-persistent-stack';

// ─── Карта иконок ─────────────────────────────────────────────────────────────

const ICON_EL: Record<NotificationIcon, React.ReactNode> = {
  check: <Check size={11} strokeWidth={2.5} />,
  error: <X size={11} strokeWidth={2.5} />,
  warn: <AlertTriangle size={10} strokeWidth={2.5} />,
  info: <Info size={11} strokeWidth={2} />,
};

const ICON_COLOR: Record<NotificationIcon, string> = {
  check: 'text-emerald-400',
  error: 'text-red-400',
  warn: 'text-amber-400',
  info: 'text-sky-400',
};

// ─── Одна иконка в стеке ──────────────────────────────────────────────────────

function StackIcon({
  item,
  index,
  total,
}: {
  item: PersistentItem;
  index: number;
  total: number;
}) {
  // Слои: каждая иконка смещается влево на (total - index - 1) * 6px
  const offsetX = (total - index - 1) * 6;

  return (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, scale: 0.6, x: -8 }}
      animate={{ opacity: 1, scale: 1, x: -offsetX }}
      exit={{ opacity: 0, scale: 0.5, x: -16 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      style={{ zIndex: index }}
      className={`
        absolute right-0
        w-6 h-6 rounded-full
        flex items-center justify-center
        border border-white/15
        bg-zinc-900/80 backdrop-blur-sm
        ${ICON_COLOR[item.icon]}
      `}
    >
      {ICON_EL[item.icon]}
    </motion.div>
  );
}

// ─── Панель деталей ───────────────────────────────────────────────────────────

function DetailPanel() {
  const items = usePersistentStack((s) => s.items);
  const dismiss = usePersistentStack((s) => s.dismiss);
  const clearAll = usePersistentStack((s) => s.clearAll);
  const closePanel = usePersistentStack((s) => s.closePanel);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{
        backdropFilter: 'blur(24px) saturate(150%)',
        WebkitBackdropFilter: 'blur(24px) saturate(150%)',
      }}
      className="
        absolute right-0 top-full mt-3
        w-72 rounded-2xl
        border border-white/10
        bg-zinc-950/70
        shadow-2xl p-4 z-50
        origin-top-right
      "
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-syne uppercase tracking-[0.2em] text-zinc-400">
          Уведомления
        </span>
        {items.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[9px] uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
          >
            Очистить всё
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-600 text-center py-4">
          Нет уведомлений
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <span className={`mt-0.5 flex-shrink-0 ${ICON_COLOR[item.icon]}`}>
                {ICON_EL[item.icon]}
              </span>
              <span className="flex-1 text-[11px] text-zinc-300 leading-relaxed">
                {item.message}
              </span>
              <button
                onClick={() => dismiss(item.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-600 hover:text-white mt-0.5"
                aria-label="Закрыть"
              >
                <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

interface PersistentStackProps {
  /** Видим ли стек в данный момент (машина не находится в idle) */
  visible: boolean;
}

export function PersistentStack({ visible }: PersistentStackProps) {
  const visibleItems = usePersistentStack(selectVisibleItems);
  const overflowCount = usePersistentStack(selectOverflowCount);
  const totalCount = usePersistentStack(selectTotalCount);
  const isPanelOpen = usePersistentStack((s) => s.isPanelOpen);
  const togglePanel = usePersistentStack((s) => s.togglePanel);
  const closePanel = usePersistentStack((s) => s.closePanel);

  if (totalCount === 0) return null;

  return (
    <div className="relative flex items-center">
      {/* Контейнер стека иконок — фиксированная ширина вмещает до 3 перекрывающихся иконок */}
      <motion.button
        onClick={togglePanel}
        animate={{ opacity: 1, x: 0 }}
        initial={{ opacity: 0, x: 8 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        style={{ width: `${16 + visibleItems.length * 6}px`, height: '24px' }}
        className="relative flex items-center justify-end"
        aria-label={`${totalCount} persistent notification${totalCount !== 1 ? 's' : ''}`}
      >
        <AnimatePresence>
          {visibleItems.map((item, index) => (
            <StackIcon
              key={item.id}
              item={item}
              index={index}
              total={visibleItems.length}
            />
          ))}
        </AnimatePresence>

        {/* Бейдж переполнения */}
        <AnimatePresence>
          {overflowCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="
                absolute -top-2 -right-1
                min-w-[14px] h-[14px] px-[3px]
                rounded-full
                bg-red-500 text-white
                text-[8px] font-bold font-geist-mono
                flex items-center justify-center
                leading-none
              "
            >
              {overflowCount > 9 ? '9+' : overflowCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Панель деталей */}
      <AnimatePresence>
        {isPanelOpen && <DetailPanel />}
      </AnimatePresence>
    </div>
  );
}