'use client';

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// AuthButton
//
// Единая кнопка для всех форм в auth-зоне. Намеренно не выносится в /ui —
// её стиль (белый фон, caps, геометрия) специфичен для auth и не должен
// просачиваться в другие части приложения.
//
// Принцип: один компонент — одна ответственность.
// Кнопка знает только о своём внешнем виде и состоянии загрузки;
// бизнес-логику (что делать по клику) передаёт потребитель.
// ─────────────────────────────────────────────────────────────────────────────

/** Пропсы кнопки авторизации. */
interface AuthButtonProps {
  /** Дочерний контент — лейбл кнопки (например, "Initialize", "Sign In"). */
  children: React.ReactNode;

  /**
   * Тип HTML-кнопки.
   * @default "submit"
   */
  type?: 'button' | 'submit';

  /**
   * Когда `true` — кнопка блокируется и показывает анимированный лоадер
   * вместо текста. Удобно биндить напрямую к стейту `isLoading` формы.
   */
  isLoading?: boolean;

  /**
   * Принудительная блокировка без индикатора загрузки.
   * Используется, например, для валидации формы до отправки.
   */
  disabled?: boolean;

  /** Опциональный обработчик клика. Обычно не нужен при `type="submit"`. */
  onClick?: () => void;
}

/**
 * Кнопка отправки для auth-форм.
 *
 * @example
 * ```tsx
 * <AuthButton isLoading={isSubmitting}>Initialize</AuthButton>
 * ```
 */
export function AuthButton({
  children,
  type = 'submit',
  isLoading = false,
  disabled = false,
  onClick,
}: AuthButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      // Блокируем кнопку в обоих случаях: явный disabled и состояние загрузки.
      disabled={disabled || isLoading}
      className="
        w-full bg-white text-black
        font-syne font-black text-ui-xs uppercase tracking-[0.3em]
        py-5 rounded-2xl mt-4
        hover:bg-zinc-200 active:scale-[0.98]
        transition-all duration-300
        disabled:opacity-20 disabled:pointer-events-none
        shadow-[0_0_20px_rgba(255,255,255,0.1)]
      "
    >
      {/* ── Состояние загрузки: три прыгающих dot'а ── */}
      {isLoading ? (
        <span className="flex items-center justify-center gap-2" aria-label="Loading">
          <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1 h-1 bg-black rounded-full animate-bounce" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}