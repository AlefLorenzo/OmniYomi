import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from './api';

type WsMessage = { type: string; data?: any };
type WsListener = (msg: WsMessage) => void;

interface WsContextValue {
  connected: boolean;
  subscribe: (type: string, listener: WsListener) => () => void;
}

const WsContext = createContext<WsContextValue>({ connected: false, subscribe: () => () => {} });

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const listeners = useRef<Map<string, Set<WsListener>>>(new Map());
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const connect = () => {
    let url = '';
    const apiBase = getApiBaseUrl();
    if (apiBase) {
      url = apiBase.replace(/^http/, 'ws') + '/ws';
    } else {
      // Se estiver no aplicativo Android e não tiver servidor configurado, não tenta conectar
      if (typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || Boolean((window as any).Capacitor?.isNativePlatform?.()))) {
        setConnected(false);
        return;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url = `${protocol}//${window.location.hostname}:4567/ws`;
    }

    try {
      ws.current = new WebSocket(url);
    } catch {
      setConnected(false);
      return;
    }

    ws.current.onopen = () => setConnected(true);
    ws.current.onclose = () => {
      setConnected(false);
      reconnectTimer.current = window.setTimeout(connect, 3000);
    };
    ws.current.onerror = () => ws.current?.close();

    ws.current.onmessage = e => {
      try {
        const msg = JSON.parse(e.data) as WsMessage;
        const fns = listeners.current.get(msg.type);
        if (fns) fns.forEach(fn => fn(msg));
        const allFns = listeners.current.get('*');
        if (allFns) allFns.forEach(fn => fn(msg));
      } catch {}
    };
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, []);

  const subscribe = (type: string, listener: WsListener) => {
    if (!listeners.current.has(type)) listeners.current.set(type, new Set());
    listeners.current.get(type)!.add(listener);
    return () => listeners.current.get(type)?.delete(listener);
  };

  return <WsContext.Provider value={{ connected, subscribe }}>{children}</WsContext.Provider>;
}

export const useWs = () => useContext(WsContext);
