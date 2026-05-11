'use client';

import { motion, type MotionProps } from 'framer-motion';
import { type ReactNode, type ElementType, forwardRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// GlassPane + GlassPaneContent
//
// Compound-компонент для создания эффекта матового стекла.
// Реализует многослойную архитектуру:
//
//   ┌─────────────────────────────────────┐
//   │ GlassPaneContent (z: relative)      │  ← контент поверх стекла
//   ├─────────────────────────────────────┤
//   │ GlassPane (z: 0, position: absolute)│  ← backdrop-blur + box-shadow
//   │   ├── Каустика (top highlight)      │
//   │   ├── Канал Red (translateX -1.5px) │  ← хроматическая аберрация
//   │   ├── Канал Blue (translateX +1.5px)│  ← хроматическая аберрация
//   │   └── Green/Luminance layer         │
//   └─────────────────────────────────────┘
//
// Паттерн использования (Compound Components):
//
//   <div className="relative">      ← обязательно relative у родителя
//     <GlassPane />                 ← занимает inset-0 (весь родитель)
//     <GlassPaneContent>            ← поверх стекла
//       <p>Контент</p>
//     </GlassPaneContent>
//   </div>
//
// Почему GlassPane всегда `absolute`?
//   Стеклянный фон — декоративный слой. Он не должен влиять на поток документа
//   и layout родителя. Контент управляет размером контейнера, стекло — нет.
// ─────────────────────────────────────────────────────────────────────────────

// ── GlassPane ────────────────────────────────────────────────────────────────

/** Пропсы стеклянного фона. Наследует все Framer Motion пропсы для анимации входа/выхода. */
interface GlassPaneProps extends MotionProps {
  /** Дополнительные Tailwind-классы (например, `"inset-0 shadow-2xl"`). */
  className?: string;
}

/**
 * Фоновый слой со стеклянным эффектом.
 * Всегда `position: absolute`, всегда `z-index: 0`.
 *
 * Принимает MotionProps — можно анимировать появление через `initial`/`animate`.
 *
 * @example
 * ```tsx
 * <div className="relative">
 *   <GlassPane className="inset-0" style={{ borderRadius: '24px' }} />
 *   <GlassPaneContent>...</GlassPaneContent>
 * </div>
 * ```
 */
export function GlassPane({ className = '', ...motionProps }: GlassPaneProps) {
  return (
    <motion.div
      {...motionProps}
      className={`glass-pane ${className}`}
      style={{
        // Фиксированное позиционирование относительно родителя.
        position: 'absolute',
        zIndex: 0,

        // Основной эффект матового стекла:
        //   - blur(12px): размытие фона (backdrop)
        //   - saturate(180%): усиление насыщенности для "живости" стекла
        //   - brightness(1.05): лёгкое осветление для имитации преломления
        backdropFilter: 'blur(12px) saturate(200%) brightness(1.05)',
        WebkitBackdropFilter: 'blur(12px) saturate(200%) brightness(1.05)',

        // Почти прозрачный фон — основной цвет даёт backdrop-filter.
        background: 'rgba(0, 0, 0, 0.05)',

        boxShadow: `
          0 0 0 1px rgba(255, 255, 255, 0.07),        /* Внешняя грань — имитация толщины стекла */
          inset 0 1px 1px rgba(255, 255, 255, 0.15),  /* Верхний блик (Rim Light) */
          inset 0 -1px 20px rgba(0, 0, 0, 0.5),       /* Внутренняя тень снизу — объём и глубина */
          0 20px 40px rgba(0, 0, 0, 0.4)              /* Мягкая падающая тень на контент ниже */
        `,

        // motionProps.style имеет приоритет — потребитель может переопределить
        // любое свойство (например, borderRadius или backgroundColor).
        ...motionProps.style,
      }}
    >

      {/* ── Каустика: концентрация света у верхней границы стекла ──
          Тонкий градиент по горизонтали имитирует преломление света
          через верхнее ребро стеклянной пластины. */}
      <div
        className="absolute inset-x-0 top-0 h-[1px] pointer-events-none rounded-t-[inherit]"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.15) 60%, transparent 100%)',
          filter: 'blur(0.5px)',
        }}
      />

      {/* ── Green/Luminance: основной blur-слой ──
          Центральный (нейтральный) канал — даёт основной матовый эффект
          без цветового смещения. bg-white/[0.03] добавляет минимальную белизну. */}
      <div className="absolute inset-0 z-[-1] backdrop-blur-md bg-white/[0.03] rounded-[inherit]" />

      {/* Слот для CSS-based рефракционного эффекта из globals.css (если реализован). */}
      <div className="glass-pane-refraction absolute inset-0 pointer-events-none rounded-[inherit]" />
    </motion.div>
  );
}

// ── GlassPaneContent ─────────────────────────────────────────────────────────

/** Пропсы контентного слоя поверх стекла. */
interface GlassPaneContentProps {
  /** Контент, который отображается поверх GlassPane. */
  children: ReactNode;

  /** Дополнительные Tailwind-классы. */
  className?: string;

  /**
   * Полиморфный тэг или компонент.
   * Позволяет рендерить контентный слой как `motion.div`, `Link`, `section` и т.д.
   * @default "div"
   */
  as?: ElementType;

  /** Любые дополнительные пропсы, проброшенные в `as`-компонент. */
  [key: string]: unknown;
}

/**
 * Контентный слой поверх стеклянного фона.
 * Compound-пара для `GlassPane`.
 *
 * Полиморфен через `as` — поддерживает `motion.div`, `Link` и любые React-компоненты.
 *
 * @example
 * ```tsx
 * // Стандартное использование
 * <GlassPaneContent className="p-8">
 *   <h1>Заголовок</h1>
 * </GlassPaneContent>
 *
 * // С Framer Motion
 * <GlassPaneContent as={motion.div} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
 *   <p>Анимированный контент</p>
 * </GlassPaneContent>
 * ```
 */
export const GlassPaneContent = forwardRef<HTMLElement, GlassPaneContentProps>(({
  children,
  className = '',
  as: Component = 'div',
  ...props}, ref) => {
    const Tag = Component as ElementType;
    return (
      <Tag
      ref={ref}
        {...props}
        className={className}
        style={{
          // `relative` обязателен — без него контент окажется под GlassPane (z: 0).
          position: 'relative',
          // Позволяем потребителю добавить свои style-пропсы.
          ...(props.style as object),
        }}
      >
        {children}
      </Tag>
    );
  }
);