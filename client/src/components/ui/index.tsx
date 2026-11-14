import React from 'react';
import { cn } from '../../lib/utils';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function Loader({ size = 'md', className, label }: LoaderProps) {
  const sizeClass = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <svg
        className={cn('animate-spin text-purple-500', sizeClass)}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label && <span className="text-sm text-gray-400">{label}</span>}
    </div>
  );
}

interface EmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function Empty({ icon, title, description, action, className }: EmptyProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 gap-4 text-center', className)}>
      {icon && <div className="text-5xl text-gray-600">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-300">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  const variants = {
    primary: 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/40 shadow-sm',
    secondary: 'bg-[#1f2535] hover:bg-[#262e42] text-gray-200 border border-[#2a3040]',
    ghost: 'hover:bg-[#1f2535] text-gray-300 hover:text-gray-100',
    danger: 'bg-red-700 hover:bg-red-600 text-white',
    outline: 'border border-purple-600 text-purple-400 hover:bg-purple-600 hover:text-white',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
    icon: 'w-8 h-8 p-0',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}

export function Input({ label, error, leftIcon, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-xs text-gray-400 font-medium">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          className={cn(
            'w-full bg-[#1a1e29] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500',
            'placeholder:text-gray-600 transition-colors',
            leftIcon && 'pl-9',
            error && 'border-red-500',
            className
          )}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

interface ProgressBarProps {
  value: number; // 0-100
  variant?: 'purple' | 'green' | 'blue' | 'red';
  size?: 'sm' | 'md';
  className?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, variant = 'purple', size = 'sm', className, showLabel }: ProgressBarProps) {
  const colors = {
    purple: 'bg-purple-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    red: 'bg-red-500',
  };

  const heights = { sm: 'h-1', md: 'h-2' };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('flex-1 bg-gray-800 rounded-full overflow-hidden', heights[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-300', colors[variant])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && <span className="text-xs text-gray-400 w-10 text-right">{Math.round(value)}%</span>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { label: string; value: string }[];
}

export function Select({ label, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-xs text-gray-400 font-medium">{label}</label>}
      <select
        className={cn(
          'w-full bg-[#1a1e29] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500',
          'cursor-pointer transition-colors',
          className
        )}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#131720] border border-[#2a3040] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-[#2a3040]">
            <h2 className="text-lg font-bold text-gray-100">{title}</h2>
            <button onClick={onClose} className="p-1 hover:text-purple-300 text-gray-400 transition-colors">✕</button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message, type = 'info', onClose }: { message: string; type?: 'info' | 'success' | 'error' | 'warning'; onClose: () => void }) {
  const colors = {
    info: 'bg-blue-900/90 border-blue-600 text-blue-200',
    success: 'bg-green-900/90 border-green-600 text-green-200',
    error: 'bg-red-900/90 border-red-600 text-red-200',
    warning: 'bg-yellow-900/90 border-yellow-600 text-yellow-200',
  };

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl text-sm', colors[type])}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}
