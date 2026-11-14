import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDate(ts: number | string | null | undefined): string {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Agora mesmo';
  if (mins < 60) return `${mins}min atrás`;
  if (hours < 24) return `${hours}h atrás`;
  if (days < 7) return `${days}d atrás`;
  return date.toLocaleDateString('pt-BR');
}

export function formatChapterTitle(ch: { title?: string; chapterNumber?: number }): string {
  if (ch.title && ch.title.trim()) return ch.title;
  if (ch.chapterNumber != null) return `Capítulo ${ch.chapterNumber}`;
  return 'Capítulo';
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

export const statusLabel: Record<string, string> = {
  ONGOING: 'Em andamento',
  COMPLETED: 'Concluído',
  HIATUS: 'Em hiato',
  CANCELLED: 'Cancelado',
  UNKNOWN: 'Desconhecido',
};

export const statusColor: Record<string, string> = {
  ONGOING: 'text-green-400',
  COMPLETED: 'text-blue-400',
  HIATUS: 'text-yellow-400',
  CANCELLED: 'text-red-400',
  UNKNOWN: 'text-gray-400',
};

export const downloadStatusLabel: Record<string, string> = {
  PENDING: 'Na fila',
  DOWNLOADING: 'Baixando',
  PAUSED: 'Pausado',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelado',
};
