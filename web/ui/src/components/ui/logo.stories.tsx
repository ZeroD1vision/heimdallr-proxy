import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './logo';

const meta: Meta<typeof Logo> = {
  title: 'Brand/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#050505' },
        { name: 'debug', value: '#ff0055' }, // Яркий фон для поиска дырок в векторе
      ],
    },
  },
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center p-20 border border-white/5 bg-zinc-950/50 backdrop-blur-3xl rounded-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Logo>;

// Основной вид
export const Default: Story = {
  args: {
    className: 'w-16 h-16 text-white',
  },
};

// Режим "Под микроскопом" (Stress Test)
export const StressTest: Story = {
  args: {
    className: 'w-80 h-80 text-white', // Увеличиваем в 5 раз
  },
  render: (args) => (
    <div className="relative group">
      <Logo {...args} />
      {/* Вспомогательная сетка для проверки выравнивания */}
      <div className="absolute inset-0 border border-cyan-500/20 pointer-events-none" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-500/20 pointer-events-none" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-500/20 pointer-events-none" />
    </div>
  ),
};
