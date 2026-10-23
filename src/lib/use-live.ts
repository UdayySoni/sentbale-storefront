'use client';
import { useEffect, useState } from 'react';

/**
 * Keeps server-rendered content fresh in open tabs. Saves in the admin panel announce themselves on a
 * BroadcastChannel, so the timer is only a slow fallback for edits made in another browser.
 */
export function useLive<T extends { revision: string }>(url: string, channelName: string, initial: T, everyMs = 20000) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) { const data = await response.json(); if (active) setValue(current => current.revision === data.revision ? current : data); }
      } catch { /* Keep the last successfully loaded content. */ }
      finally { pending = false; }
    }
    const timer = setInterval(refresh, everyMs);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null;
    if (channel) channel.onmessage = refresh;
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); channel?.close(); };
  }, [url, channelName, everyMs]);
  return value;
}

export function announce(channelName: string) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage('updated');
  channel.close();
}
