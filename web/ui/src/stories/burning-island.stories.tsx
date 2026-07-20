/**
 * @file error-ignition.stories.tsx
 * @description Изолированная история для анимации «горящего острова» при ошибках.
 *
 * Сфокусирована только на error-кейсах — 401, 500, auth_error, session_expired.
 * Остальные типы уведомлений здесь намеренно отсутствуют.
 *
 * Пути тестирования:
 *   Default          — чистый старт, кнопки для ручного триггера
 *   AutoFire401      — 401 сразу при монтировании, отсчёт виден без клика
 *   AutoFire500      — критический 500, persistent, не уходит сам
 *   Sequence         — очередь: 401 → 500 → session (проверяет смену свечения)
 */

import type { Meta, StoryObj } from '@storybook/react';
import { NotificationProvider } from '@/components/layout/notification-provider';
import Navbar from '@/components/layout/navbar';
import { useNotify, NotificationPresets, type NotifyInput } from '@/hooks/use-notify';
import { useEffect, useRef } from 'react';

// ─── Пресеты специфичные для ошибок ──────────────────────────────────────────

/** Набор боевых ошибок, которые нужно тестировать визуально */
const ERROR_CASES = {
  auth401: (): NotifyInput => ({
    message: 'Unauthorized · 401',
    category: 'auth_error',
    priority: 8,
    type: 'ephemeral',
    ttl: 10_000,
    icon: 'error',
  }),

  server500: (): NotifyInput => ({
    message: 'Internal Server Error · 500',
    category: 'server_error',
    priority: 10,
    type: 'persistent',
    ttl: 30_000,
    icon: 'error',
  }),

  sessionExpired: (): NotifyInput => ({
    message: 'Session expired · re-auth required',
    category: 'session_expired',
    priority: 9,
    type: 'persistent',
    ttl: 30_000,
    icon: 'error',
  }),

  rateLimitHit: (): NotifyInput => ({
    message: 'Rate limit exceeded · 429',
    category: 'rate_limit',
    priority: 7,
    type: 'ephemeral',
    ttl: 12_000,
    icon: 'error',
  }),

  nodeUnavailable: (): NotifyInput => ({
    message: 'Node unreachable · connection lost',
    category: 'node_down',
    priority: 9,
    type: 'persistent',
    ttl: 30_000,
    icon: 'error',
  }),
} as const;

// ─── Кнопки управления ────────────────────────────────────────────────────────

function ErrorControls({ autoFire }: { autoFire?: keyof typeof ERROR_CASES }) {
  const { notify, dismiss } = useNotify();
  const fired = useRef(false);

  useEffect(() => {
    if (autoFire && !fired.current) {
      fired.current = true;
      // Небольшая задержка, чтобы Navbar успел смонтироваться
      const t = setTimeout(() => notify(ERROR_CASES[autoFire]()), 400);
      return () => clearTimeout(t);
    }
  }, [autoFire, notify]);

  return (
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      style={{ zIndex: 100 }}
    >
      {/* Заголовок */}
      <span
        className="text-[9px] tracking-[0.2em] uppercase text-white/30 font-mono"
      >
        Error ignition test
      </span>

      {/* Ряд кнопок ошибок */}
      <div className="flex gap-2">
        {(Object.keys(ERROR_CASES) as (keyof typeof ERROR_CASES)[]).map((key) => (
          <button
            key={key}
            onClick={() => notify(ERROR_CASES[key]())}
            className="
              px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em]
              font-mono font-medium
              bg-red-950/60 text-red-400 border border-red-800/40
              hover:bg-red-900/60 hover:border-red-600/50 hover:text-red-300
              transition-all duration-200
              backdrop-blur-sm
            "
          >
            {key}
          </button>
        ))}
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        className="
          px-4 py-1 rounded-full text-[9px] uppercase tracking-[0.2em]
          font-mono text-white/30 border border-white/10
          hover:text-white/50 hover:border-white/20
          transition-all duration-200
        "
      >
        dismiss
      </button>
    </div>
  );
}

// ─── Сцена ────────────────────────────────────────────────────────────────────

interface SceneProps {
  /** Ключ из ERROR_CASES для автозапуска, или undefined для ручного режима */
  autoFire?: keyof typeof ERROR_CASES;
  /** Имитировать скролл (small-режим навбара) */
  isScrolled?: boolean;
}

function Scene({ autoFire, isScrolled = false }: SceneProps) {
  useEffect(() => {
    if (isScrolled) {
      window.scrollTo(0, 100);
      window.dispatchEvent(new Event('scroll'));
    } else {
      window.scrollTo(0, 0);
      window.dispatchEvent(new Event('scroll'));
    }
  }, [isScrolled]);

  return (
    <NotificationProvider>
      <div className="bg-zinc-950 min-h-[200vh] relative">
        {/* Фоновая сетка — чтобы свечение было заметно на тёмном фоне */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <Navbar />
        <ErrorControls autoFire={autoFire} />

        {/* Лейбл режима */}
        <div className="fixed bottom-2 right-4 text-[9px] text-white/15 font-mono uppercase tracking-widest">
          {isScrolled ? 'navbar: small' : 'navbar: large'}
          {autoFire ? ` · auto: ${autoFire}` : ' · manual'}
        </div>
      </div>
    </NotificationProvider>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof Scene> = {
  title: 'Layout/ErrorIgnition',
  component: Scene,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#09090b' }],
    },
    docs: {
      description: {
        component:
          'Изолированный тест анимации «горящего острова». Только error-кейсы. ' +
          'Свечение намеренно проходит ЧЕРЕЗ матовое стекло навбара (z:-1 + backdrop-filter диффузия).',
      },
    },
  },
  argTypes: {
    autoFire: {
      control: 'select',
      options: [undefined, ...Object.keys(ERROR_CASES)],
      description: 'Автоматически показать ошибку при монтировании',
    },
    isScrolled: {
      control: 'boolean',
      description: 'Навбар в small-режиме (имитация скролла)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Scene>;

// ─── Stories ─────────────────────────────────────────────────────────────────

/**
 * Ручной режим — все кнопки активны, autoFire отсутствует.
 * Используйте для первичного визуального ревью анимации.
 */
export const Default: Story = {
  name: 'Manual trigger',
  args: {
    autoFire: undefined,
    isScrolled: false,
  },
};

/**
 * 401 Unauthorized — самый частый error-кейс.
 * Тип ephemeral, уходит через 10s сам.
 * Хорошо виден переход sweep → pulse → dismiss.
 */
export const Auto401: Story = {
  name: 'Auto · 401 Unauthorized',
  args: {
    autoFire: 'auth401',
    isScrolled: false,
  },
};

/**
 * 500 Server Error — критический, persistent.
 * Уведомление НЕ уходит само — требует dismiss.
 * Проверяет поведение pulse-фазы на длительном показе.
 */
export const Auto500: Story = {
  name: 'Auto · 500 Server Error (persistent)',
  args: {
    autoFire: 'server500',
    isScrolled: false,
  },
};

/**
 * Session Expired — persistent, high priority (9).
 * Проверяет вытеснение если уже есть другое уведомление.
 */
export const AutoSession: Story = {
  name: 'Auto · Session Expired (persistent)',
  args: {
    autoFire: 'sessionExpired',
    isScrolled: false,
  },
};

/**
 * Small-режим навбара — остров в виде таблетки 410×48px.
 * Проверяет что гlow корректно адаптируется к меньшей геометрии.
 * 
 * Примечание: эффект ignition активируется только в состоянии 'visible'
 * (после полного раскрытия острова), поэтому в small-режиме
 * геометрия острова — 410×128px (notif-shape), а не 410×48px.
 */
export const SmallNavbar: Story = {
  name: 'Small navbar · 401',
  args: {
    autoFire: 'auth401',
    isScrolled: true,
  },
};

/**
 * Очередь ошибок — быстрый тест смены уведомлений.
 * 
 * Использует Scene + autoFire: auth401.
 * Дополнительные кнопки позволяют докинуть 500 и session поверх.
 * Проверяет: правильно ли сбрасывается sweep-анимация при смене уведомления.
 *
 * Ожидаемое поведение: при смене error→error sweep должен перезапуститься
 * (AnimatePresence key меняется по notification.id → remount компонента).
 */
export const ErrorQueue: Story = {
  name: 'Queue · 401 → 500 → session',
  args: {
    autoFire: 'auth401',
    isScrolled: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Запускает 401, затем используйте кнопки server500 и sessionExpired ' +
          'для проверки вытеснения и перезапуска sweep-анимации.',
      },
    },
  },
};