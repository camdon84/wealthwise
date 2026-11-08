import { createContext, useContext } from 'react';
import { create } from 'zustand';
import { useApp } from './store';
import type { Forecast, PlanSnapshot, Profile } from './types';

/** The plan pages edit either the live plan or a forecast draft; these hooks hand them whichever is active. */
export type PlanCtx = { profile: Profile; update: (fn: (p: Profile) => void) => void; mode: 'live' | 'forecast'; locked: boolean };
const Ctx = createContext<PlanCtx | null>(null);
export const PlanProvider = Ctx.Provider;
export function usePlanProfile(): Profile { const c = useContext(Ctx); const live = useApp((s) => s.profile)!; return c ? c.profile : live; }
export function usePlanUpdate() { const c = useContext(Ctx); const u = useApp((s) => s.update); return c ? c.update : u; }
export function usePlanMode() { return useContext(Ctx)?.mode ?? 'live'; }

/** Forecast draft: a private copy of the profile to play with. Nothing here touches the live plan until it's made live. */
export const useForecast = create<{
  mode: 'live' | 'forecast'; draft: Profile | null; name: string; sourceId: string | null;
  set(v: Partial<{ mode: 'live' | 'forecast'; draft: Profile | null; name: string; sourceId: string | null }>): void;
  edit(fn: (p: Profile) => void): void;
}>((set, get) => ({
  mode: 'live', draft: null, name: '', sourceId: null,
  set: (v) => set(v),
  edit: (fn) => { const d = get().draft; if (!d) return; const next: Profile = structuredClone(d); fn(next); set({ draft: next }); },
}));

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** The parts of a profile that make up a plan (what the Plan Wise tabs edit). */
export function snapshot(p: Profile): PlanSnapshot {
  return clone({
    goals: p.goals, assumptions: p.assumptions, plannedPurchases: p.plannedPurchases ?? [], liquidations: p.liquidations ?? [], gifts: p.gifts ?? [],
    propertyPlans: Object.fromEntries(p.properties.map((pr) => [pr.id, { planIo5: pr.planIo5, planPayOff: pr.planPayOff }])),
  });
}

export function applySnapshot(p: Profile, s: PlanSnapshot) {
  const c = clone(s);
  p.goals = c.goals; p.assumptions = c.assumptions; p.plannedPurchases = c.plannedPurchases; p.liquidations = c.liquidations; p.gifts = c.gifts;
  for (const pr of p.properties) { const pp = c.propertyPlans[pr.id]; if (pp) { pr.planIo5 = pp.planIo5; pr.planPayOff = pp.planPayOff; } }
}

export function newForecast(name: string, p: Profile, kind: Forecast['kind'] = 'forecast'): Forecast {
  return { id: Math.random().toString(36).slice(2, 10), name, kind, savedAt: new Date().toISOString(), plan: snapshot(p) };
}
