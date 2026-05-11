import { useEffect, useRef, useState } from 'react';
import { tokenStorage } from '@/lib/api';

export function useSocket<T>(url: string, onMessage: (data: T) => void) {
    const socketRef = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const token = tokenStorage.getToken();
        if (!token) {
            // Какая то обработка отсутствия токена, например редирект на страницу логина или уведомление
            return;
        }

        const baseUrl = process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:3000`;
        const socketUrl = `${baseUrl}/ws?token=${token}`;
        const socket = new WebSocket(socketUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            setIsConnected(true);
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage(data);
            } catch (e) {
                console.error("WS Parse Error:", e);
            }
        };

        socket.onclose = () => {
            setIsConnected(false);
        };

        return () => {
            socket.close();
        };
    }, [url]);

    return { isConnected };
}