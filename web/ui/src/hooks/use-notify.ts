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
import { ApiError } from '@/lib/api-error';

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

  /** 
   * Умный пресет-интерцептор.
   * Парсит ошибку и превращает её в красивое системное уведомление.
   */
  apiError: (error: unknown, category = 'api_error'): NotifyInput => {
    // 1. Обработка наших типизированных ошибок сервера
    if (error instanceof ApiError) {
      switch (error.status) {
        case 401:
          return {
            message: 'Session expired. Please log in again.',
            category: 'auth_expired',
            priority: 10, // Максимальный приоритет
            type: 'persistent',
            ttl: 15_000,
            icon: 'error',
          };
        case 403:
          return {
            message: 'Access denied. Not enough permissions.',
            category: 'permission_denied',
            priority: 8,
            type: 'ephemeral',
            ttl: 8_000,
            icon: 'error',
          };
        case 429:
          return {
            message: 'Too many requests. Please wait a moment and try again.',
            category: 'rate_limit',
            priority: 7,
            type: 'ephemeral',
            ttl: 6_000,
            icon: 'warn',
          };
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            message: `Internal Heimdallr error: ${error.message}`,
            category: 'server_crash',
            priority: 9,
            type: 'persistent',
            ttl: 20_000,
            icon: 'error',
          };
        default:
          // Специфичные бизнес-ошибки бэка (например, "User already exists")
          return {
            message: error.message,
            category,
            priority: 6,
            type: 'ephemeral',
            ttl: 8_000,
            icon: 'error',
          };
      }
    }

    // 2. Обработка падения сети (если сервер вообще выключен / нет интернета)
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
      return {
        message: 'Connection lost. Please check your network or the node status.',
        category: 'network_offline',
        priority: 9,
        type: 'persistent',
        ttl: 15_000,
        icon: 'warn',
      };
    }

    // 3. Фолбек на случай непредвиденных JS-ошибок
    return {
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
      category,
      priority: 5,
      type: 'ephemeral',
      ttl: 6_000,
      icon: 'error',
    };
  }
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