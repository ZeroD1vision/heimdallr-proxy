'use client';

import React from 'react';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';

// ─────────────────────────────────────────────────────────────────────────────
// AuthCard
//
// Стеклянная карточка-контейнер для всех форм в auth-зоне.
// Инкапсулирует слоистую структуру GlassPane + GlassPaneContent,
// чтобы потребитель (страница) не знал про детали реализации стекла.
//
// Архитектурное решение: вынесен из auth-layout.tsx в отдельный файл,
// потому что AuthLayout — это про позиционирование и сцену,
// а AuthCard — про визуальную обёртку контента. Разные ответственности.
// ─────────────────────────────────────────────────────────────────────────────

/** Пропсы карточки авторизации. */
interface AuthCardProps {
  /** Содержимое карточки — пока что просто форма с инпутами и кнопкой. */
  children: React.ReactNode;
}

/**
 * Стеклянная карточка для auth-форм.
 * Оборачивает контент в двуслойную структуру: backdrop-blur фон + контентный слой.
 *
 * @example
 * ```tsx
 * <AuthCard>
 *   <form>...</form>
 * </AuthCard>
 * ```
 */
export function AuthCard({ children }: AuthCardProps) {
  return (
    // Относительное позиционирование нужно для абсолютно-позиционированного GlassPane внутри.
    <div className="relative">
      {/* Ambient glow: размытый белый ореол позади карточки для эффекта свечения. */}
      <div className="absolute -inset-0.5 bg-white/5 blur-2xl opacity-20 transition duration-1000" />

      {/* ── Слой 1: стеклянный фон (backdrop-blur, box-shadow, хроматические аберрации) ── */}
      <GlassPane
        className="inset-0 shadow-2xl"
        style={{
          overflow: "hidden",
          borderRadius: '24px',
          // Полупрозрачный чёрный фон усиливает читаемость контента на видео-фоне.
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
        }}
      />

      {/* ── Слой 2: контент поверх стекла ── */}
      <GlassPaneContent className="relative z-10">
        {children}
      </GlassPaneContent>
    </div>
  );
}