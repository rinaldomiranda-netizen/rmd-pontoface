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
  intervalMs = 7000
) {
  const refreshRef = React.useRef(refresh);

  React.useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  React.useEffect(() => {
    let disposed = false;
    let timer: number | null = null;

    const run = () => {
      if (disposed || document.visibilityState === 'hidden' || !navigator.onLine) return;
      void refreshRef.current();
    };

    const onFocus = () => run();
    const onOnline = () => run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    run();
    timer = window.setInterval(run, intervalMs);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

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
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelName, changes.map(c => c.table + ':' + (c.filter || '')).join('|'), intervalMs]);
}
