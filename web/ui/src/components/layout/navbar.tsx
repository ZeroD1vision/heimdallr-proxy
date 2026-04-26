'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { User, LogIn, UserPlus, Settings, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';

export default function Navbar() {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsAccountOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsAccountOpen(false), 150);
  };

  return (
    <nav className="fixed top-6 left-0 w-full z-50 pointer-events-none">
      <div className="max-w-[80%] font-syne mx-auto relative pointer-events-auto flex justify-between items-center px-4 py-2">

        {/* Шторка — фоновый слой, знает что она absolute z-0 */}
        <GlassPane
          layout
          animate={{
            width: isScrolled ? '360px' : '100%',
            height: isScrolled ? '48px' : '64px',
            borderRadius: isScrolled ? '24px' : '16px',
          }}
          className="left-1/2 -translate-x-1/2"
        />

        {/* Логотип — контентный слой, GlassPaneContent даёт position: relative */}
        <GlassPaneContent
          as={motion.div}
          animate={{
            x: isScrolled ? '-10vw' : 0,
            scale: isScrolled ? 0.8 : 1,
          }}
          initial="initial"
          whileHover="hover"
          transition={{ type: 'spring', stiffness: 150, damping: 25 }}
        >
          <Link href="/" className="flex items-center gap-3 group">
            <Logo className="w-10 h-10 text-white transition-all duration-500 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
            <span className="font-syne text-sm font-black tracking-[0.3em] uppercase text-white/90">
              Heimdallr
            </span>
          </Link>
        </GlassPaneContent>

        {/* Центральное меню — absolute, не нуждается в GlassPaneContent */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center px-6 py-2 
            bg-black/[0.3] border border-white/10 rounded-full backdrop-brightness-[1.1]
            backdrop-blur-3xl backdrop-saturate-[180%] shadow-2xl">
          <div className="flex text-[12px] items-center gap-10 font-bold uppercase tracking-[0.25em]">
            <NavLink href="#about">About</NavLink>
            <NavLink href="#tech">Core</NavLink>
            <NavLink href="#contact">Contact</NavLink>
          </div>
        </div>

        {/* Аккаунт — контентный слой */}
        <GlassPaneContent
          as={motion.div}
          className="group"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          animate={{ x: isScrolled ? '10vw' : 0 }}
          transition={{ type: 'spring', stiffness: 150, damping: 25 }}
        >
          <motion.div
            animate={{
              borderRadius: isScrolled ? '20px' : '12px',
              clipPath: `inset(0px round ${isScrolled ? '20px' : '12px'})`,
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 30 }}
            className="w-10 h-10 flex items-center justify-center border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
            style={{
              backdropFilter: 'blur(20px) saturate(150%)',
              WebkitBackdropFilter: 'blur(20px) saturate(150%)',
            }}
          >
            <User size={16} className="text-zinc-400" />
          </motion.div>

          {/* Мостик между кнопкой и поповером */}
          {isAccountOpen && (
            <div className="absolute top-full left-0 w-full h-4" />
          )}

          {/* Account popover */}
          <AnimatePresence>
            {isAccountOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{ 
                  // Принудительно заставляем GPU считать этот слой отдельно
                  isolation: 'isolate',
                  WebkitBackdropFilter: 'blur(30px) saturate(150%)', 
                  backdropFilter: 'blur(30px) saturate(150%)'
                  }}
                className="absolute right-0 mt-5 w-64 glass-card p-5 shadow-2xl origin-top-right"
              >
                <div className="space-y-4">
                  <div className="pb-4 border-b border-zinc-800">
                    <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Session Identity</p>
                    <p className="text-white font-medium">
                      {isLoggedIn ? 'Artemiy Koshkin' : 'Unauthorized Entity'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {isLoggedIn ? (
                      <>
                        <AccountLink href="/profile" icon={<Settings size={14} />} label="Profile Settings" />
                        <button className="flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-sm">
                          <LogOut size={14} /> Log Out
                        </button>
                      </>
                    ) : (
                      <>
                        <AccountLink href="/login" icon={<LogIn size={14} />} label="Authorize" />
                        <AccountLink href="/register" icon={<UserPlus size={14} />} label="Request Access" />
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassPaneContent>

      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-zinc-300 hover:text-white transition-all duration-300 relative group">
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-white transition-all duration-300 group-hover:w-full opacity-50" />
    </Link>
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