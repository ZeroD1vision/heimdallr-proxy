'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useAnimate, stagger } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Shield, Users, Activity, Wifi, WifiOff, Lock,
  Unlock, RotateCcw, Trash2, Plus, ChevronRight,
  AlertTriangle, CheckCircle2, Clock, X, QrCode,
  TrendingUp, TrendingDown, Zap,
} from 'lucide-react';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import { useNotify, NotificationPresets } from '@/hooks/use-notify';
import { tokenStorage } from '@/lib/api';
import { useVisualStore } from '@/store/use-visual-store';
import { useSocket } from '@/hooks/use-socket';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpaceUser {
  id: number;
  email: string;
  telegram_id: number;
  inbound_tag: string;
  vless_flow: string;
  traffic_limit: number;
  expires_at: string | null;
  is_blocked: boolean;
  created_at: string;
  status: 'online' | 'offline' | 'blocked';
}

interface ServerStats {
  email: string;
  uplink_bytes: number;
  downlink_bytes: number;
}

interface HistoryEntry {
  id: number;
  email: string;
  uplink_bytes: number;
  downlink_bytes: number;
  recorded_at: string;
}

type ConfirmAction = {
  email: string;
  kind: 'block' | 'unblock' | 'reset' | 'delete';
} | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes: number): string {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${u[i]}`;
}

function fmtExpiry(iso: string | null): string {
  if (!iso) return '∞';
  const d = new Date(iso);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return 'expired';
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const jwt = tokenStorage.getToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

const fadeScale = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.2, ease: 'easeOut' as const },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusOrb({ status }: { status: SpaceUser['status'] }) {
  const colors = {
    online: '#00ff88',
    offline: 'rgba(255,255,255,0.2)',
    blocked: '#ff3b5c',
  };
  return (
    <span className="relative flex-shrink-0 w-2 h-2">
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: colors[status] }}
      />
      {status === 'online' && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: colors.online }}
          animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      <GlassPane 
        className="inset-0" 
        style={{ 
          borderRadius: '20px',
          overflow: 'hidden',
          backgroundColor: 'rgba(0, 0, 0, 0.2)'
        }} 
      />
      <GlassPaneContent className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span
            className="text-[9px] uppercase tracking-[0.2em] text-white/35"
          >
            {label}
          </span>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: accent ? `${accent}15` : 'rgba(255,255,255,0.04)' }}
          >
            <Icon size={13} style={{ color: accent ?? 'rgba(255,255,255,0.4)' }} />
          </div>
        </div>
        <div>
          <p
            className="font-jakarta font-black text-2xl"
            style={{ color: accent ?? '#fff' }}
          >
            {value}
          </p>
          {sub && (
            <p className="text-[10px] text-white/25 mt-0.5 tracking-wide">
              {sub}
            </p>
          )}
        </div>
      </GlassPaneContent>
    </motion.div>
  );
}

function TrafficBar({ used, limit }: { used: number; limit: number }) {
  if (!limit) {
    return (
      <span className="text-[10px] text-white/25 tracking-widest">∞</span>
    );
  }
  const pct = Math.min((used / limit) * 100, 100);
  const danger = pct > 85;
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="h-[2px] rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: danger
              ? 'linear-gradient(90deg,#ff3b5c,#ff6b35)'
              : 'linear-gradient(90deg,#00ff88,#38bdf8)',
          }}
        />
      </div>
      <span className="text-[9px] text-white/25">
        {fmt(used)} / {fmt(limit)}
      </span>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  action,
  onConfirm,
  onCancel,
}: {
  action: NonNullable<ConfirmAction>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = {
    block:   { title: 'Freeze Access',    desc: `${action.email} will be immediately disconnected.`,          btn: 'Freeze',   color: '#ff3b5c' },
    unblock: { title: 'Restore Access',   desc: `${action.email} will regain network access.`,                btn: 'Restore',  color: '#00ff88' },
    reset:   { title: 'Reset Traffic',    desc: `Traffic counter for ${action.email} will be zeroed.`,        btn: 'Reset',    color: '#f0b429' },
    delete:  { title: 'Remove Entity',    desc: `${action.email} will be purged from DB and Xray. Permanent.`, btn: 'Purge',   color: '#ff3b5c' },
  }[action.kind];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        className="relative w-full max-w-sm mx-4"
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <GlassPane className="inset-0 rounded-2xl" style={{ borderRadius: '16px' }} />
        <GlassPaneContent className="p-7 space-y-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}
          >
            <AlertTriangle size={16} style={{ color: meta.color }} />
          </div>
          <div>
            <h3 className="font-jakarta font-black text-base uppercase tracking-widest text-white mb-1.5">
              {meta.title}
            </h3>
            <p className="text-[11px] text-white/40 leading-relaxed tracking-wide">
              {meta.desc}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-jakarta font-bold uppercase tracking-widest
                text-white/40 border border-white/8 hover:border-white/20 hover:text-white/60
                transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-jakarta font-bold uppercase tracking-widest
                text-black transition-all duration-200 hover:brightness-110"
              style={{ background: meta.color }}
            >
              {meta.btn}
            </button>
          </div>
        </GlassPaneContent>
      </motion.div>
    </motion.div>
  );
}

// ─── Create User Drawer ───────────────────────────────────────────────────────

interface CreateForm {
  email: string;
  telegram_id: string;
  inbound_tag: string;
  traffic_gb: string;
  expires_at: string;
}

function CreateDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateForm>({
    email: '',
    telegram_id: '',
    inbound_tag: 'vless-reality',
    traffic_gb: '',
    expires_at: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { notify } = useNotify();

  const set = (k: keyof CreateForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        email: form.email,
        inbound_tag: form.inbound_tag,
        vless_flow: 'xtls-rprx-vision',
      };
      if (form.telegram_id) payload.telegram_id = Number(form.telegram_id);
      if (form.traffic_gb)
        payload.traffic_limit = Math.round(Number(form.traffic_gb) * 1024 ** 3);
      if (form.expires_at)
        payload.expires_at = new Date(form.expires_at).toISOString();

      await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) });
      notify(NotificationPresets.success(`${form.email} added to Space`, 'user_create'));
      onCreated();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
      setErr(msg);
      notify(NotificationPresets.error(msg, 'user_create_err'));
    } finally {
      setLoading(false);
    }
  }

  const fields: { label: string; key: keyof CreateForm; type: string; placeholder: string }[] = [
    { label: 'Entity ID', key: 'email', type: 'text', placeholder: 'ivan_work' },
    { label: 'Telegram ID', key: 'telegram_id', type: 'number', placeholder: '123456789' },
    { label: 'Inbound Tag', key: 'inbound_tag', type: 'text', placeholder: 'vless-reality' },
    { label: 'Traffic Limit (GB)', key: 'traffic_gb', type: 'number', placeholder: '50' },
    { label: 'Valid Until', key: 'expires_at', type: 'date', placeholder: '' },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      <motion.div
        className="relative w-full max-w-md mx-0 sm:mx-4"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <GlassPane
          className="inset-0"
          style={{ borderRadius: '20px 20px 0 0' }}
        />
        <GlassPaneContent
          className="p-6 pb-8 space-y-5"
          style={{ borderRadius: '20px 20px 0 0' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-jakarta font-black text-sm uppercase tracking-[0.25em]">
              New Entity
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center
                bg-white/5 hover:bg-white/10 border border-white/8
                text-white/40 hover:text-white/70 transition-all"
            >
              <X size={13} />
            </button>
          </div>

          {/* Fields */}
          <div className="space-y-3">
            {fields.map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  {label}
                </label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                  className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-2.5
                    text-white text-xs font-geist-mono tracking-wide outline-none
                    placeholder:text-white/20 focus:border-white/20 focus:bg-white/6
                    transition-all duration-200"
                />
              </div>
            ))}
          </div>

          {err && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[11px] text-red-400/80 tracking-wide"
            >
              {err}
            </motion.p>
          )}

          <button
            onClick={submit}
            disabled={loading || !form.email}
            className="w-full py-3 rounded-xl font-jakarta font-black text-[11px] uppercase
              tracking-[0.25em] text-black transition-all duration-200
              hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#00ff88' }}
          >
            {loading ? 'Initializing…' : 'Add to Space'}
          </button>
        </GlassPaneContent>
      </motion.div>
    </motion.div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  index,
  onAction,
}: {
  user: SpaceUser;
  index: number;
  onAction: (email: string, kind: NonNullable<ConfirmAction>['kind']) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = (user as SpaceUser & { uplink?: number; downlink?: number }).uplink ?? 0
    + ((user as SpaceUser & { uplink?: number; downlink?: number }).downlink ?? 0);

  const statusLabel = {
    online: 'Online',
    offline: 'Offline',
    blocked: 'Frozen',
  }[user.status];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`border-b border-white/4 transition-colors duration-200
        ${user.is_blocked ? 'opacity-45' : 'hover:bg-white/[0.02]'}`}
    >
      {/* Main row */}
      <div
        className="grid items-center gap-3 px-5 py-3.5 cursor-pointer"
        style={{ gridTemplateColumns: '1fr auto auto auto' }}
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <StatusOrb status={user.status} />
          <div className="min-w-0">
            <p className="text-[12px] text-white/90 font-geist-mono truncate">
              {user.email}
            </p>
            <p className="text-[9px] text-white/25 truncate tracking-wide mt-0.5">
              {user.inbound_tag}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <span
          className="text-[8px] uppercase tracking-[0.15em] px-2 py-1 rounded-md font-bold"
          style={{
            background: user.status === 'online'
              ? 'rgba(0,255,136,0.1)'
              : user.status === 'blocked'
              ? 'rgba(255,59,92,0.1)'
              : 'rgba(255,255,255,0.04)',
            color: user.status === 'online'
              ? '#00ff88'
              : user.status === 'blocked'
              ? '#ff3b5c'
              : 'rgba(255,255,255,0.25)',
          }}
        >
          {statusLabel}
        </span>

        {/* Expiry */}
        <span className="text-[10px] text-white/25 font-geist-mono hidden sm:block">
          {fmtExpiry(user.expires_at)}
        </span>

        {/* Chevron */}
        <motion.span
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight size={13} className="text-white/20" />
        </motion.span>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 space-y-3">
              {/* Traffic bar */}
              <div className="flex items-center gap-4">
                <span className="text-[9px] text-white/25 uppercase tracking-widest w-16">
                  Traffic
                </span>
                <TrafficBar used={total} limit={user.traffic_limit} />
              </div>

              {/* Telegram ID */}
              {user.telegram_id > 0 && (
                <div className="flex items-center gap-4">
                  <span className="text-[9px] text-white/25 uppercase tracking-widest w-16">
                    Telegram
                  </span>
                  <span className="text-[10px] text-white/40 font-geist-mono">
                    {user.telegram_id}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {user.is_blocked ? (
                  <ActionBtn
                    icon={<Unlock size={11} />}
                    label="Restore"
                    color="#00ff88"
                    onClick={() => onAction(user.email, 'unblock')}
                  />
                ) : (
                  <ActionBtn
                    icon={<Lock size={11} />}
                    label="Freeze"
                    color="#ff3b5c"
                    onClick={() => onAction(user.email, 'block')}
                  />
                )}
                <ActionBtn
                  icon={<RotateCcw size={11} />}
                  label="Reset traffic"
                  onClick={() => onAction(user.email, 'reset')}
                />
                <ActionBtn
                  icon={<Trash2 size={11} />}
                  label="Remove"
                  color="#ff3b5c"
                  danger
                  onClick={() => onAction(user.email, 'delete')}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        text-[9px] uppercase tracking-[0.15em] font-bold
        border transition-all duration-200"
      style={{
        color: color ?? 'rgba(255,255,255,0.4)',
        borderColor: danger ? `${color}25` : 'rgba(255,255,255,0.07)',
        background: danger ? `${color}08` : 'rgba(255,255,255,0.03)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = color ? `${color}15` : 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor = color ? `${color}40` : 'rgba(255,255,255,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = danger ? `${color}08` : 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = danger ? `${color}25` : 'rgba(255,255,255,0.07)';
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Security Log ─────────────────────────────────────────────────────────────

function SecurityLog({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Clock size={20} className="text-white/10" />
        <p className="text-[10px] text-white/20 uppercase tracking-widest">
          No events
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-white/4">
      {entries.slice(0, 15).map((h, i) => (
        <motion.div
          key={h.id ?? i}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03, duration: 0.3 }}
          className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
        >
          <div
            className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.12)' }}
          >
            <Activity size={10} className="text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/70 font-geist-mono truncate">
              {h.email}
            </p>
            <p className="text-[9px] text-white/25 mt-0.5">
              <span className="text-emerald-400/60">↑{fmt(h.uplink_bytes)}</span>
              {' · '}
              <span className="text-sky-400/60">↓{fmt(h.downlink_bytes)}</span>
            </p>
          </div>
          <span className="text-[9px] text-white/20 font-geist-mono flex-shrink-0">
            {new Date(h.recorded_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { notify } = useNotify();

  const [users, setUsers] = useState<SpaceUser[]>([]);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'blocked'>('all');
  const [search, setSearch] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAnnouncedSyncRef = useRef(false);
  const hasAnnouncedSyncErrorRef = useRef(false);

  // Scene — dashboard uses landing background (not auth video)
  useEffect(() => {
    const token = tokenStorage.getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    const store = useVisualStore.getState();
    store.setScene('auth');
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [usersRes, statsRes, histRes] = await Promise.allSettled([
      apiFetch<SpaceUser[]>('/api/admin/users'),
      apiFetch<ServerStats>('/api/stats'),
      apiFetch<HistoryEntry[]>('/api/history?limit=20'),
    ]);
    
    // Set state for fulfilled responses
    if (usersRes.status === 'fulfilled') setUsers(usersRes.value ?? []);
    if (statsRes.status === 'fulfilled') setStats(statsRes.value);
    if (histRes.status === 'fulfilled') setHistory(histRes.value ?? []);
    
    // Check if ALL requests succeeded
    const allSuccess = usersRes.status === 'fulfilled' && 
                       statsRes.status === 'fulfilled' && 
                       histRes.status === 'fulfilled';
    
    if (allSuccess) {
      if (!hasAnnouncedSyncRef.current) {
        notify(NotificationPresets.success('Dashboard synced', 'dashboard_sync'));
        hasAnnouncedSyncRef.current = true;
      }
      hasAnnouncedSyncErrorRef.current = false;
    } else {
      if (!hasAnnouncedSyncErrorRef.current) {
        notify(NotificationPresets.error('Sync failed', 'dashboard_fetch'));
        hasAnnouncedSyncErrorRef.current = true;
      }
    }
    
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    fetchAll();
    pollRef.current = setInterval(fetchAll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchAll]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function executeAction(a: NonNullable<ConfirmAction>) {
    const enc = encodeURIComponent(a.email);
    try {
      if (a.kind === 'block') {
        await apiFetch(`/api/admin/users/${enc}/block`, { method: 'PATCH' });
        notify(NotificationPresets.success(`${a.email} frozen`, 'user_block'));
      } else if (a.kind === 'unblock') {
        await apiFetch(`/api/admin/users/${enc}/unblock`, { method: 'PATCH' });
        notify(NotificationPresets.success(`${a.email} restored`, 'user_unblock'));
      } else if (a.kind === 'reset') {
        await apiFetch(`/api/admin/users/${enc}/reset-traffic`, { method: 'POST' });
        notify(NotificationPresets.success(`Traffic reset for ${a.email}`, 'user_reset'));
      } else if (a.kind === 'delete') {
        await apiFetch(`/api/admin/users/${enc}`, { method: 'DELETE' });
        notify(NotificationPresets.success(`${a.email} removed`, 'user_delete'));
      }
      fetchAll();
    } catch (e: unknown) {
      notify(NotificationPresets.error(
        e instanceof Error ? e.message : 'Operation failed',
        'user_action_err'
      ));
    }
    setConfirmAction(null);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const online = users.filter((u) => u.status === 'online').length;
  const frozen = users.filter((u) => u.status === 'blocked').length;

  const filtered = users.filter((u) => {
    const matchQ = !search || u.email.toLowerCase().includes(search.toLowerCase());
    const matchF = filter === 'all' || u.status === filter;
    return matchQ && matchF;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modals ── */}
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

      {/* ── Page ── */}
      <div className="relative min-h-screen pt-24 pb-16 px-4 sm:px-6 lg:px-8">

        <div className="relative z-10 max-w-6xl mx-auto space-y-6">

          {/* ── Page header ── */}
          <motion.div
            className="flex items-end justify-between"
            {...fadeUp}
          >
            <div>
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 mb-1">
                Space Management
              </p>
              <h1 className="font-jakarta font-black text-2xl tracking-tight text-white">
                Node Control
              </h1>
            </div>

            <div className="flex items-center gap-2">
              {/* Live pulse */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/8 bg-white/4">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  Live · 15s
                </span>
              </div>

              {/* Add user */}
              <motion.button
                onClick={() => setShowCreate(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl
                  font-jakarta font-black text-[10px] uppercase tracking-[0.2em]
                  text-black transition-all"
                style={{ background: 'var(--accent)' }}
              >
                <Plus size={12} />
                New Entity
              </motion.button>
            </div>
          </motion.div>

          {/* ── Stat cards ── */}
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
              value={fmt(stats?.uplink_bytes ?? 0)}
              sub="current session"
              icon={TrendingUp}
              accent="#38bdf8"
              delay={0.15}
            />
            <StatCard
              label="Downlink"
              value={fmt(stats?.downlink_bytes ?? 0)}
              sub="current session"
              icon={TrendingDown}
              accent="#a78bfa"
              delay={0.2}
            />
          </div>

          {/* ── Main content ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

            {/* ── Users panel ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-2xl overflow-hidden"
            >
              <GlassPane 
                className="inset-0" 
                style={{ 
                  borderRadius: '20px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)'
                }} />
              <GlassPaneContent>

                {/* Panel header */}
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

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    {/* Search */}
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

                    {/* Filter pills */}
                    <div className="flex gap-1">
                      {(['all', 'online', 'offline', 'blocked'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className="px-2.5 py-1 rounded-lg text-[8px] uppercase tracking-[0.12em]
                            font-bold transition-all duration-200"
                          style={{
                            background: filter === f ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: filter === f ? '#fff' : 'rgba(255,255,255,0.3)',
                            border: filter === f ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                          }}
                        >
                          {f === 'blocked' ? 'frozen' : f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* User list */}
                {loading ? (
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

            {/* ── Security Log ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="relative rounded-2xl overflow-hidden"
            >
              <GlassPane 
                className="inset-0" 
                style={{ 
                  borderRadius: '20px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)'
                }} />
              <GlassPaneContent className="flex flex-col h-full">

                {/* Log header */}
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

      {/* shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}