'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStorage } from '@/lib/api';

export type SocketStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface UseRealtimeOptions<T> {
  onMessage?: (event: T) => void;
  onConnect?: () => void;
  enabled?:   boolean;
}

const INITIAL_DELAY_MS = 1_000;
const MAX_DELAY_MS     = 30_000;
const WS_PATH          = '/api/ws';

export function useRealtime<T = unknown>({
  onMessage,
  onConnect,
  enabled = true,
}: UseRealtimeOptions<T> = {}) {
  const socketRef    = useRef<WebSocket | null>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef     = useRef(INITIAL_DELAY_MS);
  const mountedRef   = useRef(true);
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onConnectRef.current = onConnect;  }, [onConnect]);

  const [status, setStatus] = useState<SocketStatus>('disconnected');

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    const token = tokenStorage.getToken();
    if (!token) { setStatus('disconnected'); return; }

    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

    // Браузерный WebSocket не умеет слать заголовки, токен идёт в query строку
    const url = getWsUrl(token);

    setStatus(prev => prev === 'disconnected' ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) return;
      delayRef.current = INITIAL_DELAY_MS;
      setStatus('connected');
      onConnectRef.current?.();
    };

    socket.onmessage = ({ data }) => {
      if (!mountedRef.current) return;
      try { onMessageRef.current?.(JSON.parse(data) as T); }
      catch (e) { console.error('[WS] parse error:', e); }
    };

    socket.onerror = (e) => console.error('[WS] error:', e);

    socket.onclose = () => {
      if (!mountedRef.current) return;
      socketRef.current = null;
      setStatus('reconnecting');
      const delay = delayRef.current;
      timerRef.current = setTimeout(() => { if (mountedRef.current) connect(); }, delay);
      delayRef.current = Math.min(delay * 2, MAX_DELAY_MS);
    };
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return { status, isConnected: status === 'connected' };
}

// ──────────────── Вспомогательные функции ──────────────────────────────────────────

// Вспомогательная функция для получения URL сокета с токеном
const getWsUrl = (token: string) => {
  const isDev = process.env.NODE_ENV === 'development';
  const devPort = process.env.NEXT_PUBLIC_API_PORT || '3000';
  
  // В dev шлем сокет напрямую в Go (3000), минуя dev-сервер Next.js (3001)
  const host = isDev ? `${window.location.hostname}:${devPort}` : window.location.host;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // Со слэшем /api/ws/ из-за trailingSlash: true
  return `${proto}//${host}/api/ws?token=${encodeURIComponent(token)}`;
};