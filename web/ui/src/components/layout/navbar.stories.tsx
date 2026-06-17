import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import Navbar from './navbar';

type NavbarStoryArgs = React.ComponentProps<typeof Navbar> & {
  isScrolledSim?: boolean;
  timeScale?: number;
  mockPath?: string;
};

const meta: Meta<NavbarStoryArgs> = {
  title: 'Layout/Navbar',
  component: Navbar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    nextjs: {
      appDirectory: true,
    },
  },
  argTypes: {
    isScrolledSim: {
      control: { type: 'boolean' },
      name: 'Scrolled State',
    },
    timeScale: {
      control: { type: 'range', min: 0.05, max: 1, step: 0.05 },
      name: 'Animation Speed',
    },
    mockPath: {
      control: { type: 'select' },
      options: ['/', '/login', '/register'],
      name: 'Current Path (URL)',
    }
  },
  decorators: [
    (Story, context) => {
      const { isScrolledSim, timeScale } = context.args;
      const durationBase = 0.6;

      useEffect(() => {
        const targetScroll = isScrolledSim ? 100 : 0;
        Object.defineProperty(window, 'scrollY', {
          value: targetScroll,
          configurable: true,
        });
        window.dispatchEvent(new Event('scroll'));
      }, [isScrolledSim]);

      return (
        <MotionConfig
          transition={{
            duration: durationBase / (timeScale || 1),
            ease: [0.23, 1, 0.32, 1],
          }}
        >
          <div className="relative w-full h-screen overflow-hidden bg-black">
            <style>
              {`
                .rainbow-bg {
                  background: linear-gradient(90deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff, #ff0000);
                  background-size: 200% 100%;
                  animation: rainbow-flow 10s linear infinite;
                }
                @keyframes rainbow-flow {
                  0% { background-position: 0% 50%; }
                  100% { background-position: 200% 50%; }
                }
                * { transition-duration: ${durationBase / (timeScale || 1)}s !important; }
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
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {
    isScrolledSim: false,
    timeScale: 1,
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/', // Для 'public' варианта
      },
    },
  },
};

export const AuthMode: Story = {
  args: {
    isScrolledSim: true,
    timeScale: 0.5,
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: '/login', // Для 'auth' варианта
      },
    },
  },
};