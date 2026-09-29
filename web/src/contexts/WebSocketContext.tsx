import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';

export interface WSMessage {
  type: string;
  payload: unknown;
}

type MessageHandler = (msg: WSMessage) => void;

interface WebSocketContextValue {
  subscribe: (handler: MessageHandler) => () => void;
  send: (type: string, payload: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export function WebSocketProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(new Set<MessageHandler>());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unmountedRef = useRef(false);

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const send = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (!enabled) {
      return () => {
        unmountedRef.current = true;
      };
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;

    function connect() {
      if (unmountedRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage;
          handlersRef.current.forEach((handler) => handler(msg));
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        reconnectTimer.current = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [enabled]);

  return (
    <WebSocketContext.Provider value={{ subscribe, send }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket(onMessage: MessageHandler) {
  const ctx = useContext(WebSocketContext);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe((msg) => handlerRef.current(msg));
  }, [ctx]);

  return { send: ctx?.send ?? (() => {}) };
}
