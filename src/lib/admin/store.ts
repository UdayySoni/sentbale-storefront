'use client';
import { useSyncExternalStore } from 'react';
import { announce } from '@/lib/use-live';
import { DB_VERSION } from './seed';
import type { Db, ListKey, Row } from './types';

/**
 * Admin workspace data, stored on the server (`/api/admin/workspace`) behind this small API
 * (useDb / saveRow / removeRow / patchDb), so the admin screens never deal with requests themselves.
 *
 * Edits show immediately and are sent as the rows that changed, one save at a time; the server's reply
 * becomes the new state. A rejected save is rolled back to the server's copy and reported through
 * onStoreError. Other tabs refresh when told on a BroadcastChannel, and on focus.
 */
const LEGACY_KEY = 'sentbale.admin.v1';
const CHANNEL = 'sentbale-admin';
const LISTS: ListKey[] = ['products', 'skus', 'orders', 'customers', 'collections', 'coupons', 'reviews', 'posts', 'zones', 'partners', 'methods', 'roles', 'team', 'enquiries'];
const OBJECTS = ['homepage', 'settings', 'seen'] as const;
type Changes = { lists: Record<string, { upsert: Row[]; remove: string[] }>; objects: Partial<Pick<Db, typeof OBJECTS[number]>>; audit?: { action: string; target: string } };

let db: Db | null = null;
let actor = 'Admin';
let pending = 0;
let queue: Promise<void> = Promise.resolve();
let started = false;
const listeners = new Set<() => void>();
const errorListeners = new Set<(message: string) => void>();
const noticeListeners = new Set<(message: string) => void>();
const emit = () => listeners.forEach(listener => listener());
const fail = (message: string) => errorListeners.forEach(listener => listener(message));

async function request(body?: unknown) {
  const response = await fetch('/api/admin/workspace', body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { cache: 'no-store' });
  if (response.status === 401) { window.location.assign('/admin/login'); throw new Error('Your admin session has ended. Please sign in again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The admin workspace could not be reached. Check your connection.');
  return data;
}

/** Loads the server's copy unless a save is in flight (its reply will bring newer data). */
export async function refreshDb() {
  try {
    const data = await request();
    if (!pending) { db = data.db; emit(); }
    if (data.importable) await importFromBrowser();
  } catch (error) { fail(error instanceof Error ? error.message : 'The admin workspace could not be loaded.'); }
}

/** Before the server stored the workspace it lived in localStorage; bring that copy across once. */
async function importFromBrowser() {
  let saved: Db | null = null;
  try { const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); if (parsed?.version === DB_VERSION) saved = parsed; } catch { return; }
  if (!saved) return;
  try {
    const data = await request({ action: 'import', db: saved });
    db = data.db; emit();
    announce(CHANNEL); announce('sentbale-catalog');
  } catch { /* Already in use on the server: keep the browser copy as a backup only. */ }
  try { localStorage.setItem(`${LEGACY_KEY}.imported`, JSON.stringify(saved)); localStorage.removeItem(LEGACY_KEY); } catch { /* Storage blocked. */ }
}

function onFocus() { if (document.visibilityState !== 'hidden') void refreshDb(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void refreshDb();
    window.addEventListener('focus', onFocus);
    if (typeof BroadcastChannel !== 'undefined') new BroadcastChannel(CHANNEL).onmessage = () => void refreshDb();
  }
  return () => { listeners.delete(listener); };
}

/** Null until the workspace has loaded. */
export function useDb(): Db | null { return useSyncExternalStore(subscribe, () => db, () => null); }
export const uid = () => crypto.randomUUID();
export function setActor(name: string) { actor = name; }
/** Save failures, for the admin shell to show. Returns an unsubscribe function. */
export function onStoreError(listener: (message: string) => void) { errorListeners.add(listener); return () => { errorListeners.delete(listener); }; }
/** Messages the admin must see and keep, such as a new team member's invitation link. */
export function onStoreNotice(listener: (message: string) => void) { noticeListeners.add(listener); return () => { noticeListeners.delete(listener); }; }

function diff(current: Db, next: Db): Changes {
  const lists: Changes['lists'] = {};
  for (const key of LISTS) {
    if (current[key] === next[key]) continue;
    const before = new Map((current[key] as Row[]).map(row => [row.id, JSON.stringify(row)]));
    const after = next[key] as Row[];
    const kept = new Set(after.map(row => row.id));
    const upsert = after.filter(row => before.get(row.id) !== JSON.stringify(row));
    const remove = [...before.keys()].filter(id => !kept.has(id));
    if (upsert.length || remove.length) lists[key] = { upsert, remove };
  }
  const objects: Changes['objects'] = {};
  for (const key of OBJECTS) if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) Object.assign(objects, { [key]: next[key] });
  return { lists, objects };
}

function send(body: Record<string, unknown>) {
  pending++;
  queue = queue.then(async () => {
    let failed = false;
    try {
      const data = await request(body);
      if (pending === 1) db = data.db;
      if (data.catalogChanged) announce('sentbale-catalog');
      announce('sentbale-content');
      announce(CHANNEL);
      for (const notice of data.notices ?? []) noticeListeners.forEach(listener => listener(notice));
    } catch (error) {
      failed = true;
      fail(error instanceof Error ? error.message : 'Your change could not be saved.');
    } finally {
      pending--;
      emit();
    }
    if (failed && !pending) await refreshDb();
  });
}

export function patchDb(patch: Partial<Db> | ((current: Db) => Partial<Db>), action?: string, target = '') {
  if (!db) return;
  const next = { ...db, ...(typeof patch === 'function' ? patch(db) : patch) };
  const changes = diff(db, next);
  if (!Object.keys(changes.lists).length && !Object.keys(changes.objects).length && !action) return;
  if (action) changes.audit = { action, target };
  // Shown straight away; the server writes the real audit entry and its reply replaces this one.
  db = action ? { ...next, audit: [{ id: uid(), at: new Date().toISOString(), actor, action, target }, ...next.audit].slice(0, 500) } : next;
  emit();
  send({ action: 'apply', changes });
}
export function saveRow(list: ListKey, row: Row, noun: string, target: string) {
  if (!db) return;
  const rows = db[list] as Row[];
  const exists = rows.some(r => r.id === row.id);
  patchDb({ [list]: exists ? rows.map(r => r.id === row.id ? row : r) : [row, ...rows] }, `${exists ? 'Updated' : 'Created'} ${noun}`, target);
}
export function removeRow(list: ListKey, id: string, noun: string, target: string) {
  if (!db) return;
  patchDb({ [list]: (db[list] as Row[]).filter(r => r.id !== id) }, `Deleted ${noun}`, target);
}
export function resetDb() { send({ action: 'reset' }); }
