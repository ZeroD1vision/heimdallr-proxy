'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';

interface GlassDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  triggerType?: 'hover' | 'click';
  align?: 'left' | 'right' | 'center';
  offsetClass?: string;
  className?: string;
}

export function GlassDropdown({
  trigger,
  children,
  triggerType = 'hover',
  align = 'right',
  offsetClass = 'mt-4',
  className = '',
}: GlassDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerType !== 'hover') return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (triggerType !== 'hover') return;
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  const handleTriggerClick = () => {
    if (triggerType !== 'click') return;
    setIsOpen((prev) => !prev);
  };

  useEffect(() => {
    if (triggerType !== 'click' || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, triggerType]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const alignClasses = {
    left: 'left-0 origin-top-left',
    right: 'right-0 origin-top-right',
    center: 'left-1/2 -translate-x-1/2 origin-top',
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Обертка триггера */}
      <div onClick={handleTriggerClick} className="cursor-pointer">
        {trigger}
      </div>

      {/* Невидимый мост для hover-а */}
      {triggerType === 'hover' && isOpen && (
        <div className="absolute top-full left-0 w-full h-5 z-40 pointer-events-auto" />
      )}

      {/* Выпадающее меню */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              // 1. Применяем тяжелый блюр прямо на анимируемый контейнер (плавность 100%)
              backdropFilter: 'blur(30px) saturate(160%) brightness(0.9)',
              WebkitBackdropFilter: 'blur(30px) saturate(160%) brightness(0.9)',
              
              // 2. Изолируем контекст наложения и подсказываем браузеру оптимизировать слои
              isolation: 'isolate',
              willChange: 'transform, opacity',
              borderRadius: '20px',
            }}
            // Добавляем overflow-hidden для четкого клиппинга размытия на углах
            className={`absolute z-50 overflow-hidden shadow-2xl ${alignClasses[align]} ${offsetClass}`}
          >
            {/* 
              Декоративный слой Chromatic Glass.
              Мы отключаем встроенный блюр (чтобы не было конфликтов и лагов), 
              но забираем отсюда каустику, верхний rim-light, внутренние тени и OLED-подложку.
            */}
            <GlassPane
              className="inset-0 pointer-events-none"
              style={{
                borderRadius: '20px',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                backgroundColor: 'rgba(0, 0, 0, 0.1)', // Темная подложка
                boxShadow: `
                  0 0 0 1px rgba(255, 255, 255, 0.08),
                  inset 0 1px 1px rgba(255, 255, 255, 0.10),
                  0 20px 40px rgba(0, 0, 0, 0.6)
                `
              }}
            />

            {/* Контентный слой */}
            <GlassPaneContent className={`p-5 ${className}`}>
              {children}
            </GlassPaneContent>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}