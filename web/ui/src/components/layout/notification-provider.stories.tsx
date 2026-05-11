import type { Meta, StoryObj } from '@storybook/react';
import { NotificationProvider } from '@/components/layout/notification-provider';
import Navbar from '@/components/layout/navbar';
import { useNotify, NotificationPresets } from '@/hooks/use-notify';
import { useEffect } from 'react';

// Кнопки живут внутри провайдера — иначе хук не найдёт контекст
function NotifyControls() {
  const { notify, dismiss } = useNotify();
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
      <button onClick={() => notify(NotificationPresets.success('Node connected'))}>
        Success
      </button>
      <button onClick={() => notify(NotificationPresets.error('Auth failed', 'auth_error'))}>
        Error
      </button>
      <button onClick={() => notify(NotificationPresets.warn('Connection degraded', 'net_warn'))}>
        Warn (persistent)
      </button>
      <button onClick={() => notify(NotificationPresets.critical('Session expired', 'session'))}>
        Critical (persistent)
      </button>
      <button onClick={() => notify(NotificationPresets.info('Copied to clipboard'))}>
        Info
      </button>
      <button onClick={dismiss}>Dismiss</button>
    </div>
  );
}

function Scene({ isSmall }: { isSmall?: boolean }) {
    useEffect(() => {
      if (isSmall) {
        // Имитируем скролл для внутренних слушателей Navbar
        window.scrollTo(0, 100);
        // Принудительно вызываем событие, так как scrollTo не всегда триггерит scroll event
        window.dispatchEvent(new Event('scroll'));
      } else {
        window.scrollTo(0, 0);
        window.dispatchEvent(new Event('scroll'));
      }
    }, [isSmall]);
    return (
    <NotificationProvider>
      {/* Хак для теста: если isSmall=true, мы имитируем скролл, 
         чтобы Navbar переключился в состояние small принудительно.
      */}
      <div className={`bg-black min-h-[200vh] ${isSmall ? 'pt-20' : ''}`}>
        <Navbar />
        <NotifyControls />
        
        {/* Визуальный индикатор для теста */}
        <div className="fixed top-4 right-4 text-[10px] text-white/20 font-mono uppercase">
          Mode: {isSmall ? 'Small (forced)' : 'Large'}
        </div>
      </div>
    </NotificationProvider>
  );
}

const meta: Meta = { 
    title: 'Layout/Notifications', 
    component: Scene,
    argTypes: {
    isSmall: {
      control: 'boolean',
      description: 'Force Navbar into small (scrolled) state',
    }
  }
};
export default meta;

export const Default: StoryObj<typeof Scene> = {
  args: {
    isSmall: false,
  }
};

export const ForcedSmall: StoryObj<typeof Scene> = {
  args: {
    isSmall: true,
  }
};