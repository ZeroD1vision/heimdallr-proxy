/**
 * @file notification-bubble.tsx
 * @description Контент, который рендерится внутри раскрытого острова навбара.
 *
 * Этот компонент намеренно простой — он получает текущее уведомление
 * как проп и отвечает только за собственную анимацию входа/выхода.
 * Все решения по состояниям живут в машине.
 *
 *   ┌─────────────────────────────┐  ← 128px
 *   │  [навбар-контент / 48px]     │  ← верхняя половина — навбар как обычно
 *   ├─────────────────────────────┤
 *   │   ●  иконка  (24px круг)     │
 *   │   текст уведомления          │  ← нижние ~80px — зона уведомления
 *   └─────────────────────────────┘
 *
 * Hover-dismiss: при наведении на зону уведомления иконка анимированно
 * превращается в крестик. Клик по иконке (или по всей зоне) вызывает onDismiss.
 * Контракт анимации:
 *   - AnimatePresence меняет ключ по notification.id, чтобы запускать
 *     exit → enter каждый раз, когда машина входит в `changing`.
 *   - Иконка появляется с небольшим пружинным перелётом.
 *   - Сообщение выезжает снизу вверх с затуханием.
 */
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertTriangle, Info } from 'lucide-react';
import type { Notification, NotificationIcon } from '@/store/use-notification-machine';
import { useGlow } from '@/context/glow-context';
import { NAVBAR_ANIMATION_TOKENS } from '@/shared/config/animations';

// ─── Цветовые токены по типу иконки ──────────────────────────────────────────

interface IconMetaValue {
  icon: React.ReactNode;
  color: string;
  glow: string;
  ring: string;
  glowHex: string;
}

const ICON_META: Record<NotificationIcon, IconMetaValue> = {
  check: {
    icon: <Check size={14} strokeWidth={2.5} />,
    color: 'text-emerald-400',
    glow: 'shadow-[0_0_12px_2px_rgba(52,211,153,0.35)]',
    ring: 'border-emerald-500/40',
    glowHex: '#34d399',
  },
  error: {
    icon: <X size={14} strokeWidth={2.5} />,
    color: 'text-red-400',
    glow: 'shadow-[0_0_12px_2px_rgba(248,113,113,0.35)]',
    ring: 'border-red-500/40',
    glowHex: '#f87171',
  },
  warn: {
    icon: <AlertTriangle size={13} strokeWidth={2.5} />,
    color: 'text-amber-400',
    glow: 'shadow-[0_0_12px_2px_rgba(251,191,36,0.35)]',
    ring: 'border-amber-500/40',
    glowHex: '#fbbf24',
  },
  info: {
    icon: <Info size={14} strokeWidth={2} />,
    color: 'text-sky-400',
    glow: 'shadow-[0_0_12px_2px_rgba(56,189,248,0.35)]',
    ring: 'border-sky-500/40',
    glowHex: '#38bdf8',
  },
};

// ─── Иконка с hover-swap на крестик ──────────────────────────────────────────

function DismissableIcon({
  icon,
  isHovered,
}: {
  icon: NotificationIcon;
  isHovered: boolean;
}) {
  const meta = ICON_META[icon];

  return (
    <div
      className={`
        relative w-8 h-8 rounded-full border flex items-center justify-center
        bg-white/5 backdrop-blur-sm
        transition-all duration-300
        ${meta.ring}
        ${isHovered ? 'border-white/30 bg-white/10' : ''}
        ${isHovered ? 'shadow-[0_0_10px_2px_rgba(255,255,255,0.08)]' : meta.glow}
      `}
    >
      <AnimatePresence mode="wait">
        {isHovered ? (
          /* Крестик dismiss */
          <motion.span
            key="dismiss"
            initial={{ scale: 0.4, opacity: 0, rotate: -45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0, rotate: 45 }}
            transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
            className="text-white/70 flex items-center justify-center"
          >
            <X size={13} strokeWidth={2.5} />
          </motion.span>
        ) : (
          /* Иконка уведомления */
          <motion.span
            key="notif-icon"
            initial={{ scale: 0.4, opacity: 0, rotate: 45 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0, rotate: -45 }}
            transition={{ type: 'spring', stiffness: 800, damping: 35, mass: 0.5 }}
            className={`flex items-center justify-center ${meta.color}`}
          >
            {meta.icon}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Тонкий горизонтальный разделитель между навбаром и зоной уведомления ────

function Divider({ color }: { color: string }) {
  return (
    <motion.div
      initial={{ scaleX: 0, opacity: 0, originX: 0.5 }}
      animate={{ scaleX: 1, opacity: 1, originX: 0.5 }}
      exit={{ scaleX: 0, opacity: 0, originX: 0.5 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`absolute left-6 right-6 h-px ${color}`}
      style={{ top: '48px' }} // Граница между навбар-зоной и зоной уведомления
    />
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────────

interface NotificationBubbleProps {
  notification: Notification | null;
  onDismiss?: () => void;
}

export function NotificationBubble({
  notification,
  onDismiss,
}: NotificationBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { setGlowColor } = useGlow();
  const activeMeta = notification?.icon ? ICON_META[notification.icon] : null;
  const isError = notification?.icon === 'error';

  // Управляем свечением удаленно
  useEffect(() => {
    if (isError && activeMeta) {
      setGlowColor(activeMeta.glowHex);
    } else {
      setGlowColor(null);
    }

    // Сброс при размонтировании
    return () => setGlowColor(null);
  }, [isError, activeMeta, setGlowColor]);

  const dividerColor: Record<NotificationIcon, string> = {
    check: 'bg-emerald-500/20',
    error: 'bg-red-500/20',
    warn: 'bg-amber-500/20',
    info: 'bg-sky-500/20',
  };

  return (
    <AnimatePresence mode="wait">
      {notification && activeMeta && (
        <>
          {/* Разделитель */}
          <Divider
            color={
              notification.icon
                ? dividerColor[notification.icon]
                : 'bg-white/10'
            }
          />

          {/* Зона уведомления — занимает нижние ~80px острова */}
          <motion.div
            key={notification.id}
            initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, filter: 'blur(6px)' }}
            transition={{ duration: NAVBAR_ANIMATION_TOKENS.CONTENT.BUBBLE_FADE_SEC, ease: 'easeOut' }}
            // Позиционируем ниже навбар-зоны (top: 48px), до конца острова (bottom: 0)
            className="absolute left-0 right-0 flex flex-row items-center justify-center gap-2 cursor-pointer select-none"
            style={{ top: '52px', bottom: '8px' }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            onClick={onDismiss}
          >
            {/* Иконка с hover-swap */}
            <motion.div
              initial={{ opacity: 0, x: 20 }} // Стартовая точка (ближе к центру)
              animate={{ x: -10, opacity: 1 }} // Финальная точка (чуть левее от центра)
              transition={{ duration: NAVBAR_ANIMATION_TOKENS.CONTENT.INNER_TRANSIT_SEC }}
            >
              {notification.icon && (
                <DismissableIcon
                  icon={notification.icon}
                  isHovered={isHovered}
                />
              )}
            </motion.div>

            {/* Текст уведомления */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 10 }}
              transition={{ duration: NAVBAR_ANIMATION_TOKENS.CONTENT.INNER_TRANSIT_SEC, ease: "easeOut" }}
              className="flex flex-col items-start justify-center" // Выравниваем текст по левому краю внутри группы
            >
              <motion.span
                className="text-[10px] font-syne font-medium tracking-[0.1em] uppercase text-white/75 whitespace-nowrap"
              >
                {notification.message}
              </motion.span>

              {/* Подсказка «dismiss» под текстом */}
              <AnimatePresence>
                {isHovered && (
                  <motion.span
                    initial={{ opacity: 0, height: 0, y: 2 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: 2 }}
                    className="text-[8px] font-geist-mono tracking-[0.15em] text-white/30 uppercase mt-0.5"
                  >
                    dismiss
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}