import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import Navbar from './navbar';

const meta: Meta<typeof Navbar> = {
  title: 'Layout/Navbar',
  component: Navbar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  argTypes: {
    // ЗАМЕНА: Теперь это простой чекбокс On/Off
    isScrolledSim: {
      control: { type: 'boolean' },
      name: 'Scrolled State',
      defaultValue: false,
    },
    // ЗАМЕДЛИТЕЛЬ: Чтобы рассмотреть переход, когда нажал чекбокс
    timeScale: {
      control: { type: 'range', min: 0.05, max: 1, step: 0.05 },
      name: 'Animation Speed (0.1 = Slow Mo)',
      defaultValue: 1,
    },
    initialVariant: {
      control: { type: 'select' },
      options: ['public', 'auth'],
      name: 'Navigation Mode',
    },
  },
  decorators: [
    (Story, context) => {
      const { isScrolledSim, timeScale, variant } = context.args;
      const durationBase = 0.6; // Базовая длительность твоей анимации

      useEffect(() => {
        // Имитируем позицию скролла: 0px или 100px (отсечка в Navbar стоит на 50px)
        const targetScroll = isScrolledSim ? 100 : 0;

        Object.defineProperty(window, 'scrollY', {
          value: targetScroll,
          configurable: true,
        });
        window.dispatchEvent(new Event('scroll'));
      }, [isScrolledSim]);

      return (
        // MotionConfig принудительно замедляет всё дерево элементов внутри Navbar
        <MotionConfig
          transition={{
            duration: durationBase / (timeScale || 1),
            ease: [0.23, 1, 0.32, 1], // Чистый эластичный пресет
          }}
        >
          <div className="relative w-full h-screen overflow-hidden bg-black">
            <style>
              {`
                @keyframes rainbow-flow {
                  0% { background-position: 0% 50%; }
                  100% { background-position: 200% 50%; }
                }
                .rainbow-bg {
                  background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff, #ff0000);
                  background-size: 200% 100%;
                  animation: rainbow-flow 10s linear infinite;
                }
                /* Дополнительно замедляем CSS переходы, если они есть в NavLink */
                * {
                  transition-duration: ${durationBase / (timeScale || 1)}s !important;
                }
              `}
            </style>

            <div className="rainbow-bg absolute inset-0 opacity-40 blur-[100px]" />

            <div className="relative z-10 pt-20">
              <Story />
            </div>
          </div>
        </MotionConfig>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof Navbar>;

export const Interactive: Story = {
  args: {
    isScrolledSim: false,
    timeScale: 1,
    initialVariant: 'public',
  } as any,
};

export const AuthTransition: Story = {
  args: {
    isScrolledSim: true,
    timeScale: 0.2,
    initialVariant: 'auth', //
  } as any,
  render: (args: any) => <Navbar initialVariant={args.initialVariant} />, //
};
