'use client';

/**
 * @file navbar.tsx
 * @description Навбар с интегрированным островом уведомлений.
 *
 * Состояния уведомлений управляют геометрией GlassPane:
 *   idle        → обычный остров (маленькая таблетка или большая полоса в зависимости от скролла/маршрута)
 *   expanding   → остров растёт: сначала ширина (+ширина содержимого уведомления), затем высота
 *   visible     → остров остаётся раскрытым, NotificationBubble рендерится внутри
 *   changing    → NotificationBubble меняет содержимое (этим управляет AnimatePresence)
 *   shrinking   → остров возвращается в исходную форму
 *
 * Постоянные уведомления оставляют иконку в стеке, который расширяет остров влево.
 * Левое расширение анимируется отдельно от основной ширины острова.
 */
 

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useAnimate } from 'framer-motion';
import { User, LogIn, UserPlus, Settings, LogOut } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { GlassPane, GlassPaneContent } from '@/components/ui/glass-pane';
import { usePathname, useRouter } from 'next/navigation';
import { tokenStorage } from '@/lib/api';
import {
  useNotificationState,
  useNotificationCurrent,
  useNotificationOrigin,
  useNotificationActor,
} from '@/store/use-notification-machine';
import { NotificationBubble } from '@/components/ui/notification-bubble';
import { PersistentStack } from '@/components/ui/persistent-stack';
import { usePersistentStack } from '@/store/use-persistent-stack';
import { GlowProvider, useGlow } from '@/context/glow-context';
import { BurningGlow } from '@/components/ui/burning-glow';
import { NAVBAR_ANIMATION_TOKENS } from '@/shared/config/animations';


// ─── Геометрия острова ────────────────────────────────────────────────────────
// Эти значения управляют пропом animate GlassPane.
// Все измерения предусмотрены — изменяйте здесь, а не в JSX.
 
const ISLAND = {
  // Обычное состояние
  small: { width: '410px', height: '48px', borderRadius: '24px' },
  large: { width: '100%', height: '64px', borderRadius: '16px' },
 
  // Раскрытое состояние уведомления
  // Вспухает вниз: ширина не меняется, высота растёт
  notif: { width: '410px', height: '128px', borderRadius: '24px' },
} as const;

function halfHeightOffset(height: string) {
  return `calc(50% - ${parseInt(height, 10) / 2}px)`;
}

const ISLAND_TOP = {
  small: halfHeightOffset(ISLAND.small.height), // calc(50% - 24px)
  large: halfHeightOffset(ISLAND.large.height), // calc(50% - 32px)
} as const;
 
// Ширина расширения стека постоянных элементов (левая сторона острова).
// Вычисляется динамически на основе количества элементов в компоненте PersistentStack.
const STACK_EXTENSION_WIDTH = 48; // px, приблизительно
 
function GlowConsumerComponent() {
  const { glowColor } = useGlow();
  return <BurningGlow color={glowColor} />;
}

function NavbarContent() {
  const router = useRouter();
  const pathname = usePathname();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userBalance, setUserBalance] = useState('');
  const [activeTab, setActiveTab] = useState('about');
  const [accountScope, animateAccount] = useAnimate();
  
    // ─── Машина уведомлений ────────────────────────────────────────────────────
  const notifState = useNotificationState();
  const currentNotif = useNotificationCurrent();
  const notifActor = useNotificationActor();
  const persistentItemCount = usePersistentStack((s) => s.items.length);
 
  const notifOrigin = useNotificationOrigin();
  const isNotifActive =
    notifState === 'expanding' ||
    notifState === 'visible' ||
    notifState === 'changing';

    console.log('[Navbar] Rendered, notifState =', notifState);
 
  // ─── Настройка навигации ────────────────────────────────────────────────────
  const navigation = {
    public: [
      { id: 'about', label: 'About', href: '#about' },
      { id: 'tech', label: 'Core', href: '#tech' },
      { id: 'contact', label: 'Contact', href: '#contact' },
    ],
    auth: [
      { id: 'login', label: 'Authorize', href: '/login' },
      { id: 'register', label: 'Initialize', href: '/register' },
    ],
  };
  // Собираем все табы в один массив для поиска
  const allNavigationItems = [...navigation.public, ...navigation.auth];

  const variant = navigation.auth.some(tab => pathname.startsWith(tab.href)) 
    ? 'auth' 
    : 'public';
  const isAuth = variant === 'auth';
  const currentTabs = navigation[variant];
  const isSmall = variant === 'auth' || isScrolled;

  // ─── Синхронизация активной табы ──────────────────────────────────────────
  useEffect(() => {
    // Ищем элемент, чей href совпадает с текущим путём
    // Использование .startsWith() поможет, если появятся вложенные маршруты
    const currentTab = allNavigationItems.find(tab => 
      pathname === tab.href || (tab.href !== '/' && pathname.startsWith(tab.href))
    );

    if (currentTab) {
      setActiveTab(currentTab.id);
    }
  }, [pathname]);

  // ─── Состояние авторизации ───────────────────────────────────────────────
  useEffect(() => {
    const token = tokenStorage.getToken();
    setIsLoggedIn(!!token);
    // В идеале здесь должен быть вызов authApi.getMe() для получения данных профиля
    // Но для простоты сейчас просто жёсткокодим email при наличии токена
    if (token) {
      setUserBalance('1,240.00 ᚱ'); // Заглушка для баланса
      setUserEmail('artemiy@heimdallr.local')
    };
  }, [pathname]);

  // Пользователь не может иметь возможности открыть и видеть аккаунт, 
  // если он не авторизован, а он не авторизован, так как если бы был авторизован, не смог бы попасть на страницы (auth) 
  // поэтому прячем кнопку и меню целиком.
  const navigateToAuth = async (href: string) => {
    
    animateAccount(
      accountScope.current,
      { opacity: 0, x: 150, filter: 'blur(8px)' },
      { duration: 0.35, ease: 'easeIn' },
    );

    router.push(href);
  };

  // Сброс, когда уходим с auth обратно
  useEffect(() => {
    if (!isAuth && accountScope.current) {
      animateAccount(
        accountScope.current,
        { opacity: 1, x: 0, filter: 'blur(0px)' },
        { duration: 0.4, ease: 'easeOut' }
      );
    }
  }, [isAuth]);

  const handleLogout = () => {
    tokenStorage.clearAll();
    setIsLoggedIn(false);
    setUserEmail('');
    router.push(`\/${variant === 'auth' ? 'login' : ''}`);
  }

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

  const currentTop = isNotifActive 
  ? ISLAND_TOP[notifOrigin] // Берем из машины (small или large)
  : (isSmall ? ISLAND_TOP.small : ISLAND_TOP.large);

  // ─── Определение геометрии острова ────────────────────────────────────────
  // Определяем базовую (до-уведомления) форму.
  const baseShape = isSmall ? ISLAND.small : ISLAND.large;
 
  // Когда уведомление активно, переопределяем ширину и высоту.
  // Остров растёт вправо для ephemeral, расширение влево для persistent
  // обрабатывается компонентом PersistentStack, позиционированным абсолютно слева.
  const islandAnimate = {
    ...(isNotifActive ? ISLAND.notif : (isSmall ? ISLAND.small : ISLAND.large)),
    top: currentTop, // Привязываем верх к расчетной линии центра
  };
 
  // Сигнал ANIMATION_END: срабатывает, когда остров завершает расширение или сжатие.
  // Мы используем onAnimationComplete на элементе motion GlassPane.
  const handleIslandAnimationComplete = () => {
    const state = notifState;
    if (state === 'expanding' || state === 'shrinking') {
      notifActor.send({ type: 'ANIMATION_END' });
    }
  };

  // ─── Обработчик закрытия ──────────────────────────────────────────────────
  const handleDismiss = () => {
    notifActor.send({ type: 'DISMISS' });
  };

  return (
    <nav className="fixed top-6 left-0 w-full z-50 pointer-events-none">
      <div className="relative max-w-[80%] font-syne mx-auto pointer-events-auto flex justify-between items-center px-4 py-2">
        {/* ─── Стеклянный остров ────────────────────────────────────────────────────── */}
        {/*
          Примечание структуры: остров имеет position:absolute, центрирован.
          Стек постоянных элементов находится прямо слева от него, также absolute.
          Оба обёрнуты в относительный контейнер для выравнивания.
        */}
        <div className="absolute inset-0 flex justify-center pointer-events-none z-0">
 
          {/* ─── Стеклянный остров ────────────────────────────────────────────────────── */}
          <div className="absolute inset-0 flex justify-center pointer-events-none z-0">
            
            {/* Относительный контейнер-контур для эффекта зажигания */}
            {/* Он полностью повторяет размеры и анимацию острова, но НЕ ИМЕЕТ overflow-hidden */}
            <motion.div 
              style={{ position: 'relative' }}
              animate={{
                width: islandAnimate.width,
                height: islandAnimate.height,
                top: islandAnimate.top,
                borderRadius: islandAnimate.borderRadius,
              }}
              transition={{ 
                duration: NAVBAR_ANIMATION_TOKENS.LAYOUT.DURATION_SEC, 
                ease: NAVBAR_ANIMATION_TOKENS.LAYOUT.EASE }}
              className="pointer-events-none"
            >
              {/* Достаем цвет из контекста, который туда прокинул NotificationBubble */}
              <GlowConsumerComponent />

              {/* Основной стеклянный остров (внутри него работает overflow-hidden самого GlassPane) */}
              <GlassPane
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                animate={{ borderRadius: islandAnimate.borderRadius }}
                transition={{ 
                  duration: NAVBAR_ANIMATION_TOKENS.LAYOUT.DURATION_SEC, 
                  ease: NAVBAR_ANIMATION_TOKENS.LAYOUT.EASE }}
                onAnimationComplete={handleIslandAnimationComplete}
              />
            </motion.div>

            {/* Пузырь уведомления — рендерится внутри острова, когда активен */}
            <AnimatePresence>
              {isNotifActive && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: NAVBAR_ANIMATION_TOKENS.CONTENT.BUBBLE_FADE_SEC, ease: 'easeOut' }}
                  className="absolute left-1/2 -translate-x-1/2 flex justify-center pointer-events-auto overflow-hidden"
                  style={{
                    width: islandAnimate.width,
                    height: islandAnimate.height,
                    borderRadius: islandAnimate.borderRadius,
                    top: islandAnimate.top,
                    zIndex: 1,
                    originX: 0.5,
                  }}
                >
                  <div 
                    className="relative h-full overflow-hidden" 
                    style={{ 
                      width: islandAnimate.width,
                      borderRadius: islandAnimate.borderRadius 
                    }}
                  >
                    <NotificationBubble
                      notification={currentNotif}
                      onDismiss={handleDismiss}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Логотип — контентный слой, GlassPaneContent даёт position: relative */}
        <GlassPaneContent
          as={motion.div}
          animate={{
            x: isSmall ? '-10vw' : 0,
            scale: isSmall ? 0.8 : 1,
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

        {/* Центральное меню — абсолютный контейнер */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center px-4 py-1 
            bg-zinc-950/[0.60] border border-[#928989]/30 rounded-full backdrop-blur-2xl 
            backdrop-saturate-[180%] shadow-2xl z-10"
        >
          <div className="flex text-[12px] items-center font-bold uppercase tracking-[0.25em] relative">
            <AnimatePresence>
              {persistentItemCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: 8, filter: 'blur(4px)' }}
                  transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                  // right-full выносит иконки за левый борт капсюля, mr-4 задает зазор.
                  // top-1/2 -translate-y-1/2 центрирует их строго по горизонтальной оси меню.
                  className="absolute right-full -translate-y-1/2 mr-16 pointer-events-auto flex items-center"
                >
                  <PersistentStack visible={isNotifActive} />
                </motion.div>
              )}
            </AnimatePresence>
            
            <AnimatePresence mode="popLayout">
              {currentTabs.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.href}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 h-6 flex items-center justify-center transition-colors duration-500 relative z-10 ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-[#a1a1aa] hover:text-zinc-100'
                  }`}
                >
                  {/* Текст ссылки */}
                  <span className="relative z-20">{tab.label}</span>

                  {/* Акцентное стеклянное пятно */}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="active-pill"
                      transition={{
                        type: 'spring',
                        stiffness: 380,
                        damping: 28,
                      }}
                      className="absolute inset-0 bg-white/10 rounded-full border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.1)] z-10"
                    />
                  )}
                </Link>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Аккаунт — контентный слой */}
        <div ref={accountScope}>
        <GlassPaneContent
          as={motion.div}
          initial={{ opacity: 0, x: 50, filter: 'blur(10px)' }} // Появляется справа
          animate={{ 
            x: isSmall ? '8vw' : 0,
            opacity: isAuth ? 0 : 1,
            filter: 'blur(0px)',
          }}
          transition={{ 
            type: 'spring', 
            stiffness: 150,
            damping: 25 
          }}
          className="group"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <motion.div
            animate={{
              borderRadius: isSmall ? '20px' : '12px',
              clipPath: `inset(0px round ${isSmall ? '20px' : '12px'})`,
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

          {/* Выпадающее меню аккаунта */}
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
                  backdropFilter: 'blur(30px) saturate(150%)',
                }}
                className="absolute right-0 mt-5 w-64 glass-card p-5 shadow-2xl origin-top-right"
              >
                <div className="space-y-4">
                  <div className="pb-4 border-b border-white/5">
                  <p className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] mb-1">Entity Status</p>
                  <p className="text-white font-geist-mono text-xs truncate uppercase">
                    {isLoggedIn ? userEmail : 'Unauthorized'}
                  </p>
                </div>
                  <div className="flex flex-col gap-1">
                    {isLoggedIn ? (
                      <>
                        <div className="px-3 py-2 bg-white/5 rounded-lg border border-white/5 mb-2">
                          <p className="text-[8px] text-zinc-500 uppercase tracking-widest">Balance</p>
                          <p className="text-emerald-400 font-bold font-syne text-sm">{ userBalance }</p>
                        </div>
                        <AccountLink href="/dashboard" icon={<Settings size={14} />} label="Node Control" />
                        <AccountLink href="/profile" icon={<User size={14} />} label="Profile" />
                        <button 
                          onClick={handleLogout}
                          className="flex items-center gap-3 px-3 py-2 text-red-400/80 hover:bg-red-500/10 rounded-lg transition-all text-sm mt-2"
                        >
                          <LogOut size={14} /> Terminate Session
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => navigateToAuth('/login')}
                          className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm w-full">
                          <LogIn size={14} /> Authorize
                        </button>
                        <button onClick={() => navigateToAuth('/register')}
                          className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm w-full">
                          <UserPlus size={14} /> Initialize
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassPaneContent>
        </div>
      </div>
    </nav>
  );
}

export default function Navbar() {
  return (
    <GlowProvider>
      <NavbarContent />
    </GlowProvider>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-zinc-300 hover:text-white transition-all duration-300 relative group"
    >
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-white transition-all duration-300 group-hover:w-full opacity-50" />
    </Link>
  );
}

function AccountLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm"
    >
      {icon} {label}
    </Link>
  );
}
