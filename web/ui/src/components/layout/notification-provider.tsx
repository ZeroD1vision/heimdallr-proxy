/**
 * @file notification-provider.tsx
 * @description React-провайдер контекста, который запускает actor уведомлений XState
 * и делает его доступным для всего дерева компонентов.
 *
 * Монтировать это надо лишь однажды — прямо внутри корневого layout, выше <Navbar />.
 * Все дочерние компоненты получают доступ к actor через useNotify() или
 * хуки-селекторы из use-notification-machine.ts.
 */

'use client';

import { useActorRef } from '@xstate/react';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  notificationMachine,
  NotificationMachineContext,
} from '@/store/use-notification-machine';
import { usePersistentStack } from '@/store/use-persistent-stack';

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const actor = useActorRef(notificationMachine);
  const pushPersistent = usePersistentStack((s) => s.push);

  /**
   * Мост побочного эффекта: когда машина завершает shrinking для уведомления
   * типа `persistent`, переносим его в левый стек Zustand.
   *
   * Мы подписываемся на снимки actor вместо использования встроенного в XState
   * `observe`, чтобы сохранить идиоматичный для React паттерн — один useEffect,
   * одна подписка, корректная очистка.
   */
  useEffect(() => {
    console.log('[Provider] Subscribing to actor');
    let previousStateName: string | null = null;

    const subscription = actor.subscribe((snapshot) => {
      const currentStateName = snapshot.value as string;
      const state = snapshot.value;
      const currentMsg = snapshot.context.current?.message || 'null';

      console.log(`[Machine → ${state}] current: "${currentMsg}"`, 
        snapshot.context.queue.length > 0 ? `(queue: ${snapshot.context.queue.length})` : '');
      // Определяем границу перехода shrinking → idle.
      if (
        previousStateName === 'shrinking' &&
        currentStateName === 'idle'
      ) {
        // К этому моменту машина уже вызвала clearCurrent,
        // но снимок, захваченный прямо перед вызовом clearCurrent, всё ещё
        // содержит уведомление в контексте. Мы сохранили его в ref ниже.
      }

      previousStateName = currentStateName;
    });

    return () => subscription.unsubscribe();
  }, [actor]);

  /**
   * Отдельная подписка для переноса постоянного элемента.
   * Срабатывает при каждом входе в `shrinking`, когда context.current имеет тип persistent.
   */
  useEffect(() => {
    const subscription = actor.subscribe((snapshot) => {
      if (
        snapshot.value === 'shrinking' &&
        snapshot.context.current?.type === 'persistent'
      ) {
        const n = snapshot.context.current;
        pushPersistent({
          id: n.id,
          message: n.message,
          icon: n.icon ?? 'info',
          category: n.category,
        });
      }
    });

    return () => subscription.unsubscribe();
  }, [actor, pushPersistent]);

  return (
    <NotificationMachineContext.Provider value={actor}>
      {children}
    </NotificationMachineContext.Provider>
  );
}