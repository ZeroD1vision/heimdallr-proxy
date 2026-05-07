'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// DigitBox
//
// Одна ячейка OTP-кода. При получении значения воспроизводит анимацию:
//   1. "Домино-прыжок" - ячейка подпрыгивает со смещением по времени (delay = index * 100ms)
//   2. Перебор случайных цифр - имитация "слот-машины" перед остановкой на нужной цифре
//
// Используется в массиве: цифры кода рендерятся через .map() с передачей index,
// что создаёт каскадный эффект при вводе.
// ─────────────────────────────────────────────────────────────────────────────

/** Пропсы одной ячейки OTP. */
interface DigitBoxProps {
  /** Итоговое значение цифры (строка "0"-"9" или пустая строка если цифра ещё не введена). */
  value: string;

  /**
   * Порядковый индекс ячейки в ряду (0-based).
   * Используется для расчёта задержки анимации - каждая следующая
   * ячейка прыгает и крутится чуть дольше, создавая эффект домино.
   */
  index: number;

  /**
   * Флаг активной анимации. Когда `true` - запускает перебор цифр и прыжок.
   * Контролируется родителем: `true` в момент ввода, `false` в состоянии покоя.
   */
  isTyping: boolean;
}

/**
 * Анимированная ячейка одной цифры OTP-кода.
 *
 * @example
 * ```tsx
 * {otpDigits.map((digit, i) => (
 *   <DigitBox key={i} value={digit} index={i} isTyping={isAnimating} />
 * ))}
 * ```
 */
export function DigitBox({ value, index, isTyping }: DigitBoxProps) {
  // Отображаемое значение может отличаться от `value` во время анимации перебора.
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    // Анимация запускается только если: режим typing активен И значение уже есть.
    if (isTyping && value !== '') {
      let iterations = 0;

      // Каждая следующая ячейка крутится на 3 итерации дольше предыдущей —
      // визуальный эффект "нарастающего" домино.
      const maxIterations = 6 + index * 3;

      const interval = setInterval(() => {
        // Показываем случайную цифру каждые 70ms — имитация слот-машины.
        setDisplayValue(Math.floor(Math.random() * 10).toString());
        iterations++;

        if (iterations >= maxIterations) {
          // Остановка: фиксируем итоговое значение.
          setDisplayValue(value);
          clearInterval(interval);
        }
      }, 70);

      // Cleanup: если компонент размонтируется до окончания анимации -
      // clearInterval предотвращает утечку памяти и setState на мёртвый компонент.
      return () => clearInterval(interval);
    } else {
      // Без анимации: просто отображаем значение напрямую.
      // Пустая строка → отображаем пусто (не "0"), чтобы незаполненные ячейки выглядели пусто.
      setDisplayValue(value || '');
    }
  }, [value, isTyping, index]);

  return (
    <motion.div
      initial={{ y: 0 }}
      animate={
        isTyping
          ? {
              // Эффект прыжка: ячейка подпрыгивает на 12px и возвращается.
              // `delay: index * 0.1` - каскад: каждая следующая прыгает позже.
              y: [0, -12, 0],
              transition: { delay: index * 0.1, duration: 0.4, ease: 'easeOut' },
            }
          : {}
      }
      className={`
        w-12 h-16 flex items-center justify-center
        rounded-xl border font-geist-mono text-2xl
        transition-all duration-300
        ${
          value
            ? // Заполненная ячейка: яркая, с лёгким свечением.
              'bg-white/10 border-white/30 text-white text-glow shadow-[0_0_15px_rgba(255,255,255,0.1)]'
            : // Пустая ячейка: приглушённая, почти невидимая.
              'bg-white/2 border-white/10 text-white/50'
        }
      `}
    >
      {displayValue}
    </motion.div>
  );
}