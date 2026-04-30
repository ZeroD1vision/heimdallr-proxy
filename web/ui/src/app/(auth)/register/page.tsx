'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useVisualStore } from '@/store/use-visual-store';
import { authApi, tokenStorage } from '@/lib/api';

type RegisterStep = 'input' | 'awaiting_link' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<RegisterStep>('input');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [tgLink, setTgLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Инициализация визуальной сцены (фон, видео)
  useEffect(() => {
    const store = useVisualStore.getState();
    store.setScene('auth');
    return () => store.setScene('landing');
  }, []);

  // МАГИЯ: Поллинг статуса регистрации
  useEffect(() => {
    if (step !== 'awaiting_link' || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await authApi.pollStatus(sessionId);
        // Если статус стал APPROVED, значит бот привязал TG и активировал WebUser
        if (res.status === 'APPROVED' && res.token) {
          tokenStorage.setToken(res.token);
          setStep('success');
          clearInterval(interval);
          setTimeout(() => router.push('/dashboard'), 1500);
        }
      } catch (e) {
        console.error("Link polling error", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [step, sessionId, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await authApi.register(email, password);
      if (res.session_id && res.tg_link) {
        setSessionId(res.session_id);
        setTgLink(res.tg_link);
        setStep('awaiting_link');
      }
    } catch (err) {
      alert("Registration error. This email might be taken.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <AnimatePresence mode="wait">
        {step === 'input' && (
          <motion.div 
            key="input"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="z-10 w-full max-w-sm bg-black/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5"
          >
            <h1 className="font-syne font-black text-white text-xl uppercase mb-6 tracking-tighter text-center">
              Create Entity
            </h1>
            <form onSubmit={handleRegister} className="space-y-4">
              <input 
                type="email" placeholder="EMAIL" required
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-white/20 transition-all font-geist-mono text-sm"
                value={email} onChange={e => setEmail(e.target.value)}
              />
              <input 
                type="password" placeholder="PASSWORD" required
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white outline-none focus:border-white/20 transition-all font-geist-mono text-sm"
                value={password} onChange={e => setPassword(e.target.value)}
              />
              <button 
                disabled={isLoading}
                className="w-full bg-white text-black font-syne font-black py-4 rounded-2xl uppercase text-[10px] tracking-[0.2em] hover:bg-zinc-200 transition-all"
              >
                {isLoading ? 'Processing...' : 'Initialize'}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'awaiting_link' && (
          <motion.div 
            key="link"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            className="z-10 w-full max-w-sm text-center px-6"
          >
            <div className="bg-black/40 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/5 border-dashed">
              <h2 className="font-syne font-black text-white uppercase mb-4 tracking-widest">Link Telegram</h2>
              <p className="text-zinc-500 text-[11px] mb-8 leading-relaxed uppercase tracking-wider">
                Для активации узла необходимо привязать ваш Telegram аккаунт через бота Gjallarhorn.
              </p>
              
              <a 
                href={tgLink}
                target="_blank"
                className="inline-flex items-center gap-3 bg-sky-500 text-white font-syne font-bold px-8 py-4 rounded-2xl uppercase text-[10px] tracking-widest hover:bg-sky-400 transition-all shadow-[0_0_30px_rgba(14,165,233,0.3)]"
              >
                <span>Access via TG</span>
              </a>

              <div className="mt-8 flex justify-center gap-2">
                <span className="w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-pulse [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-white/20 rounded-full animate-pulse [animation-delay:0.4s]" />
              </div>
            </div>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div 
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="z-10 text-center"
          >
            <h2 className="font-syne font-black text-white text-3xl uppercase tracking-tighter animate-pulse">
              Activated
            </h2>
            <p className="text-zinc-500 font-geist-mono text-[10px] mt-2 uppercase tracking-widest">
              Identity confirmed. Redirecting to node...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}