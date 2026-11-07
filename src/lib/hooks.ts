import { useEffect, useMemo, useState } from 'react';
import { useApp } from './store';
import { fetchQuotes } from './prices';
import type { Quotes } from './calc';

export function useQuotes() {
  const holdings = useApp((s) => s.profile?.holdings ?? []);
  const key = holdings.map((h) => `${h.exchange}:${h.code}`).sort().join(',');
  const [quotes, setQuotes] = useState<Quotes>({});
  const [asOf, setAsOf] = useState<Date | null>(null);
  useEffect(() => {
    let live = true;
    const run = () => fetchQuotes(holdings).then((q) => { if (live) { setQuotes(q); setAsOf(new Date()); } }).catch(() => {});
    run();
    const t = setInterval(run, 60000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { quotes, asOf };
}

export function useHashRoute(defaultRoute: string) {
  const read = () => (location.hash.replace('#', '') || defaultRoute);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (r: string) => { if (location.hash !== `#${r}`) location.hash = r; setRoute(r); window.scrollTo({ top: 0 }); };
  return useMemo(() => ({ route, go }), [route]);
}
