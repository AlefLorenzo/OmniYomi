import { createContext, useContext, useReducer, useCallback } from 'react';
import React from 'react';
import { Toast } from './index';

type ToastType = { id: string; message: string; type: 'info' | 'success' | 'error' | 'warning' };

const ToastContext = createContext<{ show: (msg: string, type?: ToastType['type']) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, dispatch] = useReducer(
    (state: ToastType[], action: { type: 'ADD'; payload: ToastType } | { type: 'REMOVE'; id: string }) => {
      if (action.type === 'ADD') return [...state, action.payload];
      if (action.type === 'REMOVE') return state.filter(t => t.id !== action.id);
      return state;
    },
    []
  );

  const show = useCallback((message: string, type: ToastType['type'] = 'info') => {
    const id = `toast_${Date.now()}`;
    dispatch({ type: 'ADD', payload: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE', id }), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <Toast
            key={t.id}
            message={t.message}
            type={t.type}
            onClose={() => dispatch({ type: 'REMOVE', id: t.id })}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
