/**
 * @file stat-card.tsx
 * @description Карточка метрики в шапке дашборда.
 *
 * Используется для отображения: Online, Frozen, Uplink, Downlink.
 * Анимируется при появлении с задержкой через prop delay —
 * это создаёт stagger-эффект без useAnimate/stagger из framer-motion.
 */

import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  /** Дополнительная подпись под значением (например "of 12 entities") */
  sub?: string;
  icon: React.ElementType;
  /** Акцентный цвет иконки и значения. Если не передан — белый. */
  accent?: string;
  /** Задержка анимации появления в секундах. Используется для stagger. */
  delay?: number;
}

const springConfig = { stiffness: 150, damping: 20, mass: 0.5 };

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  delay = 0,
}: StatCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Сглаживание через Spring
  const mouseX = useSpring(x, springConfig);
  const mouseY = useSpring(y, springConfig);

  // Маппинг положения мыши в углы поворота (диапазон -10...10 градусов)
  // Если мышка слева (отрицательный X), карточка поворачивается по оси Y
  const rotateX = useTransform(mouseY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(mouseX, [-0.5, 0.5], [-10, 10]);

  // Эффект блика (Glare) — движется вслед за мышкой
  const glareX = useTransform(mouseX, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(mouseY, [-0.5, 0.5], ["0%", "100%"]);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const relativeX = (e.clientX - rect.left) / rect.width - 0.5; // -0.5...0.5
    const relativeY = (e.clientY - rect.top) / rect.height - 0.5; // -0.5...0.5

    x.set(relativeX);
    y.set(relativeY);
  }

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  }

  return (
    <div className="perspective-[1000px]"> {/* Обертка для задания глубины сцены */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <GlassPane
          className="inset-0"
          style={{
            borderRadius: '20px',
            overflow: 'hidden',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
          }}
        />
        <GlassPaneContent className="p-5 flex flex-col gap-3">
          {/* Заголовок + иконка */}
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/35">
              {label}
            </span>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: accent ? `${accent}15` : 'rgba(255,255,255,0.04)' }}
            >
              <Icon size={13} style={{ color: accent ?? 'rgba(255,255,255,0.4)' }} />
            </div>
          </div>

          {/* Значение + подпись */}
          <div>
            <p
              className="font-jakarta font-black text-2xl"
              style={{ color: accent ?? '#fff' }}
            >
              {value}
            </p>
            {sub && (
              <p className="text-[10px] text-white/25 mt-0.5 tracking-wide">{sub}</p>
            )}
          </div>
        </GlassPaneContent>
      </motion.div>
    </div>
  );
}