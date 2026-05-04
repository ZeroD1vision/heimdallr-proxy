'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useVisualStore } from '@/store/use-visual-store';
import { authApi, tokenStorage } from '@/lib/api';
import { DigitBox } from '@/components/auth/digit-box';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1800;
const CODE_LENGTH = 6;
const INPUT_CLASS = `w-full rounded-2xl px-5 py-4
  text-white text-sm outline-none transition-all text-[17px]
  font-mono tracking-wider placeholder:text-zinc-600
  bg-black/80 border border-white/10
  backdrop-blur-3xl backdrop-saturate-[180%]
  shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
  focus:border-white/25 focus:bg-black/100`;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Шаги авторизации:
 *   input    — ввод email + пароля
 *   link     — показываем кнопку перехода в Telegram
 *   awaiting — polling PENDING → ждём апрув из бота, инпуты для ручного кода активны
 *   typing   — автовввод цифр (анимация после апрува)
 *   success  — всё ок, редирект
 *   error    — сессия истекла или критическая ошибка
 */
type Step = 'input' | 'link' | 'awaiting' | 'typing' | 'success' | 'error';

// ── Animations ────────────────────────────────────────────────────────────────

const fadeSlideUp = {
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0  },
  exit:       { opacity: 0, y: -12, scale: 0.98 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
};

const fadeScale = {
  initial:    { opacity: 0, scale: 0.96 },
  animate:    { opacity: 1, scale: 1    },
  exit:       { opacity: 0, scale: 1.03 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

// ── AuthCard ──────────────────────────────────────────────────────────────────

/**
 * AuthCard — стеклянная карточка по паттерну из navbar:
 *
 *   Слой 1 (z-0): GlassPane        — абсолютная подложка с мягким блюром, border, тень.
 *                                     Это "шторка" — она знает, что она absolute.
 *   Слой 2 (z-10): GlassPaneContent — relative-обёртка для контента поверх шторки,
 *                                     дополнительно усиленная backdrop-blur-3xl —
 *                                     ровно как центральное меню в navbar лежит
 *                                     поверх GlassPane с более сильным блюром.
 */
function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-0.5 bg-white/5 blur-2xl opacity-20 group-hover:opacity-30 transition duration-1000" />
      {/* Фоновая шторка */}
      <GlassPane 
        className="inset-0 shadow-2xl" 
        style={{ 
          borderRadius: '24px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)'
        }} 
      />
      {/* Контентный слой */}
      <GlassPaneContent className="relative z-10">
        {children}
      </GlassPaneContent>
    </div>
  );
}

function FloatingInput({ 
  label, 
  value, 
  onChange, 
  type = "text", 
  placeholder,
  autoComplete 
}: { 
  label: string; 
  value: string; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  // Определяем, должна ли метка "улететь" наверх
  const isFloating = isFocused || value.length > 0;

  return (
    <div className="relative group w-full">
      {/* Метка-заголовок */}
      <motion.label
        initial={false}
        animate={{
          // Базовое состояние: -50% (центрирование по вертикали) (считается от начального top-1/2)
          // top-1/2 = 50% от высоты контейнера, минус 50% от своей высоты = идеально центрировано
          // Активное состояние: улетает вверх на расстояние трех себя
          y: isFloating ? "-250%" : "-50%",
          x: isFloating ? "-10px" : "0%",
          scale: isFloating ? 0.85 : 1,
          opacity: isFloating ? 1 : 0.85,
          color: isFloating ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.3)",
        }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-1/2 left-5 pointer-events-none 
                   font-mono text-sm uppercase tracking-widest text-white 
                   origin-left z-10"
        >
        {label}
      </motion.label>
      
      {/* Плейсхолдер (появляется только при фокусе и пустом значении) */}
      <AnimatePresence>
        {isFocused && !value && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none font-mono text-[15px] text-zinc-600 z-10"
          >
            {placeholder}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Инпут */}
      <input
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        autoComplete={autoComplete}
        placeholder=""
        // Плейсхолдер показываем только при фокусе
        className={`${INPUT_CLASS}`}
      />

      {/* Декоративная линия фокуса */}
      <motion.div 
        className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: isFocused ? 1 : 0, opacity: isFocused ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  // ── Visual store — управление фоновой сценой ──────────────────────────────

  useEffect(() => {
    // Если уже есть токен — нечего тут делать
    if (tokenStorage.getToken()) {
      router.replace('/auth/profile');
      return;
    }

    const store = useVisualStore.getState();
    store.setScene('auth');
    store.videoElements.data?.play().catch(() => {});

    // Переключаем видео когда ресурс загрузится
    const unsub = useVisualStore.subscribe(
      (s) => s.loadingStage,
      (stage) => {
        if (stage === 'ready') {
          useVisualStore.getState().videoElements.data?.play().catch(() => {});
          unsub();
        }
      }
    );

    return () => {
      unsub();
      useVisualStore.getState().setScene('landing');
    };
  }, []);

  // ── State ─────────────────────────────────────────────────────────────────

  const [step,      setStep     ] = useState<Step>('input');
  const [email,     setEmail    ] = useState('');
  const [password,  setPassword ] = useState('');
  const [tgLink,    setTgLink   ] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code,      setCode     ] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [errorMsg,  setErrorMsg ] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Для эффекта "программного ввода" цифр после апрува
  const autoCode      = useRef<string>('');
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // ── Polling ───────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (sid: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await authApi.pollStatus(sid);

          if (res.status === 'APPROVED' && res.token) {
            stopPolling();
            tokenStorage.setToken(res.token);
            await triggerAutoType(autoCode.current || '000000');
          }

          if (res.status === 'EXPIRED') {
            stopPolling();
            setErrorMsg('Session expired. Please try again.');
            setStep('error');
          }
        } catch {
          // Сетевой сбой — пропускаем тик, не ломаем сессию
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  // ── Restore session on mount ──────────────────────────────────────────────
  // Если юзер закрыл вкладку в процессе — подхватываем незавершённую сессию

  useEffect(() => {
    const savedSession = tokenStorage.getSessionId();
    if (savedSession) {
      setSessionId(savedSession);
      setStep('link');
      startPolling(savedSession);
    }
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await authApi.login(email, password);

      if (!res.session_id) {
        throw new Error('Critical: Node failed to initialize session');
      }

      setSessionId(res.session_id);
      tokenStorage.saveSessionId(res.session_id);

      if (res.tg_link) {
        setTgLink(res.tg_link);
        setStep('link');
      } else {
        // Бот уже привязан — сразу к вводу кода
        setStep('awaiting');
        startPolling(res.session_id);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Authorization failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[idx] = digit;
    setCode(newCode);

    if (digit && idx < CODE_LENGTH - 1) {
      codeInputsRef.current[idx + 1]?.focus();
    }
    if (newCode.every(Boolean)) handleVerify(newCode.join(''));
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      const newCode = [...code];
      newCode[idx - 1] = '';
      setCode(newCode);
      codeInputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;

    const newCode = [...code];
    pasted.split('').forEach((char, i) => { newCode[i] = char; });
    setCode(newCode);

    const lastIdx = Math.min(pasted.length - 1, CODE_LENGTH - 1);
    codeInputsRef.current[lastIdx]?.focus();

    if (newCode.every(Boolean)) handleVerify(newCode.join(''));
  };

  const handleVerify = async (manualCode?: string) => {
    const finalCode = manualCode ?? code.join('');
    if (finalCode.length !== CODE_LENGTH || !sessionId) return;

    setIsLoading(true);
    setErrorMsg('');

    try {
      const res = await authApi.verifyOtp(sessionId, finalCode);
      if (res.token) {
        stopPolling();
        tokenStorage.setToken(res.token);
        await triggerAutoType(finalCode);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Auto-type effect ──────────────────────────────────────────────────────
  // Цифры "печатаются сами" — кинематограф одобрения

  const triggerAutoType = async (digits: string) => {
    setStep('typing');
    setCode(Array(CODE_LENGTH).fill(''));

    for (let i = 0; i < CODE_LENGTH; i++) {
      await delay(120 + Math.random() * 80);
      setCode((prev) => {
        const next = [...prev];
        next[i] = digits[i] ?? '•';
        return next;
      });
    }

    await delay(400);
    setStep('success');
    await delay(800);
    router.push('/dashboard');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      <AnimatePresence mode="wait">

        {/* ── Step 1: Ввод учётных данных ─────────────────────────────────── */}
        {step === 'input' && (
          <motion.div
            key="input"
            className="z-10 w-full max-w-[500px] px-6"
            {...fadeSlideUp}
          >
            <div className="mb-5 text-center">
              <p className="text-[15px] uppercase tracking-[0.5em] text-white/50 mb-2">
                System Access
              </p>
              <h1 className="font-jost text-4xl font-black uppercase tracking-[0.2em] text-white drop-shadow-2xl">
                Authorize
              </h1>
            </div>

            <AuthCard>
              <div className="p-10 space-y-6">
                <form onSubmit={handleLogin} className="space-y-10">
  
                  <FloatingInput
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="USER@HEIMDALLR.LOCAL"
                    autoComplete="email"
                  />
  
                  <FloatingInput
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
  
                  {/* Сообщение об ошибке */}
                  <AnimatePresence>
                    {errorMsg && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[11px] text-red-400/80 text-center tracking-wide"
                      >
                        {errorMsg}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  
                  <button
                    type="submit"
                    disabled={isLoading || !email || !password}
                    className="w-full bg-white text-black font-syne font-black text-[11px]
                      uppercase tracking-[0.3em] py-5 rounded-2xl mt-4
                      hover:bg-zinc-200 transition-all duration-300
                      disabled:opacity-20 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  >
                    {isLoading ? 'Initializing...' : 'Initialize Entity'}
                  </button>
                </form>
              </div>
            </AuthCard>
          </motion.div>
        )}

        {/* ── Step 2: Telegram — ссылка для привязки ──────────────────────── */}
        {step === 'link' && (
          <motion.div
            key="link"
            className="z-10 w-full max-w-sm px-6"
            {...fadeScale}
          >
            <AuthCard>
              <div className="p-8  space-y-8 text-center">
                <div className="space-y-4">
                  <div className="w-14 h-14 mx-auto flex items-center justify-center
                    bg-white/5 border border-white/10 rounded-2xl">
                    <TelegramIcon size={22} />
                  </div>
                  <div>
                    <h2 className="font-jost text-xl font-black uppercase tracking-widest text-white mb-2">
                      Link Device
                    </h2>
                    <p className="text-[12px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                      Open our Telegram bot and press&nbsp;Start<br />
                      to finalize your identity link
                    </p>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <a
                  href={tgLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    setStep('awaiting');
                    if (sessionId) startPolling(sessionId);
                  }}
                  className="flex items-center justify-center gap-3 w-full
                    bg-blue-500 text-black font-syne font-black text-xs
                    uppercase tracking-[0.25em] py-4 rounded-2xl
                    hover:bg-blue-300 transition-all duration-200"
                >
                  <TelegramIcon size={15} dark />
                  Open Telegram
                </a>
              </div>
            </AuthCard>
          </motion.div>
        )}

        {/* ── Step 3: Ожидание + ручной ввод OTP ─────────────────────────── */}
        {(step === 'awaiting' || step === 'typing' || step === 'success') && (
          <motion.div
            key="awaiting-area"
            className="z-10 w-full max-w-sm px-6 flex flex-col gap-4"
            {...fadeSlideUp}
          >
            {/* Статус-бейдж */}
            <AuthCard>
              <div className="p-5 flex items-center gap-4">
                <div className="relative shrink-0 w-10 h-10">
                  <span className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
                  <span className="absolute inset-0 rounded-full bg-white/5 border border-white/20
                    flex items-center justify-center">
                    <TelegramIcon size={14} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-zinc-600 uppercase tracking-widest mb-1">
                    Session Status
                  </p>
                  <p className="text-xs text-zinc-400 tracking-wide leading-relaxed">
                    {step === 'success'
                      ? 'Identity confirmed. Redirecting...'
                      : 'Secure session active. Confirm via bot or enter code below.'}
                  </p>
                </div>
              </div>
            </AuthCard>

            {/* OTP-инпуты / анимация цифр */}
            <AuthCard>
              <div className="p-6 space-y-4">
                <p className="text-[15px] uppercase tracking-[0.35em] text-zinc-600 text-center">
                  Verification Code
                </p>

                <AnimatePresence mode="wait">
                  {step === 'awaiting' ? (
                    <motion.div
                      key="manual-input"
                      className="flex gap-2 justify-center"
                      onPaste={handlePaste}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {code.map((digit, idx) => (
                        <input
                          key={idx}
                          ref={(el) => { codeInputsRef.current[idx] = el; }}
                          type="text"
                          inputMode="numeric"
                          value={digit}
                          onChange={(e) => handleCodeInput(idx, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(idx, e)}
                          className="w-11 h-14 text-center bg-white/5 border border-white/10 rounded-xl
                            text-white font-geist-mono text-xl outline-none transition-all caret-transparent
                            focus:border-white/35 focus:bg-white/10"
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="auto-input"
                      className="flex gap-2 justify-center"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {code.map((digit, idx) => (
                        <DigitBox
                          key={idx}
                          value={digit}
                          index={idx}
                          isTyping={step === 'typing'}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {errorMsg && step === 'awaiting' && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0  }}
                      exit={{ opacity: 0 }}
                      className="text-[11px] text-red-400/80 text-center tracking-wide"
                    >
                      {errorMsg}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </AuthCard>
          </motion.div>
        )}

        {/* ── Step: Error — сессия истекла ────────────────────────────────── */}
        {step === 'error' && (
          <motion.div
            key="error"
            className="z-10 w-full max-w-sm px-6"
            {...fadeScale}
          >
            <AuthCard>
              <div className="p-8 space-y-6 text-center">
                <div className="w-12 h-12 mx-auto flex items-center justify-center
                  bg-red-500/10 border border-red-500/20 rounded-2xl">
                  <span className="text-red-400 text-lg">✕</span>
                </div>
                <div>
                  <h2 className="font-jost text-lg font-black uppercase tracking-widest text-white mb-2">
                    Session Expired
                  </h2>
                  <p className="text-[10px] text-zinc-500 tracking-wide">
                    {errorMsg || 'The authorization window has closed.'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setStep('input');
                    setErrorMsg('');
                    setCode(Array(CODE_LENGTH).fill(''));
                    tokenStorage.clearAll();
                  }}
                  className="w-full bg-white/5 border border-white/10 text-white/70 font-syne font-bold
                    text-xs uppercase tracking-[0.25em] py-3 rounded-2xl
                    hover:bg-white/10 hover:text-white transition-all"
                >
                  Try Again
                </button>
              </div>
            </AuthCard>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * TelegramIcon — SVG иконка телеграма.
 * @param size — размер в пикселях
 * @param dark — тёмная версия (для светлых кнопок)
 */
function TelegramIcon({ size = 18, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.92c-.12.56-.44.7-.9.44l-2.48-1.82-1.18 1.14c-.14.14-.26.26-.52.26l.18-2.6 4.74-4.28c.2-.18-.04-.28-.32-.1L7.64 14.4l-2.46-.76c-.54-.16-.54-.54.12-.8l9.6-3.7c.44-.16.84.1.74.66z"
        fill={dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)'}
      />
    </svg>
  );
}