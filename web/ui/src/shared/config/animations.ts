/**
 * @file animations.ts
 * @description Единый манифест таймингов анимации для дизайн-системы острова.
 */

export const NAVBAR_ANIMATION_TOKENS = {
  // 1. Геометрический транзит изменения размеров самого стеклянного острова
  LAYOUT: {
    DURATION_SEC: 0.4,              // Для Framer Motion
    TIMEOUT_MS: 400,                // Для XState (должно соответствовать DURATION_SEC)
    EASE: [0.22, 1, 0.36, 1] as const, // Выверенная кастомная кривая типа cubic-bezier
  },

  // 2. Фаза контролируемого затухания эффектов (свечения) перед схлопыванием
  FADE_OUT: {
    DURATION_SEC: 0.2,
    TIMEOUT_MS: 200,
  },

  // 3. Контентные слои (всплытие текста и иконок внутри пузыря уведомления)
  CONTENT: {
    BUBBLE_FADE_SEC: 0.25,
    INNER_TRANSIT_SEC: 0.3,
  },

  NAVBAR_STACK_GAP: 46, // px, ширина стеклянного расширения под стек постоянных элементов
} as const;