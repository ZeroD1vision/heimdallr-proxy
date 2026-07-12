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
   * Переносит элемент в persistent stack в момент, когда он окончательно покидает экран
   * (по таймеру или при замене другим уведомлением), если только он не был временно
   * вытеснен более высоким приоритетом обратно в очередь.
   */
  useEffect(() => {
    let prevCurrent: any = null;
    
    const subscription = actor.subscribe((snapshot) => {
      const current = snapshot.context.current;
      const queue = snapshot.context.queue;
    
      // Если на экране только что было персистентное уведомление, а теперь слот обновился/очистился
      if (
        prevCurrent && 
        prevCurrent.type === 'persistent' && 
        prevCurrent.id !== current?.id
      ) {
        // Проверяем, не находится ли вытесненное уведомление снова в очереди
        const isStillInQueue = queue.some((item) => item.id === prevCurrent.id);
        
        // Если его нет в очереди — значит оно отработало свой цикл и должно уйти в стек
        if (!isStillInQueue) {
          pushPersistent({
            id: prevCurrent.id,
            message: prevCurrent.message,
            icon: prevCurrent.icon ?? 'info',
            category: prevCurrent.category,
          });
        }
      }
    
      // Сохраняем указатель для следующего снимка
      prevCurrent = current;
    });
  
    return () => subscription.unsubscribe();
  }, [actor, pushPersistent]);

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