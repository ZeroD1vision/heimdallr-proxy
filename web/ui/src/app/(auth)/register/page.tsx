'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useVisualStore } from '@/store/use-visual-store';
import { authApi, tokenStorage } from '@/lib/api';
import { AuthCard, AuthButton, FloatingInput } from '@/components/auth';
import { useNotify, NotificationPresets } from '@/hooks/use-notify';

type RegisterStep = 'input' | 'awaiting_link' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const { notify } = useNotify();
  const [step, setStep] = useState<RegisterStep>('input');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [tgLink, setTgLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // При монтировании устанавливаем сцену на 'auth' и пытаемся запустить видео.
  useEffect(() => {
    // Если уже есть токен — нечего тут делать
    if (tokenStorage.getToken()) {
      router.replace('/profile');
      return;
    }
    const store = useVisualStore.getState();
    store.setScene('auth');
    // По выходу после ререндеринга сбрасываем сцену на лендинг
    return () => {
      store.setScene('landing');
    };
  }, []);

  // МАГИЯ для удобства пользователя: Поллинг статуса регистрации
  // (но думаю это уязвимость для ботов сканеров)
  useEffect(() => {
    if (step !== 'awaiting_link' || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await authApi.pollStatus(sessionId);
        // Если статус стал APPROVED, значит бот привязал TG и активировал WebUser
        if (res.status === 'APPROVED' && res.token) {
          tokenStorage.setToken(res.token);
          notify(NotificationPresets.success('Node activated. Redirecting...', 'auth_success'));
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

  // Обработчик отправки формы регистрации
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await authApi.register(email, password); // Запрос в API на регистрацию
      if (res.session_id && res.tg_link) {
        setSessionId(res.session_id);
        setTgLink(res.tg_link);
        setStep('awaiting_link');
        notify(NotificationPresets.info('Check Telegram for activation link'));
      }
    } catch (err) {
      notify(NotificationPresets.error('Email already taken', 'auth_error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <AnimatePresence mode="wait">
        {step === 'input' && (
          <motion.div key="input" className="w-full max-w-[450px]">
             <div className="mb-5 text-center">
                <p className="text-[15px] uppercase tracking-[0.5em] text-white/50 mb-2">New Node</p>
                <h1 className="font-jost text-4xl font-black uppercase tracking-[0.2em] text-white">Register</h1>
             </div>

             <AuthCard>
              <div className="p-10 space-y-6">
               <form onSubmit={handleRegister} className="space-y-10">
                 <FloatingInput 
                   label="Email" value={email} 
                   onChange={e => setEmail(e.target.value)} 
                   placeholder="USER@HEIMDALLR.LOCAL"
                 />
                 <FloatingInput 
                   label="Password" type="password" value={password} 
                   onChange={e => setPassword(e.target.value)} 
                   placeholder="••••••••"
                 />
                 <AuthButton isLoading={isLoading} disabled={!email || !password}>
                  Initialize Entity
                </AuthButton>
               </form>
              </div>
             </AuthCard>
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
                className="inline-flex items-center gap-3 bg-sky-500 text-white font-syne font-bold px-8 py-4 rounded-2xl uppercase text-ui-nano tracking-widest hover:bg-sky-400 transition-all shadow-[0_0_30px_rgba(14,165,233,0.3)]"
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

        { /* Скорее всего уберем потому что notify уже показывает успех, но пусть пока будет для полноты */ }
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
            <p className="text-zinc-500 font-geist-mono text-[11px] mt-2 uppercase tracking-widest">
              Identity confirmed. Redirecting to node...
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}