'use client';

import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  AnimatePresence,
} from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

export default function Scrollbar() {
  const { scrollYProgress } = useScroll();
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Логика появления/исчезновения через useEffect
  useEffect(() => {
    const handleScroll = () => {
      // Показываем при любом движении
      setIsVisible(true);

      // Сбрасываем и ставим таймер на скрытие (например, через 1.5 секунды)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 1500);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Настройка пружины: stiffness 60 и damping 20 дадут более "вязкий" оверскролл
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 60,
    damping: 20,
    restDelta: 0.0001,
  });

  // Позиция ползунка
  const y = useTransform(smoothProgress, [0, 1], [0, 200]);

  /**
   * ФИЗИКА РАСТЯЖЕНИЯ:
   * Между 0 и 1 (основной скролл) scaleY всегда 1.
   * Как только smoothProgress вылетает за границы (инерция пружины),
   * ползунок начинает тянуться.
   */
  const stretch = useTransform(
    smoothProgress,
    [-0.15, 0, 1, 1.15],
    [2.8, 1, 1, 2.8]
  );

  const origin = useTransform(smoothProgress, (v) => {
    if (v <= 0) return 'top';
    if (v >= 1) return 'bottom';
    return 'center';
  });

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col items-center group pointer-events-none">
      <AnimatePresence>
        {/* Тягучий ползунок */}
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, x: 10, filter: 'blur(0px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 10, filter: 'blur(4px)' }}
            transition={{ duration: 0.4, ease: 'circOut' }}
            /* Трек (направляющая) */
            className="relative w-[2px] h-[240px] bg-white/15 rounded-full overflow-visible"
          >
            {/* Метка START */}
            <div className="absolute -left-9 top-0 text-ui-nano font-geist-mono text-zinc-600 rotate-90 origin-right tracking-[0.2em]">
              START
            </div>
            {/* Тягучий ползунок */}
            <motion.div
              style={{
                y,
                scaleY: stretch,
                originY: origin,
                WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                backdropFilter: 'blur(10px) saturate(180%)',
              }}
              className="absolute -left-[3px] w-2 h-10 bg-white/30 border border-white/10 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.05)]"
            />
            {/* Метка END */}
            <div className="absolute -left-6 bottom-0 text-ui-nano font-geist-mono text-zinc-600 rotate-90 origin-right tracking-[0.2em]">
              END
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
