/**
 * @file use-notification-machine.ts
 * @description Конечный автомат XState v5 для системы уведомлений навбара.
 *
 * Архитектура: смешанный автомат Мура/Мили.
 *   - Выходы Мура (визуальное состояние навбара) зависят только от текущего состояния.
 *   - Переходы Мили (фильтрация очереди, вытеснение по приоритету) зависят и от
 *     текущего состояния, и от полезной нагрузки входящего события.
 *
 * Состояния:
 *   idle → expanding → visible → changing → shrinking → idle
 *
 * Три инвариантных правила, применяемых на каждом NOTIFY:
 *   1. Вытеснение — более высокий приоритет прерывает текущее отображение.
 *   2. Схлопывание — одинаковый ID категории объединяется в одну запись.
 *   3. TTL — устаревшие элементы очереди (> ttl ms) отбрасываются.
 */

import { setup, assign, sendTo, raise, fromCallback, InspectionEvent } from 'xstate';

// ─── Типы предметной области ──────────────────────────────────────────────────

export type NotificationType = 'ephemeral' | 'persistent';
export type NotificationIcon = 'check' | 'error' | 'warn' | 'info';
export type NavbarOrigin = 'large' | 'small';

export interface Notification {
  /** Уникальный идентификатор — используется чтобы не было дубликатов. */
  id: string;
  message: string;
  /**
   * Ключ категории, используемый правилом схлопывания.
   * Уведомления с одной и той же категорией заменяют друг друга в очереди.
   * Например: 'auth_error', 'upload_progress', 'system_critical'.
   */
  category: string;
  /**
   * 1 (минимальный) → 10 (максимальный).
   * Правило вытеснения: incoming.priority > current.priority → вытеснить.
   */
  priority: number;
  /**
   * Время жизни в миллисекундах.
   * Правило схлопывания использует это значение, чтобы отбрасывать устаревшие элементы очереди.
   */
  ttl: number;
  /** Одноразовое — показывается и затем удаляется. Постоянное — оставляет иконку в левом стеке. */
  type: NotificationType;
  icon?: NotificationIcon;
  /** Метка времени создания — используется для проверки истечения TTL. */
  createdAt: number;
}

// ─── Контекст машины ──────────────────────────────────────────────────────────

interface NotificationContext {
  /** Текущее отображаемое уведомление. Null в состояниях idle/shrinking. */
  current: Notification | null;
  /** Очередь с приоритетом — перед вставкой фильтруется по всем трём правилам. */
  queue: Notification[];
  /**
   * Форма навбара в момент первого срабатывания NOTIFY.
   * Определяет цель обратной анимации в состоянии shrinking.
   */
  origin: NavbarOrigin;
}

// ─── События ──────────────────────────────────────────────────────────────────

export type NotificationEvent =
  | { type: 'NOTIFY'; payload: Omit<Notification, 'createdAt'>, origin?: NavbarOrigin; }
  | { type: 'ANIMATION_END' }
  | { type: 'TIMER_DONE' }
  | { type: 'DISMISS' };

// ─── Утилиты очереди (чистые функции — легко покрываются юнит-тестами) ────────

const MAX_QUEUE_DEPTH = 5;
const FAST_DRAIN_THRESHOLD = 3; // Глубина очереди, при которой включается более быстрое время показа
const FAST_DRAIN_MS = 1000;
const NORMAL_DISPLAY_MS = 3000;

/**
 * Правило 3 — TTL: отбрасывать записи, которые ожидали слишком долго.
 */
function purgeStalentries(queue: Notification[]): Notification[] {
  const now = Date.now();
  return queue.filter((n) => now - n.createdAt < n.ttl);
}

/**
 * Правило 2 — схлопывание: объединять записи одной категории в самую свежую.
 * Оставляет только последнее вхождение для каждой категории (сохраняя порядок
 * вставки первого вхождения, чтобы избежать визуальной перестановки).
 */
function collapseByCategory(queue: Notification[]): Notification[] {
  const seen = new Map<string, number>(); // category → index of kept entry
  const result: Notification[] = [];

  for (const n of queue) {
    if (seen.has(n.category)) {
      // Перезаписываем более раннюю запись более свежей полезной нагрузкой
      result[seen.get(n.category)!] = n;
    } else {
      seen.set(n.category, result.length);
      result.push(n);
    }
  }
  return result;
}

/**
 * Сортировка по убыванию приоритета, затем по возрастанию createdAt (FIFO внутри уровня).
 */
function sortQueue(queue: Notification[]): Notification[] {
  return [...queue].sort(
    (a, b) => b.priority - a.priority || a.createdAt - b.createdAt
  );
}

/**
 * Полный конвейер обработки очереди: очистка → схлопывание → сортировка → ограничение.
 * Применяется каждый раз при добавлении нового уведомления.
 */
function processQueue(queue: Notification[]): Notification[] {
  return sortQueue(collapseByCategory(purgeStalentries(queue))).slice(
    0,
    MAX_QUEUE_DEPTH
  );
}

/**
 * Определяет, должно ли входящее уведомление немедленно вытеснить
 * текущее отображаемое уведомление (Правило 1 — вытеснение).
 *
 * Вытеснение срабатывает, когда:
 *   - incoming.priority строго больше current.priority, ИЛИ
 *   - incoming.priority === current.priority И совпадает категория (идемпотентное обновление)
 */
function shouldPreempt(
  incoming: Notification,
  current: Notification | null
): boolean {
  if (!current) return false;
  if (incoming.priority > current.priority) return true;
  if (incoming.priority === current.priority && incoming.category === current.category) return true;
  return false;
}

/**
 * Решает, должен ли NOTIFY во время SHRINKING немедленно разворачиваться назад
 * (Путь А) или ждать полного схлопывания (Путь Б).
 *
 * Путь А (немедленный обратный переход): priority >= 7 — критические сообщения не терпят задержки.
 * Путь Б (сначала полное схлопывание): priority < 7 — малозначимый шум; краткий
 *   визуальный «вдох» полного схлопывания и повторного раскрытия на самом деле
 *   показывает пользователю, что начинается новый контекст.
 */
function shouldReverseImmediately(incoming: Notification): boolean {
  return incoming.priority >= 7;
}

// ─── Вспомогательная функция таймера показа ───────────────────────────────────

function displayDurationMs(queue: Notification[]): number {
    const result = queue.length > 0 ? 1000 : 3000;
    console.log('[Machine] Calculated Delay:', result); // ЧТО ТУТ В КОНСОЛИ?
    return result;
    return queue.length >= FAST_DRAIN_THRESHOLD ? FAST_DRAIN_MS : NORMAL_DISPLAY_MS;
}

// ─── Определение машины ───────────────────────────────────────────────────────

export const notificationMachine = setup({
  types: {
    context: {} as NotificationContext,
    events: {} as NotificationEvent,
  },

  actions: {
    /**
     * Сохраняет текущую форму навбара, чтобы shrinking мог зеркально повторить расширение.
     * Вызывается один раз при входе NOTIFY — до любого перехода состояния.
     */
    captureOrigin: assign(({ event }) => ({
      origin: (event as any).origin || 'small',
    })),

    /**
     * Перемещает голову очереди в слот отображения.
     */
    dequeueNext: assign(({ context }) => {
      const [next, ...rest] = context.queue;
      return { current: next ?? null, queue: processQueue(rest) };
    }),

    /**
     * Заменяет текущее уведомление входящим (путь вытеснения).
     * Вытесненное уведомление повторно вставляется в очередь, если оно всё ещё валидно.
     */
    preemptCurrent: assign(({ context }, params: { incoming: Notification }) => {
      const displaced = context.current;
      const baseQueue = displaced ? [displaced, ...context.queue] : context.queue;
      return {
        current: params.incoming,
        queue: processQueue(baseQueue),
      };
    }),

    /**
     * Добавляет входящее уведомление в очередь без вытеснения текущего отображения.
     */
    enqueue: assign(({ context }, params: { incoming: Notification }) => ({
      queue: processQueue([...context.queue, params.incoming]),
    })),

    /**
     * Очищает слот отображения после завершения shrinking.
     */
    clearCurrent: assign(() => ({ current: null })),

    /**
     * Обновляет текущий слот на месте для идемпотентных уведомлений той же категории.
     * НЕ сбрасывает таймер показа — только изменяет видимое содержимое.
     */
    updateCurrentInPlace: assign(
      ({ context }, params: { incoming: Notification }) => ({
        current: params.incoming,
      })
    ),
    startDisplayTimer: ({ context, self }) => {
      const duration = displayDurationMs(context.queue);
      console.log(`[Timer] Starting display timer for ${duration}ms`);

      setTimeout(() => {
        self.send({ type: 'TIMER_DONE' });
      }, duration);
    },
  },

  guards: {
    hasQueuedItems: ({ context }) => context.queue.length > 0,
    queueIsEmpty: ({ context }) => context.queue.length === 0,

    incomingPreemptsDisplay: (
      { context },
      params: { incoming: Notification }
    ) => shouldPreempt(params.incoming, context.current),

    incomingIsIdempotentUpdate: (
      { context },
      params: { incoming: Notification }
    ) =>
      !!context.current &&
      context.current.category === params.incoming.category &&
      params.incoming.priority === context.current.priority,

    incomingReversesShrink: (_, params: { incoming: Notification }) =>
      shouldReverseImmediately(params.incoming),
  },
}).createMachine({
  id: 'notifications',
  initial: 'idle',

  context: {
    current: null,
    queue: [],
    origin: 'small',
  },

  // ── Глобальный обработчик NOTIFY ───────────────────────────────────────────
  // Обрабатывается внутри каждого состояния для точного контроля — XState v5 рекомендует
  // локальные для состояния обработчики событий вместо корневых переходов "always" для
  // условной логики, которая отличается в зависимости от состояния.

  states: {
    // ── ПРОСТОЙ РЕЖИМ ───────────────────────────────────────────────────────
    idle: {
      on: {
        NOTIFY: {
          target: 'expanding',
          actions: [
            'captureOrigin',
            assign(({ event }) => ({
              current: { ...event.payload, createdAt: Date.now() },
              queue: [],
              origin: (event as any).origin || 'small',
            })),
            // Источник передаётся из компонента через метаданные события или стор.
            // По умолчанию используется 'small'; компонент Navbar задаёт его перед отправкой.
          ],
        },
      },
    },

    // ── РАСШИРЕНИЕ ───────────────────────────────────────────────────────────
    // Стеклянный остров растёт. Мы принимаем новые события, но не прерываем
    // геометрическую анимацию — меняться может только содержимое.
    expanding: {
      on: {
        ANIMATION_END: { 
            target: 'visible', 
            actions: [() => console.log('[ANIMATION_END] received in expanding')] 
        },

        NOTIFY: [
          // Вытеснение: содержимое меняется немедленно, анимация продолжается.
          {
            guard: {
              type: 'incomingPreemptsDisplay',
              params: ({ event }) => ({
                incoming: { ...event.payload, createdAt: Date.now() },
              }),
            },
            actions: {
              type: 'preemptCurrent',
              params: ({ event }) => ({
                incoming: { ...event.payload, createdAt: Date.now() },
              }),
            },
          },
          // Иначе помещаем в очередь.
          {
            actions: {
              type: 'enqueue',
              params: ({ event }) => ({
                incoming: { ...event.payload, createdAt: Date.now() },
              }),
            },
          },
        ],

        DISMISS: { target: 'shrinking' },
      },
    },

    // ── ОТОБРАЖЕНИЕ ─────────────────────────────────────────────────────────
    // Уведомление находится на экране. Выходом управляет таймер.
    visible: {
        entry: 'startDisplayTimer',

        on: {
            TIMER_DONE: [
              { guard: 'hasQueuedItems', target: 'changing' },
              { target: 'shrinking' }
            ],

            NOTIFY: [
              // Идемпотентное обновление на месте (та же категория, тот же приоритет).
              {
                guard: {
                  type: 'incomingIsIdempotentUpdate',
                  params: ({ event }) => ({
                    incoming: { ...event.payload, createdAt: Date.now() },
                  }),
                },
                actions: {
                  type: 'updateCurrentInPlace',
                  params: ({ event }) => ({
                    incoming: { ...event.payload, createdAt: Date.now() },
                  }),
                },
                // Остаёмся в visible — таймер НЕ сбрасывается (это намеренно: идемпотентные
                // обновления не требуют сброса бюджета внимания пользователя).
              },

              // Вытеснение: переходим в changing с новым содержимым.
              {
                guard: {
                  type: 'incomingPreemptsDisplay',
                  params: ({ event }) => ({
                    incoming: { ...event.payload, createdAt: Date.now() },
                  }),
                },
                target: 'changing',
                actions: {
                  type: 'preemptCurrent',
                  params: ({ event }) => ({
                    incoming: { ...event.payload, createdAt: Date.now() },
                  }),
                },
              },
              
              // Низкий приоритет — молча ставим в очередь.
              {
                actions: {
                  type: 'enqueue',
                  params: ({ event }) => ({
                    incoming: { ...event.payload, createdAt: Date.now() },
                  }),
                },
              },
            ],

            DISMISS: { target: 'shrinking' },
        },
    },

    // ── СМЕНА СОДЕРЖИМОГО ────────────────────────────────────────────────────
    // Вязкая замена содержимого. Геометрия острова остаётся раскрытой.
    // Содержимое анимируется наружу → новое содержимое анимируется внутрь → обратно в visible.
    changing: {
      entry: 'dequeueNext',

      // Сразу возвращаемся в visible после завершения entry-экшенов.
      // Анимация замены содержимого запускается Framer Motion в ответ на
      // изменение контекста `current` — а не длительностью состояния машины.
      always: { target: 'visible' },

      on: {
        NOTIFY: {
          actions: {
            type: 'enqueue',
            params: ({ event }) => ({
              incoming: { ...event.payload, createdAt: Date.now() },
            }),
          },
        },
      },
    },

    // ── СЖАТИЕ ───────────────────────────────────────────────────────────────
    // Остров схлопывается. Поведение при NOTIFY зависит от приоритета (Правило 1+Б).
    shrinking: {
      on: {
        ANIMATION_END: {
          target: 'idle',
          actions: 'clearCurrent',
        },

        NOTIFY: [
          // Путь А — высокий приоритет: немедленно разворачиваемся обратно в expanding.
          {
            guard: {
              type: 'incomingReversesShrink',
              params: ({ event }) => ({
                incoming: { ...event.payload, createdAt: Date.now() },
              }),
            },
            target: 'expanding',
            actions: assign(({ event }) => ({
              current: { ...event.payload, createdAt: Date.now() },
              queue: [],
            })),
          },

          // Путь Б — низкий приоритет: даём завершить схлопывание, затем раскрываемся снова.
          // Кладём в очередь; переход idle→expanding подхватывает это.
          {
            actions: {
              type: 'enqueue',
              params: ({ event }) => ({
                incoming: { ...event.payload, createdAt: Date.now() },
              }),
            },
          },
        ],
      },

      // После схлопывания, если Путь Б оставил элементы в очереди, раскрываемся снова.
      exit: assign(({ context }) => {
        if (context.queue.length > 0) {
          const [next, ...rest] = context.queue;
          return { current: next, queue: processQueue(rest) };
        }
        return {};
      }),
    },
  },

  // ── Реестр задержек ────────────────────────────────────────────────────────
  delays: {
    DISPLAY_TIMER: ({ context }: { context: NotificationContext }) => 
        displayDurationMs(context.queue),
  },
});

// ─── Интеграция с React ───────────────────────────────────────────────────────

import { useActorRef, useSelector } from '@xstate/react';
import { createContext, useContext, useRef } from 'react';
import type { ActorRefFrom } from 'xstate';

type NotificationActorRef = ActorRefFrom<typeof notificationMachine>;

const NotificationMachineContext = createContext<NotificationActorRef | null>(
  null
);

export { NotificationMachineContext };

/**
 * Хуки-селекторы — компоненты подписываются только на нужный им фрагмент,
 * предотвращая лишние повторные рендеры.
 */
export function useNotificationState() {
  const actor = useContext(NotificationMachineContext);
  if (!actor) throw new Error('NotificationMachineContext not found');
  return useSelector(actor, (s) => s.value);
}

export function useNotificationCurrent() {
  const actor = useContext(NotificationMachineContext);
  if (!actor) throw new Error('NotificationMachineContext not found');
  return useSelector(actor, (s) => s.context.current);
}

export function useNotificationOrigin() {
  const actor = useContext(NotificationMachineContext);
  if (!actor) throw new Error('NotificationMachineContext not found');
  return useSelector(actor, (s) => s.context.origin);
}

export function useNotificationActor() {
  const actor = useContext(NotificationMachineContext);
  if (!actor) throw new Error('NotificationMachineContext not found');
  return actor;
}