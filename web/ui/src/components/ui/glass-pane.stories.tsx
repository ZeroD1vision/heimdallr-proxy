import type { Meta, StoryObj } from '@storybook/react';
import { GlassPane } from './glass-pane';
import '../../app/globals.css';

const meta: Meta<typeof GlassPane> = {
  title: 'UI/GlassPane',
  component: GlassPane,
  parameters: {
    layout: 'centered',
  },
  // Добавляем фон, чтобы видеть эффект блюра
  decorators: [
    (Story) => (
      <div className="p-20 bg-gradient-to-br from-indigo-900 via-black to-emerald-900 w-[1300px] h-[400px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof GlassPane>;

export const Default: Story = {
  args: {
    className: 'w-full h-72 rounded-[32px] glass-pane-refraction',
  },
};
