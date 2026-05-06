// ─────────────────────────────────────────────────────────────────────────────
// Barrel Export — Auth Components
//
// Единая точка импорта для всех компонентов auth-зоны.
// Кому нужно, пишут:
//   import { AuthLayout, AuthCard, AuthButton, FloatingInput } from '@/components/auth';
// вместо четырёх отдельных импортов.
//
// Экспортируем только публичный API зоны.
// Внутренние хелперы (константы, утилиты) — НЕ экспортируем отсюда.
// ─────────────────────────────────────────────────────────────────────────────

export { AuthLayout } from './auth-layout';
export { AuthCard } from './auth-card';
export { AuthButton } from './auth-button';
export { FloatingInput } from './floating-input';
export { DigitBox } from './digit-box';