/**
 * @file use-notify.ts
 * @description Публичный API для отправки уведомлений из любой точки приложения.
 *
 * Пример использования:
 *   const { notify } = useNotify();
 *   notify({ message: 'Login successful', category: 'auth_success', priority: 6, type: 'ephemeral', ttl: 8000 });
 *
 * Этот хук намеренно очень тонкий. Вся логика очереди, дедупликации и
 * разрешения приоритетов живёт исключительно в машине XState.
 * Компоненты никогда не должны импортировать actor машины напрямую.
 */

'use client';

import { useCallback } from 'react';
import { useNotificationActor } from '../store/use-notification-machine';
import type { Notification, NavbarOrigin } from '../store/use-notification-machine';

// ─── Пресеты уведомлений ──────────────────────────────────────────────────────
// Продуманные значения по умолчанию, которые отражают продуктовые соглашения.
// Вызывающий код может переопределить любое поле.

export const NotificationPresets = {
  /** Временная обратная связь: ошибки валидации формы, мелкие предупреждения. */
  info: (message: string): NotifyInput => ({
    message,
    category: 'info',
    priority: 3,
    type: 'ephemeral',
    ttl: 6_000,
    icon: 'info',
  }),

  /** Успешное действие без высокого риска: сохранение, копирование, небольшое завершение. */
  success: (message: string, category = 'success'): NotifyInput => ({
    message,
    category,
    priority: 5,
    type: 'ephemeral',
    ttl: 5_000,
    icon: 'check',
  }),

  /** Ошибка для пользователя, возникшая при действии (сбой авторизации, валидация). */
  error: (message: string, category = 'error'): NotifyInput => ({
    message,
    category,
    priority: 8,
    type: 'ephemeral',
    ttl: 10_000,
    icon: 'error',
  }),

  /** Предупреждение на уровне системы: ухудшение соединения, приближение к лимиту запросов. */
  warn: (message: string, category = 'warn'): NotifyInput => ({
    message,
    category,
    priority: 7,
    type: 'persistent',
    ttl: 15_000,
    icon: 'warn',
  }),

  /** Критическое системное событие: сессия истекла, узел недоступен. */
  critical: (message: string, category: string): NotifyInput => ({
    message,
    category,
    priority: 10,
    type: 'persistent',
    ttl: 30_000,
    icon: 'error',
  }),
} as const;

// ─── Типы ─────────────────────────────────────────────────────────────────────

export type NotifyInput = Omit<Notification, 'id' | 'createdAt'>;

interface UseNotifyReturn {
  /**
  * Отправляет уведомление. Машина сама обрабатывает всю логику приоритетов,
  * схлопывания и TTL — вызывающий код просто описывает, что произошло.
   */
  notify: (input: NotifyInput, origin?: NavbarOrigin) => void;
  /** Программное скрытие текущего отображаемого уведомления. */
  dismiss: () => void;
}

// ─── Хук ──────────────────────────────────────────────────────────────────────

export function useNotify(): UseNotifyReturn {
  const actor = useNotificationActor();

  const notify = useCallback(
    (input: NotifyInput, origin: NavbarOrigin = 'small') => {
      const id = `${input.category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      actor.send({
        type: 'NOTIFY',
        origin,
        payload: { ...input, id },
      });
    },
    [actor]
  );

  const dismiss = useCallback(() => {
    actor.send({ type: 'DISMISS' });
  }, [actor]);

  return { notify, dismiss };
}