/**
 * Two example households for the portfolio showcase, built with the app's own profile code so they load like
 * real accounts. Fictional people and made-up addresses (real streets, invented numbers); emails use example.com.
 *
 * Print them as JSON: npx esbuild scripts/demo-users.ts --bundle --platform=node --define:import.meta.env={} | node
 * Accounts are added to D1 with random passwords (nobody signs in as them; admins open them with "View as user").
 */
import { blankProfile, emptyProperty, normalize, uid } from '../src/lib/defaults';
import type { Holding, Profile } from '../src/lib/types';

const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();
const holding = (code: string, name: string, units: number, avgCost: number, firstBought: string, kind: Holding['kind']): Holding =>
  ({ id: uid(), code, exchange: 'ASX', name, units, avgCost, firstBought, kind });

/** Michelle Donley: 70, still working, stopping at 75. Two investment properties around Bundaberg, $500k super, about $100k in shares. */
export function michelle(): Profile {
  const p = blankProfile('Michelle');
  p.onboarded = true; p.onboardingStep = 7; p.firstLookSeen = true;
  p.household = {
    state: 'QLD', hasPartner: false, dependants: [], dependantsDetail: [], otherIncome: 2500,
    you: { name: 'Michelle', lastName: 'Donley', age: 70, salary: 82000, employment: 'payg', superBalance: 500000, jobTitle: 'Practice manager', salaryGrowth: 2.5, salaryAsOf: '2026-07-01', superAsOf: '2026-06-30' },
    partner: { name: '', age: null, salary: null, employment: 'payg', superBalance: null },
  };
  p.finances = {
    ...p.finances, housing: 'rent', rentMonthly: 1950, livingMode: 'total', livingMonthly: 3400,
    cash: 85000, cashSavings: 85000, cashOffset: null, offsetIsCash: true, buffer: 30000,
    debts: [{ id: uid(), kind: 'credit-card', label: 'Credit card', balance: 0, monthlyRepayment: null, limit: 6000, rate: 20.99 }],
  };
  p.properties = [
    {
      ...emptyProperty(), address: '5/18 Miller Street', suburb: 'Bargara', state: 'QLD', postcode: '4670', use: 'investment', kind: 'unit', structure: 'personal',
      purchasePrice: 265000, purchaseDate: '2012-05', growthRate: 5, bedrooms: 2, yearBuilt: 1998, weeklyRent: 520, annualCosts: 6500, vacancyWeeks: 2, managementPct: 7,
      valuations: [{ id: uid(), source: 'realestate.com.au', value: 470000, date: today }, { id: uid(), source: 'Domain', value: 490000, date: today }],
      loans: [{ id: uid(), lender: 'Suncorp', balance: 62000, rate: 6.24, type: 'pi', rateType: 'variable', yearsLeft: 8, offset: 0 }],
      oldNegGearing: true, planPayOff: true, planIo5: false,
    },
    {
      ...emptyProperty(), address: '27 Crofton Street', suburb: 'Bundaberg West', state: 'QLD', postcode: '4670', use: 'investment', kind: 'house', structure: 'personal',
      purchasePrice: 245000, purchaseDate: '2009-08', growthRate: 5.5, bedrooms: 3, yearBuilt: 1975, weeklyRent: 560, annualCosts: 5200, vacancyWeeks: 2, managementPct: 7,
      valuations: [{ id: uid(), source: 'realestate.com.au', value: 510000, date: today }, { id: uid(), source: 'RP Data', value: 535000, date: today }],
      loans: [], oldNegGearing: true, planPayOff: true, planIo5: false,
    },
  ];
  p.holdings = [
    holding('VAS', 'Vanguard Australian Shares ETF', 420, 79.4, '2016-03-14', 'etf'),
    holding('VHY', 'Vanguard Australian Shares High Yield ETF', 400, 58.2, '2017-08-02', 'etf'),
    holding('CBA', 'Commonwealth Bank', 150, 76.5, '2015-11-20', 'share'),
  ];
  p.goals = {
    retirementAge: 75, lifeExpectancy: 92, passiveIncome: 70000, targetProperties: 2, risk: 2, wealthFocus: 'balanced',
    sharesTarget: null, shareMonthly: 500, retireCash: 50000, events: [{ id: uid(), label: 'New car', year: year + 2, amount: 35000 }],
  };
  p.plannedPurchases = [];
  p.rateWatch = { cashRate: 4.85, date: today };
  return normalize(p);
}

/** Melissa Donley: 40, married to Costa, buying a first home (owner-occupier, about $850k) in the next 12 months, two children planned. */
export function melissa(): Profile {
  const p = blankProfile('Melissa');
  p.onboarded = true; p.onboardingStep = 7; p.firstLookSeen = true;
  p.household = {
    state: 'QLD', hasPartner: true, dependants: [], dependantsDetail: [], otherIncome: null,
    you: { name: 'Melissa', lastName: 'Donley', age: 40, salary: 112000, employment: 'payg', superBalance: 165000, jobTitle: 'Primary school teacher', salaryGrowth: 3, salaryAsOf: '2026-07-01', superAsOf: '2026-06-30' },
    partner: { name: 'Costa', age: 42, salary: 118000, employment: 'payg', superBalance: 190000, jobTitle: 'Electrician', salaryGrowth: 3, salaryAsOf: '2026-07-01', superAsOf: '2026-06-30' },
  };
  p.finances = {
    ...p.finances, housing: 'rent', rentMonthly: 2600, livingMode: 'breakdown',
    livingBreakdown: { groceries: 1200, energy: 220, water: 0, internet: 110, subscriptions: 75, petrol: 380, transport: 80, carInsurance: 130, carRunning: 100, health: 340, homeInsurance: 45, school: 0, kids: 0, eatingOut: 550, clothing: 240, medical: 90, pets: 60, other: 180 },
    livingMonthly: 3800, cash: 95000, cashSavings: 95000, cashOffset: null, offsetIsCash: true, buffer: 15000,
    debts: [
      { id: uid(), kind: 'car', label: 'Car loan', balance: 18000, monthlyRepayment: 520, limit: null, rate: 8.9 },
      { id: uid(), kind: 'credit-card', label: 'Credit card', balance: 0, monthlyRepayment: null, limit: 8000, rate: 20.99 },
    ],
  };
  p.properties = [];
  p.holdings = [holding('VDHG', 'Vanguard Diversified High Growth ETF', 300, 58.6, '2021-09-06', 'etf')];
  p.goals = {
    retirementAge: 62, lifeExpectancy: 92, passiveIncome: 95000, targetProperties: 1, risk: 3, wealthFocus: 'property',
    sharesTarget: null, shareMonthly: 300, shareStartAfter: 1, retireCash: 50000, events: [],
    plannedChildren: [{ id: uid(), year: year + 2 }, { id: uid(), year: year + 4 }],
  };
  // Established home in Brisbane: the 5% Deposit Scheme applies (Brisbane price cap $1m from 1 October 2025).
  // No First Home Owner Grant (new homes only) and no first home stamp duty concession (it phases out at $800k for established homes).
  // Costs: about $24,100 transfer duty at the QLD home concession rate on $850k (QRO), plus legals and inspections: about 3.2%.
  p.plannedPurchases = [{
    id: uid(), label: 'Property 1', price: 850000, yieldPct: 0, rate: 6.49, growth: 5, buyBy: year + 2,
    ioFirst5: false, payOff: true, depositPct: 5, costsPct: 3.2, holdingPct: 1.2, mgmtPct: 0,
    firstHome: true, fhb: { deposit5: true, grant: false, noStampDuty: false },
  }];
  return normalize(p);
}

console.log(JSON.stringify({ michelle: michelle(), melissa: melissa() }));
