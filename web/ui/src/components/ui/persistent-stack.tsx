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
import { Check, X, AlertTriangle, Info, Trash2 } from 'lucide-react';
import {
  usePersistentStack,
  selectVisibleItems,
  selectOverflowCount,
  selectTotalCount,
} from '@/store/use-persistent-stack';
import { useShallow } from 'zustand/react/shallow';
import type { NotificationIcon } from '@/store/use-notification-machine';
import type { PersistentItem } from '@/store/use-persistent-stack';
import { NAVBAR_ANIMATION_TOKENS } from '@/shared/config/animations';
import { GlassDropdown } from '../ui/glass-dropdown';

// ─── Карта иконок ─────────────────────────────────────────────────────────────

const ICON_EL: Record<NotificationIcon, React.ReactNode> = {
  check: <Check size={14} strokeWidth={2.5} />,
  error: <X size={14} strokeWidth={2.5} />,
  warn: <AlertTriangle size={14} strokeWidth={2.5} />,
  info: <Info size={14} strokeWidth={2} />,
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
  // Слои: каждая иконка смещается влево на (total - index - 1) * 10px
  const offsetX = (total - index - 1) * 10;

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
        w-8 h-8 rounded-full
        flex items-center justify-center
        border border-white/15
        bg-zinc-900/50 backdrop-blur-sm
        ${ICON_COLOR[item.icon]}
      `}
    >
      {ICON_EL[item.icon]}
    </motion.div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

interface PersistentStackProps {
  /** Видим ли стек в данный момент (машина не находится в idle) */
  visible: boolean;
}

export function PersistentStack({ visible }: PersistentStackProps) {
  const visibleItems = usePersistentStack(useShallow(selectVisibleItems));
  const overflowCount = usePersistentStack(selectOverflowCount);
  const totalCount = usePersistentStack(selectTotalCount);
  const items = usePersistentStack((s) => s.items);
  const dismiss = usePersistentStack((s) => s.dismiss);
  const clearAll = usePersistentStack((s) => s.clearAll);
  
  if (totalCount === 0) return null;

  // Текущая физическая ширина самого стека иконок
  const iconSize = 32;
  const overlapStep = 10;
  const stackWidth = visibleItems.length > 0 
    ? iconSize + (visibleItems.length - 1) * overlapStep 
    : 0;
    
  // Формула центрирования:
  // Вычисляем точку, чтобы центр стека совпал с центром 46-пиксельного ушка слева от острова.
  const stackGap = NAVBAR_ANIMATION_TOKENS.NAVBAR_STACK_GAP;
  const centerTargetX = (stackGap - stackWidth) / 2;

  return (
    <div className="relative flex items-center">
      {/* Контейнер стека иконок — фиксированная ширина вмещает до 3 перекрывающихся иконок */}
      <GlassDropdown
        triggerType="hover"
        align="right"
        offsetClass="mt-6"
        className="w-64"
        trigger={
          // Контейнер по ширине стека
          <div 
            style={{ width: `${stackWidth}px`, height: '32px' }}
            className="relative flex items-center justify-end cursor-pointer"
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
                    absolute -top-1.5 -right-1.5
                    min-w-[14px] h-[14px] px-[3px]
                    rounded-full bg-red-500 text-white
                    text-ui-nano font-bold font-geist-mono
                    flex items-center justify-center leading-none z-50
                  "
                >
                  {overflowCount > 9 ? '9+' : overflowCount}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        }
      >
        {/* ─── Контент выпадающего меню (как у меню аккаунта) ─── */}
        <div className="border-white/5">
          {/* Шапка меню */}
          <div className="pb-3 border-b border-white/5 flex items-center justify-between">
            <div>
              <p className="text-ui-nano text-zinc-400 uppercase tracking-[0.2em] mb-0.5">
                Notifications
              </p>
              <h4 className="text-ui-xs font-bold text-white uppercase font-geist-mono">
                Notifications ({totalCount})
              </h4>
            </div>
            {items.length > 0 && (
              <button
                onClick={clearAll}
                className="text-ui-nano text-zinc-500 hover:text-red-400 transition-colors flex items-center gap-1 uppercase tracking-wider"
              >
                <Trash2 size={10} /> Clear
              </button>
            )}
          </div>

          {/* Список уведомлений */}
          <div className="flex flex-col gap-1 mt-3 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
            {items.length === 0 ? (
              <p className="text-ui-nano text-zinc-600 text-center py-4 uppercase tracking-widest">
                Stack Empty
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-white/0 hover:bg-white/5 border border-transparent hover:border-white/5 transition-all group"
                  >
                    <span className={`mt-0.5 flex-shrink-0 ${ICON_COLOR[item.icon]}`}>
                      {ICON_EL[item.icon]}
                    </span>
                    <span className="flex-1 text-ui-xs text-zinc-300 font-geist-mono leading-normal break-words">
                      {item.message}
                    </span>
                    <button
                      onClick={() => dismiss(item.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-white mt-0.5"
                      aria-label="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </GlassDropdown>
    </div>
  );
}