/**
 * @file create-drawer.tsx
 * @description Drawer (снизу на мобилке, центр на десктопе) для создания нового пользователя.
 *
 * Все поля формы хранятся как строки в стейте — конвертация в числа/даты
 * происходит в submit() непосредственно перед отправкой на бэк.
 * Это упрощает контролируемые инпуты и валидацию.
 *
 * Поля формы объявлены как массив fields[] — это позволяет рендерить
 * все инпуты одним .map() вместо дублирования разметки.
 */

'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import { useNotify, NotificationPresets } from '@/hooks/use-notify';
import { dashboardApi } from '@/components/dashboard/api/dashboard-api';
import type { CreateForm } from '@/components/dashboard/types';

// Конфигурация полей формы.
// Вынесена за пределы компонента — массив не пересоздаётся при каждом рендере.
const FORM_FIELDS: {
  label: string;
  key: keyof CreateForm;
  type: string;
  placeholder: string;
}[] = [
  { label: 'Entity ID',         key: 'email',       type: 'text',   placeholder: 'ivan_work'   },
  { label: 'Telegram ID',       key: 'telegram_id', type: 'number', placeholder: '123456789'   },
  { label: 'Inbound Tag',       key: 'inbound_tag', type: 'text',   placeholder: 'vless-reality' },
  { label: 'Traffic Limit (GB)',key: 'traffic_gb',  type: 'number', placeholder: '50'           },
  { label: 'Valid Until',       key: 'expires_at',  type: 'date',   placeholder: ''            },
];

const FORM_DEFAULTS: CreateForm = {
  email:       '',
  telegram_id: '',
  inbound_tag: 'vless-reality',
  traffic_gb:  '',
  expires_at:  '',
};

interface CreateDrawerProps {
  onClose: () => void;
  /** Вызывается после успешного создания — триггерит перезагрузку списка */
  onCreated: () => void;
}

export function CreateDrawer({ onClose, onCreated }: CreateDrawerProps) {
  const [form,    setForm   ] = useState<CreateForm>(FORM_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [err,     setErr    ] = useState<string | null>(null);
  const { notify } = useNotify();

  /** Фабрика обработчика onChange для конкретного поля формы */
  const handleField = (key: keyof CreateForm) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    setLoading(true);
    setErr(null);
    try {
      // Собираем payload: числа конвертируем, пустые поля опускаем
      const payload: Record<string, unknown> = {
        email:       form.email,
        inbound_tag: form.inbound_tag,
        vless_flow:  'xtls-rprx-vision', // дефолтный flow, не меняется через UI
      };
      if (form.telegram_id) payload.telegram_id  = Number(form.telegram_id);
      if (form.traffic_gb)  payload.traffic_limit = Math.round(Number(form.traffic_gb) * 1024 ** 3);
      if (form.expires_at)  payload.expires_at    = new Date(form.expires_at).toISOString();

      await dashboardApi.createUser(payload);
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

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Панель — снизу на мобилке, по центру на десктопе */}
      <motion.div
        className="relative w-full max-w-md mx-0 sm:mx-4"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <GlassPane className="inset-0" style={{ borderRadius: '20px 20px 0 0' }} />
        <GlassPaneContent
          className="p-6 pb-8 space-y-5"
          style={{ borderRadius: '20px 20px 0 0' }}
        >
          {/* Заголовок */}
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

          {/* Поля формы */}
          <div className="space-y-3">
            {FORM_FIELDS.map(({ label, key, type, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="text-[9px] uppercase tracking-[0.2em] text-white/35">
                  {label}
                </label>
                <input
                  type={type}
                  value={form[key]}
                  onChange={handleField(key)}
                  placeholder={placeholder}
                  className="w-full bg-white/4 border border-white/8 rounded-xl px-4 py-2.5
                    text-white text-xs font-geist-mono tracking-wide outline-none
                    placeholder:text-white/20 focus:border-white/20 focus:bg-white/6
                    transition-all duration-200"
                />
              </div>
            ))}
          </div>

          {/* Ошибка */}
          {err && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[11px] text-red-400/80 tracking-wide"
            >
              {err}
            </motion.p>
          )}

          {/* Кнопка сабмита */}
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