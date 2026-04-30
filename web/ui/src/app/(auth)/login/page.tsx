'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useVisualStore } from '@/store/use-visual-store';
import { authApi, tokenStorage } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'input' | 'link' | 'awaiting' | 'typing' | 'success' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1800;
const CODE_LENGTH = 6;

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
      if (tokenStorage.getToken()) {
        router.replace('/auth/profile'); // Если уже залогинен — сьебался на профиль
      }
    }, []);

  // Visual store — фон
  useEffect(() => {
    const store = useVisualStore.getState();
    store.setScene('auth');
    store.videoElements.data?.play().catch(() => {});

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

  // ── State ────────────────────────────────────────────────────────────────

  const [step, setStep] = useState<Step>('input');
  const [telegramId, setTelegramId] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tgLink, setTgLink] = useState('');

  // Для эффекта "программного ввода" цифр
  const [typingIdx, setTypingIdx] = useState(0);
  const autoCode = useRef<string>('');

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      // Используем НОВЫЙ authApi.register
      const res = await authApi.register(email, password);

      if (res.session_id && res.tg_link) {
        setSessionId(res.session_id);
        setTgLink(res.tg_link);
        tokenStorage.saveSessionId(res.session_id); 
        setStep('link');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

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
            // Запускаем эффект автовввода цифр
            await triggerAutoType(autoCode.current || '000000');
          }

          if (res.status === 'EXPIRED') {
            stopPolling();
            setErrorMsg('Session expired');
            setStep('error');
          }
        } catch {
          // Сетевая ошибка — не ломаем polling, просто пропускаем тик
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  // ── Restore session on mount ─────────────────────────────────────────────
  // Если пользователь закрыл вкладку пока был в TG — восстанавливаем
  useEffect(() => {
    const savedSession = tokenStorage.getSessionId();
    if (savedSession) {
      setSessionId(savedSession);
      setStep('link'); // Переходим к шагу с кнопкой TG
      startPolling(savedSession);
    }
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // ── Auto-type effect ──────────────────────────────────────────────────────
  // Цифры "печатаются" сами когда бот апрувит сессию

  const triggerAutoType = async (digits: string) => {
    setStep('typing');
    setCode(Array(CODE_LENGTH).fill(''));
    setTypingIdx(0);

    for (let i = 0; i < CODE_LENGTH; i++) {
      await delay(120 + Math.random() * 80);
      setCode((prev) => {
        const next = [...prev];
        next[i] = digits[i] ?? '•';
        return next;
      });
      setTypingIdx(i + 1);
    }

    await delay(400);
    setStep('success');
    await delay(800);
    router.push('/dashboard');
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCodeInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < CODE_LENGTH - 1) {
      codeInputsRef.current[idx + 1]?.focus();
    }
    // Если все 6 заполнены — авто-сабмит
    const filled = [...code];
    filled[idx] = digit;
    if (filled.every(Boolean) && filled.join('').length === CODE_LENGTH) {
      handleVerify(filled.join(''));
    }
  };

  const handleCodeKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      codeInputsRef.current[idx - 1]?.focus();
    }
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

  useEffect(() => {
    if (step !== 'link' || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await authApi.pollStatus(sessionId);
        if (res.status === 'APPROVED' && res.token) {
          tokenStorage.setToken(res.token);
          setStep('success');
          clearInterval(interval);
          setTimeout(() => router.push('/dashboard'), 1500);
        }
      } catch (e) { /* ignore */ }
    }, 2000);

    return () => clearInterval(interval);
  }, [step, sessionId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
  <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
    <AnimatePresence mode="wait">

      {/* ── Step 1: Ввод Email и Пароля (Вместо старого ID) ── */}
      {step === 'input' && (
        <motion.div
          key="input"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="z-10 w-full max-w-sm px-6"
        >
          <div className="mb-10 text-center">
            <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-600 mb-3">
              Identity Verification
            </p>
            <h1 className="font-jost text-3xl font-black uppercase tracking-[0.35em] text-white">
              Authorize
            </h1>
          </div>

          <form 
            onSubmit={handleRegister}
            className="glass-card border border-white/8 rounded-3xl p-8 space-y-6"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase tracking-[0.35em] text-zinc-600 mb-3 ml-1">
                  Email Node
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/4 border border-white/10 rounded-2xl px-5 py-4
                    text-white text-sm outline-none focus:border-white/25 transition-all
                    font-geist-mono tracking-wider placeholder:text-zinc-700"
                  placeholder="USER@HEIMDALLR.LOCAL"
                />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-[0.35em] text-zinc-600 mb-3 ml-1">
                  Access Key
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/4 border border-white/10 rounded-2xl px-5 py-4
                    text-white text-sm outline-none focus:border-white/25 transition-all
                    font-geist-mono tracking-wider placeholder:text-zinc-700"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400/80 text-center tracking-wide">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full bg-white/90 text-black font-syne font-black text-xs
                uppercase tracking-[0.25em] py-4 rounded-2xl
                hover:bg-white transition-all disabled:opacity-30 relative overflow-hidden"
            >
              {isLoading ? 'Initializing...' : 'Initialize Entity'}
            </button>
          </form>
        </motion.div>
      )}

      {/* ── Step 2: Кнопка перехода в Telegram (Новый шаг) ── */}
      {step === 'link' && (
        <motion.div
          key="link"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          className="z-10 w-full max-w-sm px-6"
        >
          <div className="glass-card border border-white/8 rounded-3xl p-8 space-y-8 text-center">
            <div className="space-y-3">
              <div className="flex justify-center"><TelegramIcon /></div>
              <h2 className="font-jost text-xl font-black uppercase tracking-widest text-white">Link Device</h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest leading-relaxed">
                Open our Telegram bot and press Start to finalize your identity link
              </p>
            </div>

            <a
              href={tgLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setStep('awaiting')}
              className="block w-full bg-white text-black font-syne font-black text-xs
                uppercase tracking-[0.25em] py-4 rounded-2xl hover:bg-zinc-200 transition-all"
            >
              Open Telegram
            </a>
          </div>
        </motion.div>
      )}

      {/* ── Step 3: Ожидание (Polling) ── */}
      {step === 'awaiting' && (
        <motion.div
          key="awaiting"
          className="z-10 w-full max-w-sm px-6"
        >
          <div className="mb-10 text-center">
            <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-600 mb-3">2FA Verification</p>
            <h1 className="font-jost text-3xl font-black uppercase tracking-[0.35em] text-white">Awaiting</h1>
          </div>

          <div className="glass-card border border-white/8 rounded-3xl p-8 space-y-8">
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="relative w-12 h-12">
                <span className="absolute inset-0 rounded-full bg-white/10 animate-ping" />
                <span className="absolute inset-0 rounded-full bg-white/5 border border-white/20 flex items-center justify-center">
                  <TelegramIcon />
                </span>
              </div>
              <p className="text-xs text-zinc-500 text-center tracking-wide">Waiting for bot confirmation...</p>
            </div>

            {/* Твой блок ручного ввода кода остаётся здесь на случай fallback */}
            <div className="space-y-4">
              <div className="flex gap-2 justify-center">
                {code.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { codeInputsRef.current[idx] = el; }}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeInput(idx, e.target.value)}
                    className="w-10 h-12 text-center bg-white/4 border border-white/10 rounded-xl text-white font-geist-mono text-lg outline-none"
                  />
                ))}
              </div>
              <button
                onClick={() => handleVerify()}
                className="w-full bg-white/10 text-white/50 font-syne font-black text-[9px] uppercase tracking-[0.25em] py-3 rounded-2xl border border-white/5"
              >
                Manual Verify
              </button>
            </div>
          </div>

          <button
            onClick={() => { tokenStorage.clearAll(); setStep('input'); }}
            className="w-full mt-6 text-center text-[9px] text-zinc-700 hover:text-zinc-500 uppercase tracking-widest"
          >
            ← Reset Session
          </button>
        </motion.div>
      )}

      {/* ── Step 4: Анимация успеха (Твой красивый Typing Effect) ── */}
      {(step === 'typing' || step === 'success') && (
        <motion.div key="success" className="z-10 w-full max-w-sm px-6 text-center">
          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-[0.4em] text-zinc-600 mb-3">Access Granted</p>
            <h1 className="font-jost text-3xl font-black uppercase tracking-[0.35em] text-white text-glow">Welcome</h1>
          </div>
          <div className="glass-card border border-white/8 rounded-3xl p-8 flex gap-2 justify-center">
            {code.map((digit, idx) => (
              <div key={idx} className="w-10 h-12 flex items-center justify-center border border-white/20 bg-white/5 rounded-xl font-geist-mono text-lg text-white">
                {digit}
              </div>
            ))}
          </div>
        </motion.div>
      )}

    </AnimatePresence>
  </main>
);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8l-1.68 7.92c-.12.56-.44.7-.9.44l-2.48-1.82-1.18 1.14c-.14.14-.26.26-.52.26l.18-2.6 4.74-4.28c.2-.18-.04-.28-.32-.1L7.64 14.4l-2.46-.76c-.54-.16-.54-.54.12-.8l9.6-3.7c.44-.16.84.1.74.66z"
        fill="rgba(255,255,255,0.5)"
      />
    </svg>
  );
}