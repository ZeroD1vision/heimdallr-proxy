/**
 * @file index.ts
 * @description Barrel-экспорт всех публичных компонентов дашборда.
 *
 * Паттерн barrel позволяет импортировать всё из одного места:
 *   import { StatCard, UserRow, ConfirmModal } from '@/components/dashboard'
 * вместо:
 *   import { StatCard } from '@/components/dashboard/stat-card'
 *   import { UserRow } from '@/components/dashboard/user-row'
 *   ...
 *
 * Типы и утилиты (types.ts, utils.ts) намеренно не реэкспортируются здесь —
 * они импортируются напрямую там, где нужны, чтобы не засорять публичный API.
 */

export { StatCard    } from './ui/stat-card';
export { StatusOrb   } from './ui/status-orb';
export { TrafficBar  } from './ui/traffic-bar';
export { UserRow     } from './ui/user-row';
export { ConfirmModal} from './ui/confirm-modal';
export { CreateDrawer} from './ui/create-drawer';
export { SecurityLog } from './ui/security-log';