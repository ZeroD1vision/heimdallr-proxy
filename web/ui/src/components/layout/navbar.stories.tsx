import type { Meta, StoryObj } from '@storybook/react';
import Navbar from './navbar';

const meta: Meta<typeof Navbar> = {
  title: 'Layout/Navbar',
  component: Navbar,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="relative w-full h-screen overflow-hidden bg-black">
        {/* Анимированный радужный фон */}
        <style>
          {`
            @keyframes rainbow-flow {
              0% { background-position: 0% 50%; }
              100% { background-position: 200% 50%; }
            }
            .rainbow-bg {
              background: linear-gradient(
                90deg, 
                #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #8b00ff, #ff0000
              );
              background-size: 200% 100%;
              animation: rainbow-flow 10s linear infinite;
            }
          `}
        </style>
        
        <div className="rainbow-bg absolute inset-0 opacity-40 blur-[100px]" />
        
        {/* Контейнер для навигации */}
        <div className="relative z-10 pt-20">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Navbar>;

export const Default: Story = {};

export const Scrolled: Story = {
  // Имитация прокрутки для теста состояния isScrolled
  render: () => {
    return (
      <div className="h-[200vh]">
        <Navbar />
        <div className="pt-[100vh] text-center text-white/20 font-black text-6xl">
          SCROLL DOWN TO TEST
        </div>
      </div>
    );
  }
};