'use client';

import { motion, type MotionProps } from 'framer-motion';
import { type ReactNode, type ElementType } from 'react';

// ─── GlassPane — фоновый слой со стеклом ───────────────────────────────────
// Всегда absolute, всегда z-index 0.
// Контракт: потребитель не думает о позиционировании — шторка сама знает что она фон.

interface GlassPaneProps extends MotionProps {
  className?: string;
}

export function GlassPane({ className = '', ...motionProps }: GlassPaneProps) {
  return (
    <motion.div
      {...motionProps}
      className={`glass-pane ${className}`}
      style={{
        position: 'absolute',
        zIndex: 0,
        backdropFilter: 'blur(12px) saturate(180%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(12px) saturate(180%) brightness(1.05)',
        background: 'rgba(0, 0, 0, 0.04)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.1)',
        ...motionProps.style,
      }}
    >
      {/* Канал Red: смещен чуть влево */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-50 mix-blend-screen rounded-[inherit]"
           style={{ 
             backdropFilter: 'blur(12px)',
             WebkitBackdropFilter: 'blur(12px)',
             clipPath: 'inset(0 1px 0 0)', // Микро-сдвиг логический
             transform: 'translateX(-1.5px)' 
           }} />
      
      {/* Канал Blue/Cyan: смещен чуть вправо */}
      <div className="absolute inset-0 z-[-1] pointer-events-none opacity-50 mix-blend-screen rounded-[inherit]"
           style={{ 
             backdropFilter: 'blur(12px)',
             WebkitBackdropFilter: 'blur(12px)',
             clipPath: 'inset(0 0 0 1px)',
             transform: 'translateX(1.5px)' 
           }} />

      {/* Основной слой (Green/Luminance) */}
      <div className="absolute inset-0 z-[-1] backdrop-blur-md bg-white/[0.03] rounded-[inherit]" />
      
      <div className="glass-pane-refraction absolute inset-0 pointer-events-none rounded-[inherit]" />
    </motion.div>
  );
}

// ─── GlassPaneContent — контентный слой поверх шторки ──────────────────────
// Compound component паттерн: потребитель явно говорит "это контент поверх стекла".
// Поддерживает полиморфизм через `as` — можно передать motion.div, Link, и т.д.

interface GlassPaneContentProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  [key: string]: unknown;
}

export function GlassPaneContent({
  children,
  className = '',
  as: Component = 'div',
  ...props
}: GlassPaneContentProps) {
  return (
    <Component
      {...props}
      className={className}
      style={{
        position: 'relative',
        ...(props.style as object),
      }}
    >
      {children}
    </Component>
  );
}