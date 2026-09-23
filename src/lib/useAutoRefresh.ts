import * as React from 'react';
import { supabase } from './supabaseClient';

type ChangeSpec = {
  table: string;
  filter?: string;
};

export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  channelName: string,
  changes: ChangeSpec[] = [],
  intervalMs = 15000
) {
  const refreshRef = React.useRef(refresh);
  const lastRunRef = React.useRef(0);

  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  React.useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const run = () => {
      if (disposed || document.visibilityState === 'hidden' || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRunRef.current < 3000) return;
      lastRunRef.current = now;
      void refreshRef.current();
    };

    const onOnline = () => run();

    // Do one initial load. Do not refresh on focus/visibility changes: those
    // events were causing the mobile dashboard to repeatedly redraw and flash
    // "Carregando..." when the user opened/closed the menu or returned to it.
    run();
    timer = window.setInterval(run, Math.max(intervalMs, 15000));
    window.addEventListener('online', onOnline);

    const channel = changes.length ? supabase.channel('rmd-live-' + channelName) : null;
    if (channel) {
      for (const change of changes) {
        channel.on(
          'postgres_changes',
          change.filter
            ? { event: '*', schema: 'public', table: change.table, filter: change.filter }
            : { event: '*', schema: 'public', table: change.table },
          () => run()
        );
      }
      channel.subscribe();
    }

    return () => {
      disposed = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelName, changes.map(c => c.table + ':' + (c.filter || '')).join('|'), intervalMs]);
}
