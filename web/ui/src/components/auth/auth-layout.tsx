'use client';
import { useEffect } from 'react';
import { useVisualStore } from '@/store/use-visual-store';
import { GlassPaneContent, GlassPane } from '../ui/glass-pane';

interface AuthButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
  type?: "button" | "submit";
}

export function AuthButton({ 
  onClick, 
  disabled, 
  isLoading, 
  children, 
  type = "submit" 
}: AuthButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || isLoading}
      className="w-full bg-white text-black font-syne font-black text-[11px]
        uppercase tracking-[0.3em] py-5 rounded-2xl mt-4
        hover:bg-zinc-200 active:scale-[0.98] transition-all duration-300
        disabled:opacity-20 disabled:pointer-events-none
        shadow-[0_0_20px_rgba(255,255,255,0.1)]"
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1 h-1 bg-black rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1 h-1 bg-black rounded-full animate-bounce" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
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

export function AuthLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const store = useVisualStore.getState();
    store.setScene('auth');
    // Пытаемся запустить видео, если оно уже загружено
    if (!store.videoElements.auth) {
      // Если видео ещё нет в сторе, подписываемся и запускаем по загрузке
      const unsub = useVisualStore.subscribe(
        (s) => s.videoElements.auth,
        (authVideo) => {
          if (authVideo) {
            authVideo.play().catch(() => {}); // Не может не удаваться, но на всякий случай ловим
            unsub(); // отписываемся после первого срабатывания
          }
        }
      );

      return unsub; // отписка при размонтировании
    }
    store.videoElements.auth?.play().catch(() => {});
    
    return () => store.setScene('landing');
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-6">
      {children}
    </main>
  );
}