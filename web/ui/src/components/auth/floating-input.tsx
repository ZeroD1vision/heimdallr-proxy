'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// FloatingInput
//
// Инпут с анимированной плавающей меткой (floating label pattern).
// При фокусе или непустом значении метка "улетает" вверх и уменьшается,
// освобождая место для вводимого текста.
//
// Дополнительно:
//   - Placeholder появляется только при фокусе + пустом значении (через AnimatePresence)
//   - Декоративная градиентная линия снизу при фокусе
//   - Хроматические аберрации на стекле (через INPUT_CLASS/backdrop-filter)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Базовые CSS-классы для `<input>`.
 * Вынесены в константу для читаемости и переиспользования в будущем.
 *
 * Главные моменты:
 * - `placeholder-transparent`: скрываем нативный placeholder - он управляется вручную через AnimatePresence.
 * - `peer`: позволяет стилизовать соседние элементы через Tailwind `peer-*` (не используется здесь, но задел на будущее).
 * - `backdrop-blur-3xl backdrop-saturate-[180%]`: имитация матового стекла, согласованная с GlassPane.
 */
const INPUT_CLASS = `
  w-full rounded-2xl px-5 py-4
  text-white text-[17px] outline-none
  font-mono tracking-wider placeholder-transparent
  bg-black/80 border border-white/10
  backdrop-blur-3xl backdrop-saturate-[180%]
  shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
  focus:border-white/25 focus:bg-black/100
  transition-all peer
`;

/** Пропсы компонента FloatingInput. */
interface FloatingInputProps {
  /** Текст метки — отображается как floating label. */
  label: string;

  /** Текущее значение инпута (controlled component). */
  value: string;

  /** Обработчик изменения значения. */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

  /**
   * HTML-тип инпута.
   * @default "text"
   */
  type?: string;

  /**
   * Подсказка, которая показывается внутри поля только при фокусе и пустом значении.
   * В отличие от нативного `placeholder`, анимируется через AnimatePresence.
   */
  placeholder?: string;

  /**
   * Атрибут `autocomplete` для браузерного автозаполнения.
   * Рекомендуется передавать явно: `"email"`, `"current-password"`, `"new-password"` и т.д.
   */
  autoComplete?: string;
}

/**
 * Инпут с анимированной плавающей меткой для auth-форм.
 *
 * @example
 * ```tsx
 * <FloatingInput
 *   label="Email"
 *   value={email}
 *   onChange={e => setEmail(e.target.value)}
 *   placeholder="user@example.com"
 *   autoComplete="email"
 * />
 * ```
 */
export function FloatingInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
}: FloatingInputProps) {
  // Локальный стейт фокуса нужен только для управления анимациями.
  // Сам инпут - controlled через пропсы value/onChange.
  const [isFocused, setIsFocused] = useState(false);

  /**
   * Метка "улетает" вверх если:
   * - Поле в фокусе (пользователь набирает текст), ИЛИ
   * - Поле уже содержит значение (чтобы метка не перекрывала введённый текст).
   */
  const isFloating = isFocused || value.length > 0;

  return (
    // `group` позволяет в будущем стилизовать дочерние элементы через `group-hover`.
    <div className="relative group w-full">

      {/* ── Floating Label ──
          Анимируется через Framer Motion animate-объект.
          `initial={false}` отключает вступительную анимацию при первом рендере -
          метка сразу рендерится в правильном состоянии. */}
      <motion.label
        initial={false}
        animate={{
          // Центрирование: top-1/2 в CSS + translateY(-50%) = вертикальный центр.
          // В активном состоянии метка поднимается на 250% вверх от своей высоты.
          y: isFloating ? '-250%' : '-50%',
          // Лёгкий сдвиг влево при floating для оптической выравненности.
          x: isFloating ? '-10px' : '0%',
          scale: isFloating ? 0.85 : 1,
          opacity: isFloating ? 1 : 0.85,
          color: isFloating
            ? 'rgba(255, 255, 255, 0.4)'
            : 'rgba(255, 255, 255, 0.3)',
        }}
        transition={{
          duration: 0.5,
          // Custom cubic-bezier: плавный выход с "пружинным" эффектом.
          ease: [0.16, 1, 0.3, 1],
        }}
        className="
          absolute top-1/2 left-5
          pointer-events-none
          font-mono text-sm uppercase tracking-widest text-white
          origin-left z-10
        "
      >
        {label}
      </motion.label>

      {/* ── Кастомный Placeholder ──
          Показывается только при фокусе и пустом значении.
          AnimatePresence управляет появлением/исчезновением через opacity. */}
      <AnimatePresence>
        {isFocused && !value && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="
              absolute left-5 top-1/2 -translate-y-1/2
              pointer-events-none
              font-mono text-[15px] text-zinc-600
              z-10
            "
          >
            {placeholder}
          </motion.span>
        )}
      </AnimatePresence>

      {/* ── Input ──
          `placeholder=""` - пустой нативный placeholder, т.к. мы управляем им вручную выше.
          onFocus/onBlur обновляют только локальный isFocused, не трогая внешний стейт. */}
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoComplete={autoComplete}
        placeholder=""
        className={INPUT_CLASS}
      />

      {/* ── Декоративная линия фокуса ──
          Градиент от прозрачного к белому и обратно - подчёркивает активное поле
          без агрессивного outline. scaleX: 0=>1 анимирует "раскрытие" линии. */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{
          scaleX: isFocused ? 1 : 0,
          opacity: isFocused ? 1 : 0,
        }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}