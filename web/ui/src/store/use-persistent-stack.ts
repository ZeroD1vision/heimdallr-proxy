/**
 * @file use-persistent-stack.ts
 * @description Хранилище Zustand для постоянного стека иконок уведомлений,
 * отображаемого слева от острова навбара.
 *
 * В это хранилище записывает компонент навбара, когда машина
 * выходит из `shrinking` с уведомлением типа `persistent`.
 * Оно намеренно отделено от XState — у стека нет сложных
 * переходов состояний, только простые CRUD-операции над упорядоченным списком.
 *
 * Визуальный контракт:
 *   - До MAX_VISIBLE иконок рендерятся в слоистом стеке (у каждой свой z-offset).
 *   - Когда count > MAX_VISIBLE, стек фиксируется на MAX_VISIBLE иконках,
 *     а бейдж показывает общее число элементов переполнения.
 *   - Клик по любой иконке открывает плоскую панель со списком всех постоянных элементов.
 *   - Элементы можно по одному удалять из панели.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { NotificationIcon } from './use-notification-machine';

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface PersistentItem {
  id: string;
  message: string;
  icon: NotificationIcon;
  category: string;
  receivedAt: number;
}

interface PersistentStackState {
  /** Полный упорядоченный список, сначала самые новые. */
  items: PersistentItem[];
  /** Открыта ли панель с деталями. */
  isPanelOpen: boolean;

  // Производные значения (вычисляются inline — избегаем накладных расходов селектора для простых значений)

  /** Добавляет новый элемент. Заменяет существующий элемент с той же категорией (схлопывание). */
  push: (item: Omit<PersistentItem, 'receivedAt'>) => void;
  /** Удаляет один элемент по id. */
  dismiss: (id: string) => void;
  /** Очищает все элементы. */
  clearAll: () => void;
  togglePanel: () => void;
  closePanel: () => void;
}

// ─── Константы ────────────────────────────────────────────────────────────────

export const MAX_VISIBLE_STACK = 3;

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePersistentStack = create<PersistentStackState>()(
  subscribeWithSelector((set) => ({
    items: [],
    isPanelOpen: false,

    push: (incoming) =>
      set((state) => {
        // Схлопывание: заменяем существующую запись с той же категорией.
        const filtered = state.items.filter(
          (item) => item.category !== incoming.category
        );
        const newItem: PersistentItem = {
          ...incoming,
          receivedAt: Date.now(),
        };
        // Сначала самые новые.
        return { items: [newItem, ...filtered] };
      }),

    dismiss: (id) =>
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      })),

    clearAll: () => set({ items: [] }),

    togglePanel: () =>
      set((state) => ({ isPanelOpen: !state.isPanelOpen })),

    closePanel: () => set({ isPanelOpen: false }),
  }))
);

// ─── Производные селекторы ───────────────────────────────────────────────────

/** Иконки, которые реально рендерятся в стеке (ограничены MAX_VISIBLE_STACK). */
export const selectVisibleItems = (state: PersistentStackState) =>
  state.items.slice(0, MAX_VISIBLE_STACK);

/** Количество переполнения, показываемое в бейдже. 0 означает отсутствие бейджа. */
export const selectOverflowCount = (state: PersistentStackState) =>
  Math.max(0, state.items.length - MAX_VISIBLE_STACK);

/** Общее количество элементов для aria-label. */
export const selectTotalCount = (state: PersistentStackState) =>
  state.items.length;