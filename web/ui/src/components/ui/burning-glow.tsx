'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { useNotificationState } from '@/store/use-notification-machine'; // Подключаем селектор

interface BurningGlowProps {
  color: string | null;
}

export function BurningGlow({ color }: BurningGlowProps) {
  // Управляем стадиями анимации
  // 'run' — огонек бежит и зажигает путь
  // 'burst' — зажглось, всплеск яркости на 0.5 сек
  // 'breathe' — опустилось до нормы, дышит
  const machineState = useNotificationState(); // Синхронизируем с стейт-машиной
  const [phase, setPhase] = useState<'run' | 'burst' | 'breathe'>('run');
  const containerRef = useRef<HTMLDivElement>(null);
  // Стартуем с нулевых или базовых размеров, они мгновенно перепишутся обзервером
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, radius: 0 });

  // Реакция на смену глобальных фаз автомата
  useEffect(() => {
    if (!color) return;

    if (machineState === 'expanding') {
      setPhase('run'); // Комета бежит, пока остров расширяется
    } else if (machineState === 'visible') {
      setPhase('burst'); // Остров раскрылся (ANIMATION_END) -> взрыв!
      
      const burstTimer = setTimeout(() => {
        setPhase('breathe'); // Через 500мс взрыв остывает до мерного дыхания
      }, 500);

      return () => clearTimeout(burstTimer);
    }
  }, [machineState, color]);

  // Отслеживаем реальные размеры острова из родительского контейнера
  useEffect(() => {
    if (!color) {
      setPhase('run');
      return;
    }

    const currentContainer = containerRef.current;
    if (!currentContainer) return;

    const parent = currentContainer.parentElement;
    if (!parent) return;

    // Намертво привязываемся к физическому стеклу
    const glassTarget = parent.querySelector('.glass-pane') || parent;

    // Создаем обзервер, который ловит каждый пиксель изменения при spring-анимации
    const resizeObserver = new ResizeObserver(() => {
      const rect = glassTarget.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(glassTarget);
      const radius = parseInt(computedStyle.borderRadius, 10) || 24;

      setDimensions({
        width: rect.width,
        height: rect.height,
        radius: radius
      });
    });

    resizeObserver.observe(glassTarget);
    
    // Тайминг фаз:
    // 1.5 секунды бежит огонек -> переключаем на всплеск (burst)
    const burstTimer = setTimeout(() => setPhase('burst'), 1500);
    // Через 0.5 секунды после всплеска переходим в режим дыхания (breathe)
    const breatheTimer = setTimeout(() => setPhase('breathe'), 2500);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(burstTimer);
      clearTimeout(breatheTimer);
    };
  }, [color]);

  if (!color) return null;

  // Декларативные флаги видимости слоев на основе стейта автомата
  const isSvgVisible = machineState === 'expanding';
  const isGlowActive = (machineState === 'visible' || machineState === 'changing') && phase !== 'run';

  // Вычисляем смещение толщины, чтобы SVG не подрезал края фильтра свечения
  const strokeWidthHead = 5;
  const offset = strokeWidthHead / 2;

  const trailWeight = 1.5;
  const headWeight = 5;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        isolation: 'isolate', // Защищает контекст наложения слоев
        borderRadius: `${dimensions.radius}px`,
        ['--glow-primary' as any]: color,
        ['--glow-secondary' as any]: '#ef4444',
      }}
    >
      {/* ─── СЛОЙ А: БЕГУЩИЙ ОГОНЕК И СЛЕД (ПЛАВНО ТАЕТ ПРИ СМЕНЕ ФАЗ) ─── */}
      <motion.svg 
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="absolute inset-0 w-full h-full overflow-visible"
        // Плавное исчезновение всего SVG слоя при переходе к burst
        animate={{ opacity: phase === 'run' ? 1 : 0 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
      >
        <defs>
          <filter id="heavyGlow" x="-30%" y="-30%" width="160%" height="160%">
            <motion.feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. СЛЕД (TRAIL): Нарастает по часовой стрелке, подготавливая базу */}
        <motion.rect
          x={trailWeight / 2}
          y={trailWeight / 2}
          width={dimensions.width - trailWeight}
          height={dimensions.height - trailWeight}
          rx={dimensions.radius}
          fill="none"
          stroke="var(--glow-primary)"
          strokeWidth="1.5"
          pathLength={100}
          style={{ strokeDasharray: 100 }}
          initial={{ strokeDashoffset: 100 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.3, ease: "easeOut" }}
        />

        {/* 2. ГОЛОВКА (HEAD): Яркая, толстая кометная головка, сгорающая в конце */}
        <motion.rect
          x={headWeight / 2}
          y={headWeight / 2}
          width={dimensions.width - headWeight}
          height={dimensions.height - headWeight}
          rx={dimensions.radius}
          fill="none"
          stroke="#ffffff"
          filter="url(#heavyGlow)"
          pathLength={100}
          // Задаем длину кометы в 15% от общего периметра
          style={{ strokeDasharray: "15 85" }} 
          // Сдвиг начинается со 115, чтобы комета плавно вылетела из начальной точки
          initial={{ strokeDashoffset: 115 }}
          animate={{ 
            strokeDashoffset: 0,
            // Физика сгорания: уменьшаем толщину и прозрачность на последних кадрах пути
            strokeWidth: [3, 3, 1, 0],
            opacity: [1, 1, 0.7, 0]
          }}
          transition={{ 
            duration: 1.5, 
            ease: "easeOut"
          }}
        />
      </motion.svg>

      {/* ─── СЛОЙ Б: ПЕРЕХОД В ДЫХАНИЕ (BREATHE) ─── */}
      <motion.div
        className="absolute inset-0"
        // Управляем состоянием через единый декларативный стейт анимации
        style={{ 
          borderRadius: `${dimensions.radius}px`,
          borderStyle: 'solid',
          borderWidth: '1px',
          borderColor: color || 'transparent'
        }}
        // Слой плавно проявляется и просто крутит бесконечный красный цикл
        animate={{ 
          opacity: isGlowActive ? 1 : 0,
          boxShadow: [
            `0 0 6px 1px ${color}, inset 0 0 2px #ef4444`,  // Минумум (Старт)
            `0 0 10px 3px ${color}, inset 0 0 4px #ef4444`,  // Максимум (Вдох)
            `0 0 6px 1px ${color}, inset 0 0 2px #ef4444`   // Возврат в минимум
          ]
        }}
        transition={{
          opacity: { duration: 0.3, ease: 'easeOut' },
          boxShadow: { 
            repeat: Infinity, 
            duration: 4.0, 
            ease: 'easeInOut' 
          }
        }}
      />
      {/* ─── СЛОЙ В: ВСПЛЕСК (BURST) ─── */}
      <motion.div
        className="absolute inset-0"
        style={{ 
          borderRadius: `${dimensions.radius}px`,
          borderStyle: 'solid',
          borderColor: '#ffffff'
        }}
        initial={{ opacity: 0 }}
        // Реагирует ТОЛЬКО на фазу burst. Вылетает на пик и сам гаснет в ноль.
        animate={phase === 'burst' && machineState === 'visible' ? {
          opacity: [0, 1, 0],
          boxShadow: `0 0 35px 5px ${color}, 0 0 12px 2px #ffffff, inset 0 0 15px #ef4444`,
          borderWidth: ['0px', '1.5px', '0px']
        } : { opacity: 0 }}
        transition={{
          duration: 0.8, // Вспышка и остывание суммарно занимают 0.8с внутри секундного окна burst
          times: [0, 0.2, 1.0], // 0.2с на резкий бабах, остальные 0.6с на плавное угасание оверлея
          ease: 'easeOut'
        }}
      />
    </div>
  );
}