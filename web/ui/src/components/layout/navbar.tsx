'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogIn, UserPlus, Settings, LogOut } from 'lucide-react';

export default function Navbar() {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Позже заменим на реальный auth-state
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Обработчики для всей группы (кнопка + окно)
  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsAccountOpen(true);
  };

  const handleMouseLeave = () => {
    // Небольшая задержка, чтобы переход между кнопкой и окном был бесшовным
    timeoutRef.current = setTimeout(() => {
      setIsAccountOpen(false);
    }, 150); 
  };

  return (
    <nav className="fixed top-6 left-0 w-full z-50 pointer-events-none">
      {/* Этот контейнер (div ниже) — "Отец". 
          Он прозрачный, поэтому не передает настройки блюра детям.
          Но он управляет позицией всего, что внутри.
      */}
      <div className="max-w-[80%] font-syne mx-auto relative pointer-events-auto flex justify-between items-center px-4 py-2">
        
        {/* --- ВНЕШНИЙ КОНТЕЙНЕР / ШТОРКА --- */}
        <motion.div
          layout
          initial={false}
          animate={{
            width: isScrolled ? "360px" : "100%", // Сжимается до размера меню
            height: isScrolled ? "44px" : "56px",
            borderRadius: isScrolled ? "22px" : "18px",
            backgroundColor: isScrolled ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.03)",
          }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
          className="absolute left-1/2 -translate-x-1/2 border border-white/10 backdrop-blur-xl -z-10 shadow-2xl"
        />

        {/* --- ЛОГОТИП --- */}
        <motion.div
          animate={{
            x: isScrolled ? "-10vw" : 0, // Улетает в край экрана
            opacity: 1,
            scale: isScrolled ? 0.8 : 1
          }}
          transition={{ type: "spring", stiffness: 150, damping: 25 }}
        >
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <span className="font-syne text-sm font-bold tracking-[0.2em] uppercase text-white">
              Heimdallr
            </span>
          </Link>
        </motion.div>

        {/* Центральная часть (Сюда добавим ссылки позже) */}
        {/* <div className="font-jakarta text-[11px] scale-x-110 tracking-[0.15em] hidden uppercase md:flex items-center gap-10 text-zinc-400 text-sm font-medium">
            <Link href="/nodes" className="hover:text-white transition-colors">Nodes</Link>
            <Link href="/stats" className="hover:text-white transition-colors">Network</Link>
        </div> */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center px-4 py-1.5 bg-white/[0.03] border border-white/10 rounded-full backdrop-blur-md">
          <div className="flex items-center gap-8 text-[10px] font-bold uppercase tracking-[0.2em] font-jakarta">
            <Link href="#mission" className="text-zinc-500 hover:text-white transition-colors">About Us</Link>
            <Link href="#tech" className="text-zinc-400 hover:text-white transition-colors">Technology</Link>
            <Link href="#access" className="text-zinc-400 hover:text-white transition-colors">Contact</Link>
          </div>
        </div>

        {/* Правая часть: Аккаунт */}
        {/* --- ГРУППА АККАУНТА --- */}
        <motion.div 
          className="relative group"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          animate={{ x: isScrolled ? "10vw" : 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 25 }}
        >
          {/* --- АККАУНТ --- */}
          <div className="flex items-center gap-4">
            <motion.div
              animate={{ 
                borderRadius: isScrolled ? "20px" : "12px", // 16px = rounded-2xl
                clipPath: `inset(0px round ${isScrolled ? '20px' : '12px'})`
              }}
              transition={{ type: "spring", stiffness: 100, damping: 30 }}
              className="w-10 h-10 flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              style={{ 
                backdropFilter: 'blur(20px) saturate(150%)',
                WebkitBackdropFilter: 'blur(20px) saturate(150%)',
                willChange: 'border-radius, contents'
              }}
            >
              <User size={16} className="text-zinc-400" />
            </motion.div>
          </div>

          {/* МОСТИК: Невидимый блок, который соединяет кнопку и окно.
             Он появляется только когда окно открыто. 
          */}
          {isAccountOpen && (
            <div className="absolute top-full left-0 w-full h-4 bg-transparent" />
          )}

          {/* Выпадающее меню (Account Popover) */}
          <AnimatePresence>
            {isAccountOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                /* Добавляем !bg-opacity и принудительный фильтр */
                className="absolute right-0 mt-3 w-64 glass-card p-5 shadow-2xl origin-top-right !bg-white/[0.05] overflow-hidden"
                style={{ 
                  // Принудительно заставляем GPU считать этот слой отдельно
                  isolation: 'isolate',
                  WebkitBackdropFilter: 'blur(30px) saturate(150%)', 
                  backdropFilter: 'blur(30px) saturate(150%)'
                  }}
              >
                
                <div className="space-y-4">
                  {/* Информация об аккаунте */}
                  <div className="pb-4 border-b border-zinc-800">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Session Identity</p>
                    <p className="text-white font-medium">
                      {isLoggedIn ? 'Artemiy Koshkin' : 'Unauthorized Entity'}
                    </p>
                  </div>

                  {/* Ссылки / Действия */}
                  <div className="flex flex-col gap-1">
                    {isLoggedIn ? (
                      <>
                        <AccountLink href="/profile" icon={<Settings size={14}/>} label="Profile Settings" />
                        <button className="flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-sm">
                          <LogOut size={14} /> Log Out
                        </button>
                      </>
                    ) : (
                      <>
                        <AccountLink href="/login" icon={<LogIn size={14}/>} label="Authorize" />
                        <AccountLink href="/register" icon={<UserPlus size={14}/>} label="Request Access" />
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </nav>
  );
}

function AccountLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link 
      href={href} 
      className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm"
    >
      {icon} {label}
    </Link>
  );
}