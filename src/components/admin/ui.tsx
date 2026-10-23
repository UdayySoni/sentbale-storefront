'use client';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import type { Db } from '@/lib/admin/types';

export const formatDate = (value: string) => value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const formatDateTime = (value: string) => value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/* ---------- Toasts ---------- */
type Toast = { id: number; message: string; error: boolean };
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, error = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, error });
    timer.current = setTimeout(() => setToast(null), error ? 7000 : 4000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="adm-toasts">
      {toast && <div key={toast.id} className={`adm-toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
        {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{toast.message}</span>
        <button type="button" aria-label="Dismiss message" onClick={() => setToast(null)}><X size={15} /></button>
      </div>}
    </div>
  </ToastContext.Provider>;
}

/* ---------- Popover: closes on outside press and Escape ---------- */
export function usePopover<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const press = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', press);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', press); document.removeEventListener('keydown', key); };
  }, [open]);
  return [open, setOpen, ref] as const;
}

/* ---------- Dialogs ---------- */
export function Drawer({ open, title, eyebrow, onClose, children, center = false }: { open: boolean; title: string; eyebrow?: string; onClose: () => void; children: ReactNode; center?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={center ? 'adm-dialog center' : 'adm-dialog'} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {open && <div className="adm-dialog-body">
      <header><div>{eyebrow && <p className="adm-eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><button type="button" className="adm-icon-btn" aria-label={`Close ${title}`} onClick={onClose}><X size={18} /></button></header>
      {children}
    </div>}
  </dialog>;
}
export function Confirm({ open, title, body, action, onConfirm, onCancel }: { open: boolean; title: string; body: string; action: string; onConfirm: () => void; onCancel: () => void }) {
  return <Drawer open={open} title={title} onClose={onCancel} center>
    <p className="adm-muted">{body}</p>
    <div className="adm-form-actions"><button type="button" className="adm-btn ghost" onClick={onCancel}>Cancel</button><button type="button" className="adm-btn danger" onClick={onConfirm}>{action}</button></div>
  </Drawer>;
}

/* ---------- Small building blocks ---------- */
const tones: Record<string, string> = {
  Delivered: 'good', Active: 'good', Published: 'good', Paid: 'good', Enabled: 'good', Visible: 'good', Live: 'good', 'In stock': 'good',
  Shipped: 'info', Invited: 'info', New: 'info', VIP: 'gold',
  Processing: 'warn', Pending: 'warn', Draft: 'warn', Paused: 'warn', 'Low stock': 'warn',
  Cancelled: 'bad', Refunded: 'bad', Blocked: 'bad', Hidden: 'bad', Expired: 'bad', Suspended: 'bad', Disabled: 'bad', 'Out of stock': 'bad',
};
export function Badge({ children }: { children: string }) { return <span className={`adm-badge ${tones[children] || ''}`}>{children}</span>; }

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="adm-page-head"><div><h1>{title}</h1><p>{description}</p></div>{children && <div className="adm-page-actions">{children}</div>}</div>;
}
export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string }[] }) {
  return <nav className="adm-tabs" aria-label="Section views">{tabs.map((tab, i) => <Link key={tab.key} href={i ? `${base}?tab=${tab.key}` : base} className={tab.key === current ? 'active' : ''} aria-current={tab.key === current ? 'page' : undefined}>{tab.label}</Link>)}</nav>;
}
export function Loading() { return <div className="adm-loading" aria-busy="true">Opening your workspace…</div>; }

/* ---------- Form fields ---------- */
export type Fld = { name: string; label: string; type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'date' | 'toggle' | 'url'; options?: string[] | ((db: Db) => string[]); required?: boolean; min?: number; max?: number; step?: number; maxLength?: number; half?: boolean; hint?: string };
export type FormValues = Record<string, string | boolean>;

export function toForm(fields: Fld[], row: Record<string, unknown>): FormValues {
  return Object.fromEntries(fields.map(field => {
    if (field.type === 'toggle') return [field.name, !!row[field.name]];
    const text = String(row[field.name] ?? '');
    if (field.type === 'date') return [field.name, text.slice(0, 10)];
    // A select always shows an option, so start it on the first one rather than an invisible blank.
    return [field.name, !text && field.type === 'select' && Array.isArray(field.options) ? field.options[0] : text];
  }));
}
/** Returns cleaned values, or the first validation message. */
export function fromForm(fields: Fld[], values: FormValues): Record<string, unknown> | string {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.type === 'toggle') { result[field.name] = !!raw; continue; }
    const text = String(raw ?? '').trim();
    if (field.required && !text) return `${field.label} is required.`;
    if (field.type === 'number') {
      const number = text === '' ? 0 : Number(text);
      if (!Number.isFinite(number)) return `${field.label} must be a number.`;
      if (field.min !== undefined && number < field.min) return `${field.label} must be at least ${field.min}.`;
      if (field.max !== undefined && number > field.max) return `${field.label} must be at most ${field.max}.`;
      result[field.name] = number;
      continue;
    }
    if (field.type === 'email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `Enter a valid email for ${field.label.toLowerCase()}.`;
    if (field.type === 'url' && text && !/^(\/|https:\/\/)/.test(text)) return `${field.label} must start with / or https://.`;
    result[field.name] = text;
  }
  return result;
}
export function Fields({ fields, values, onChange, db }: { fields: Fld[]; values: FormValues; onChange: (name: string, value: string | boolean) => void; db: Db }) {
  return <div className="adm-fields">{fields.map(field => {
    const value = values[field.name];
    if (field.type === 'toggle') return <label key={field.name} className={`adm-toggle ${field.half ? 'half' : ''}`}><input type="checkbox" checked={!!value} onChange={event => onChange(field.name, event.target.checked)} /><span aria-hidden="true" /><b>{field.label}{field.hint && <small>{field.hint}</small>}</b></label>;
    const common = { value: String(value ?? ''), required: field.required, onChange: (event: { target: { value: string } }) => onChange(field.name, event.target.value) };
    const options = typeof field.options === 'function' ? field.options(db) : field.options;
    return <label key={field.name} className={`adm-field ${field.half ? 'half' : ''}`}>{field.label}
      {field.type === 'textarea' ? <textarea rows={4} maxLength={field.maxLength || 3000} {...common} />
        : field.type === 'select' ? <select {...common}>{options?.map(option => <option key={option}>{option}</option>)}</select>
        : <input type={field.type === 'url' ? 'text' : field.type || 'text'} min={field.min} max={field.max} step={field.step} maxLength={field.maxLength || 250} inputMode={field.type === 'number' ? 'decimal' : undefined} {...common} />}
      {field.hint && <small>{field.hint}</small>}
    </label>;
  })}</div>;
}

/* ---------- CSV export ---------- */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  // Prefix cells a spreadsheet would run as a formula, then quote everything.
  const cell = (value: string | number) => { const text = String(value); return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`; };
  const csv = [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
