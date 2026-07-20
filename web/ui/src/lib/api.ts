// src/lib/api.ts
// Типизированный клиент к Heimdallr API.
// Все эндпоинты описаны здесь — компоненты не знают про fetch напрямую.
import { handleResponseError } from './api-error';

const API_PORT = process.env.NEXT_PUBLIC_API_PORT || '4000';
const BASE = `http://127.0.0.1:${API_PORT}`;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus = 'PENDING' | 'APPROVED' | 'EXPIRED';

export interface AuthResponse {
  session_id?: string;
  token?: string;      // Выдается только когда статус APPROVED
  tg_link?: string;    // Ссылка вида https://t.me/bot?start=auth_uuid
  status?: SessionStatus;
  message?: string;
}

export interface ApiError {
  error: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  // Если бэк ничего не вернул (204 No Content)
  if (res.status === 204) return {} as T;

  if (!res.ok) {
    await handleResponseError(res);
  }
  const data = await res.json();

  return data as T;
}

// ── Media API ────────────────────────────────────────────────────────────────

export interface MediaAsset {
  section: 'hero' | 'data' | 'auth';
  url: string;
  format?: string; // e.g., 'mp4', 'webm'
  bitrate?: string; // e.g., '720p', '1080p'
}

export interface MediaConfig {
  assets: MediaAsset[];
  timestamp?: number;
}

export const mediaApi = {
  /**
   * Получить конфиг видео-ассетов для всех сцен.
   * Бэк возвращает массив видеоресурсов с URL'ами.
   * На фронте это становится источником истины для video paths.
   * Чтобы менять видео быстро в продакшене — достаточно обновить конфиг на бэке, не трогая фронт.
   * Пока не реализован соответствующий эндпоинт на бэке — возвращает 401 (вовзрат по умолчанию), MediaManager использует fallback пути.
   */
  getMediaConfig: () =>
    request<MediaConfig>('/api/media/assets'),

  /**
   * Optional: Получить видео-ассет для конкретной сцены с учетом опций.
   * Например, можно запрашивать разные видео для разных ролей/стран. 
   * (пока не нужно, но может пригодиться)
   */
  getMediaForScene: (scene: 'hero' | 'data' | 'auth', opts?: { role?: string }) =>
    request<MediaAsset>(`/api/media/assets/${scene}`, {
      ...(opts && { body: JSON.stringify(opts) }),
    }),
};

// ── Auth API ──────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * 1. Вход по Email/Pass. 
   * Бэк создает сессию AWAITING_2FA и возвращает session_id + ссылку на бота.
   */
  login: (email: string, pass: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    }),

  /**
   * 2. Регистрация.
   * Создает пользователя в статусе PENDING и сессию для привязки Telegram.
   */
  register: (email: string, pass: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    }),

  /**
   * 3. Магический Поллинг.
   * Фронт долбит этот эндпоинт, пока статус не станет APPROVED.
   */
  pollStatus: (sessionId: string) =>
    request<AuthResponse>(`/api/auth/status/${sessionId}`),

  /**
   * 4. Fallback: Ручной ввод OTP.
   * Если автоматика через бота не прошла, юзер вводит 6 цифр из сообщения.
   */
  verifyOtp: (sessionId: string, code: string) =>
    request<AuthResponse>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, code }),
    }),
};

// ── Storage ───────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'h_jwt';
const SESSION_KEY = 'h_sid';

export const tokenStorage = {
  // JWT - токен доступа
  getToken: () => (typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null),
  setToken: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  
  // ID текущей попытки входа (для восстановления состояния при перезагрузке)
  saveSessionId: (id: string) => sessionStorage.setItem(SESSION_KEY, id),
  getSessionId: () => (typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null),
  
  clearAll: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  },
};