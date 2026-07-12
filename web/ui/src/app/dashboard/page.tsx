/**
 * @file page.tsx — Dashboard
 * @description Главная страница управления пространством.
 *
 * Этот файл намеренно минимален: только JSX-разметка и анимационные константы.
 * Вся бизнес-логика вынесена в useDashboard(),
 * все UI-блоки — в компоненты в папке /components/dashboard/.
 *
 * Структура компонентов:
 *  DashboardPage
 *  ├── ConfirmModal   (модалка подтверждения, портал поверх всего)
 *  ├── CreateDrawer   (drawer создания пользователя)
 *  ├── StatCard ×4    (метрики в шапке)
 *  ├── UserRow ×N     (список пользователей с фильтром/поиском)
 *  └── SecurityLog    (журнал событий)
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Activity, Wifi, Lock,
  RotateCcw, Plus, X,
  TrendingUp, TrendingDown, Zap,
} from 'lucide-react';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import {
  StatCard,
  UserRow,
  ConfirmModal,
  CreateDrawer,
  SecurityLog,
} from '@/components/dashboard';
import { useDashboard } from '@/components/dashboard/hooks/use-dashboard';
import { fmt } from '@/components/dashboard/utils';

// ─── Анимационные варианты ─────────────────────────────────────────────────────
// Специфичны для этой страницы — не выносим в глобальные константы

const fadeUp = {
  initial:    { opacity: 0, y: 16 },
  animate:    { opacity: 1, y: 0  },
  exit:       { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    // Данные
    users, stats, history, loading,
    totalUplink, totalDownlink,
    // Derived
    online, frozen, filtered,
    // UI стейт
    filter,        setFilter,
    search,        setSearch,
    confirmAction, setConfirmAction,
    showCreate,    setShowCreate,
    // Экшены
    fetchAll,
    executeAction,
    hasError,
  } = useDashboard();

  return (
    <>
      {/* ── Порталы (модалки поверх всего) ── */}
      <AnimatePresence>
        {confirmAction && (
          <ConfirmModal
            action={confirmAction}
            onConfirm={() => executeAction(confirmAction)}
            onCancel={() => setConfirmAction(null)}
          />
        )}
        {showCreate && (
          <CreateDrawer
            onClose={() => setShowCreate(false)}
            onCreated={fetchAll}
          />
        )}
      </AnimatePresence>

      {/* ── Основной контент ── */}
      <div className="relative min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="relative z-10 max-w-7xl mx-auto space-y-6">

          {/* ── Заголовок страницы ── */}
          <motion.div className="flex items-end justify-between" {...fadeUp}>
            <div>
              <p className="text-[14px] tracking-[0.2em] text-white/40 mb-1">
                Node Management
              </p>
              <h1 className="font-jakarta font-black text-4xl tracking-[0.2rem] text-white">
                Space Control
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Индикатор live-обновления */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full"
                  animate={{ 
                    opacity: [1, 0.5, 1], 
                    backgroundColor: hasError ? '#ff3b5c' : '#34d399',
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[12px] uppercase tracking-[0.2em] text-white/65">
                  {hasError ? 'Error' : 'Live · 10s'}
                </span>
              </div>

              {/* Создать пользователя */}
              <motion.button
                onClick={() => setShowCreate(true)}
                disabled={hasError}
                whileHover={hasError ? {} : { scale: 1.02 }}
                whileTap={hasError ? {} : { scale: 0.98 }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl
                  font-jakarta font-black text-[10px] uppercase tracking-[0.2em]
                  text-black transition-all duration-300
                  ${hasError ? 'opacity-30 cursor-not-allowed select-none' : ''}`}
                style={{ background: 'var(--accent)' }}
              >
                <Plus size={12} />
                New Entity
              </motion.button>
            </div>
          </motion.div>

          {/* ── Системный баннер ошибки сервера ── */}
          <AnimatePresence>
            {hasError && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="relative rounded-xl border border-[#ff3b5c]/30 bg-black/60 backdrop-blur-md p-4 flex items-center gap-3">
                  {/* Красное неоновое свечение сзади баннера */}
                  <div className="absolute inset-0 rounded-xl bg-[#ff3b5c]/2 blur-md pointer-events-none" />
                  
                  <div className="w-2 h-2 rounded-full bg-[#ff3b5c] animate-pulse" />
                  <div className="flex-1">
                    <h3 className="font-geist-mono font-bold text-[11px] uppercase tracking-[0.15em] text-[#ff3b5c]">
                      Heimdallr Core Link Interrupted
                    </h3>
                    <p className="text-[10px] text-white/40 font-geist-mono mt-0.5">
                      Backend node unreachable (Status 500/401 or Connection Timeout). Interface entered Read-Only mode.
                    </p>
                  </div>
                  <span className="text-[9px] font-geist-mono uppercase tracking-widest text-white/20 bg-white/5 px-2 py-1 rounded border border-white/5">
                    RECONNECTING...
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Карточки метрик ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Online"
              value={String(online)}
              sub={`of ${users.length} entities`}
              icon={Wifi}
              accent="#00ff88"
              delay={0.05}
            />
            <StatCard
              label="Frozen"
              value={String(frozen)}
              sub="access suspended"
              icon={Lock}
              accent={frozen > 0 ? '#ff3b5c' : undefined}
              delay={0.1}
            />
            <StatCard
              label="Uplink"
              value={fmt(totalUplink)}
              sub="current session"
              icon={TrendingUp}
              accent="#38bdf8"
              delay={0.15}
            />
            <StatCard
              label="Downlink"
              value={fmt(totalDownlink)}
              sub="current session"
              icon={TrendingDown}
              accent="#a78bfa"
              delay={0.2}
            />
          </div>

          {/* ── Основная сетка: список пользователей + лог ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">

            {/* ── Панель пользователей ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-2xl overflow-hidden"
            >
              <GlassPane
                className="inset-0"
                style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' }}
              />
              <GlassPaneContent>

                {/* Шапка панели с поиском и фильтрами */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-white/40" />
                    <span className="font-jakarta font-bold text-[11px] uppercase tracking-[0.2em] text-white/70">
                      Entities
                    </span>
                    <span className="text-[9px] text-white/25 font-geist-mono">
                      ({filtered.length})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Поиск по email */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-32 bg-white/4 border border-white/8 rounded-lg
                          pl-3 pr-8 py-1.5 text-[11px] font-geist-mono text-white/70
                          placeholder:text-white/20 outline-none focus:border-white/20
                          transition-all duration-200"
                      />
                      {search && (
                        <button
                          onClick={() => setSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>

                    {/* Фильтры по статусу */}
                    <div className="flex gap-1">
                      {(['all', 'online', 'offline', 'blocked'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className="px-2.5 py-1 rounded-lg text-[8px] uppercase tracking-[0.12em]
                            font-bold transition-all duration-200"
                          style={{
                            background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color:      filter === f ? '#fff' : 'rgba(255,255,255,0.3)',
                            border:     filter === f ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                          }}
                        >
                          {/* 'blocked' в UI называется 'frozen' — терминология продукта */}
                          {f === 'blocked' ? 'frozen' : f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Список пользователей / skeleton / empty-state */}
                {loading ? (
                  // Skeleton во время загрузки
                  <div className="space-y-0 divide-y divide-white/4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="px-5 py-4">
                        <div
                          className="h-8 rounded-lg animate-pulse"
                          style={{
                            background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.04) 75%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.5s infinite',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  // Empty state
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Shield size={24} className="text-white/10" />
                    <p className="text-[10px] text-white/20 uppercase tracking-widest">
                      {search ? 'No matches' : 'No entities'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {filtered.map((u, i) => (
                      <UserRow
                        key={u.email}
                        user={u}
                        index={i}
                        onAction={(email, kind) => setConfirmAction({ email, kind })}
                      />
                    ))}
                  </div>
                )}
              </GlassPaneContent>
            </motion.div>

            {/* ── Журнал безопасности ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-2xl overflow-hidden"
            >
              <GlassPane
                className="inset-0"
                style={{ borderRadius: '20px', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)' }}
              />
              <GlassPaneContent className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <Zap size={12} className="text-white/40" />
                    <span className="font-jakarta font-bold text-[11px] uppercase tracking-[0.2em] text-white/70">
                      Security Log
                    </span>
                  </div>
                  <button
                    onClick={fetchAll}
                    className="w-6 h-6 flex items-center justify-center rounded-lg
                      text-white/25 hover:text-white/60 hover:bg-white/5
                      border border-white/8 transition-all"
                  >
                    <RotateCcw size={10} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <SecurityLog entries={history} />
                </div>
              </GlassPaneContent>
            </motion.div>

          </div>
        </div>
      </div>

      {/* Keyframe для shimmer-анимации skeleton */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}