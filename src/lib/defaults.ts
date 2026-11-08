import type { Assumptions, Debt, Finances, Holding, Loan, Profile, Property } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultAssumptions: Assumptions = {
  lvr: 80,
  shareReturn: 8,
  superReturn: 7,
  inflation: 2.75,
  rentGrowth: 3,
  newPurchasePrice: 650000,
  newPurchaseYield: 5,
  newLoanRate: 6.85,
  serviceBuffer: 3,
};

export const LIVING_CATEGORIES: { key: string; label: string }[] = [
  { key: 'groceries', label: 'Groceries' },
  { key: 'energy', label: 'Electricity and gas' },
  { key: 'water', label: 'Water' },
  { key: 'internet', label: 'Internet and phone' },
  { key: 'subscriptions', label: 'Subscriptions (streaming, apps, gym)' },
  { key: 'petrol', label: 'Petrol and tolls' },
  { key: 'transport', label: 'Public transport' },
  { key: 'carInsurance', label: 'Car insurance' },
  { key: 'carRunning', label: 'Car rego and servicing' },
  { key: 'health', label: 'Health insurance' },
  { key: 'homeInsurance', label: 'Home and contents insurance' },
  { key: 'school', label: 'School fees and childcare' },
  { key: 'kids', label: 'Kids’ activities' },
  { key: 'eatingOut', label: 'Eating out and entertainment' },
  { key: 'clothing', label: 'Clothing and personal care' },
  { key: 'medical', label: 'Medical and pharmacy' },
  { key: 'pets', label: 'Pets' },
  { key: 'other', label: 'Anything else' },
];

const financeDefaults = (): Pick<Finances, 'housing' | 'rentMonthly' | 'mortgageMonthly' | 'mortgageSharePct' | 'livingMode' | 'livingBreakdown'> =>
  ({ housing: 'own', rentMonthly: null, mortgageMonthly: null, mortgageSharePct: 100, livingMode: 'total', livingBreakdown: {} });

/** Fill in fields added after a profile was first saved. */
export function normalize(p: Profile): Profile {
  p.finances = { ...financeDefaults(), ...p.finances };
  p.finances.livingBreakdown ??= {};
  for (const d of p.finances.debts) if (d.rate === undefined && d.kind !== 'hecs') d.rate = DEBT_RATE[d.kind] ?? null;
  for (const pr of p.properties) for (const l of pr.loans) l.rateType ??= 'variable';
  p.mode = 'thorough';
  p.goals.lifeExpectancy ??= 90;
  p.household.dependantsDetail ??= p.household.dependants.map((age, i) => emptyDependant(i, age));
  // Offset money now belongs to a loan: move an old unassigned offset amount onto the first loan (home first)
  { const loans = [...p.properties].sort((a, b) => (a.use === 'home' ? -1 : 0) - (b.use === 'home' ? -1 : 0)).flatMap((pr) => pr.loans);
    const assigned = loans.reduce((t, l) => t + (l.offset ?? 0), 0);
    if (loans.length && !assigned && (p.finances.cashOffset ?? 0) > 0) loans[0].offset = p.finances.cashOffset!;
    // Cash at the bank is now entered on its own (excluding offsets); work it out from an old total once
    const inOffset = loans.reduce((t, l) => t + (l.offset ?? 0), 0);
    if (p.finances.cashSavings == null && p.finances.cash != null) p.finances.cashSavings = Math.max(0, p.finances.cash - inOffset);
    p.finances.cashOffset = inOffset || null;
    if (p.finances.cashSavings != null || inOffset) p.finances.cash = (p.finances.cashSavings ?? 0) + inOffset; }
  p.plannedPurchases ??= [];
  for (const pp of p.plannedPurchases) { pp.ioFirst5 ??= true; pp.payOff ??= false; pp.depositPct ??= 20; pp.costsPct ??= 5; pp.holdingPct ??= 1.2; pp.mgmtPct ??= 7; if (pp.buyBy === undefined) pp.buyBy = null; }
  for (const pr of p.properties) { pr.planIo5 ??= pr.loans.length > 0 && pr.loans.every((l) => l.type === 'io'); pr.planPayOff ??= pr.use === 'home'; }
  return p;
}

export const emptyDependant = (i: number, age: number | null = null): import('./types').Dependant =>
  ({ id: uid(), name: `Dependant ${i + 1}`, age, monthlyCosts: null, childcareMonthly: null, activitiesMonthly: null, schoolFeesYearly: null, supportUntil: 18 });

export const plannedPurchase = (n: number, a: Assumptions) =>
  ({ id: uid(), label: `Property ${n}`, price: a.newPurchasePrice, yieldPct: a.newPurchaseYield, rate: a.newLoanRate, growth: 5, buyBy: null, ioFirst5: true, payOff: false, depositPct: 20, costsPct: 5, holdingPct: 1.2, mgmtPct: 7 });

export const emptyLoan = (): Loan => ({ id: uid(), lender: '', balance: null, rate: null, type: 'pi', rateType: 'variable', yearsLeft: 25, offset: null });
export const DEBT_RATE: Record<string, number> = { car: 9.5, personal: 12.5, 'credit-card': 20.99, other: 10 };
export const emptyDebt = (): Debt => ({ id: uid(), kind: 'car', label: '', balance: null, monthlyRepayment: null, limit: null, rate: DEBT_RATE.car });

export const emptyProperty = (): Property => ({
  id: uid(), address: '', suburb: '', state: 'QLD', postcode: '', use: 'investment', kind: 'house', structure: 'personal',
  purchasePrice: null, purchaseDate: '', valuations: [], growthRate: 5, loans: [emptyLoan()], weeklyRent: null,
  vacancyWeeks: 2, managementPct: 7, annualCosts: null, bedrooms: null, yearBuilt: null,
});

export function blankProfile(name: string): Profile {
  return {
    version: 1,
    mode: 'thorough',
    onboardingStep: 0,
    onboarded: false,
    household: {
      state: 'QLD', hasPartner: false, dependants: [], otherIncome: null,
      you: { name, age: null, salary: null, employment: 'payg', superBalance: null },
      partner: { name: '', age: null, salary: null, employment: 'payg', superBalance: null },
    },
    finances: { ...financeDefaults(), livingMonthly: null, cash: null, offsetIsCash: true, buffer: null, debts: [] },
    properties: [],
    holdings: [],
    goals: { retirementAge: 60, lifeExpectancy: 90, passiveIncome: 120000, targetProperties: 4, risk: 3, events: [] },
    assumptions: { ...defaultAssumptions },
    updatedAt: new Date().toISOString(),
  };
}

function futureMonth(m: number) { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 7); }

const h = (code: string, exchange: Holding['exchange'], name: string, units: number, avgCost: number, firstBought: string, kind: Holding['kind']): Holding =>
  ({ id: uid(), code, exchange, name, units, avgCost, firstBought, kind });

export function demoProfile(): Profile {
  const p = blankProfile('Tom');
  p.onboarded = true;
  p.onboardingStep = 7;
  p.mode = 'thorough';
  p.household = {
    state: 'QLD', hasPartner: true, dependants: [4, 7], otherIncome: 6000,
    you: { name: 'Tom', age: 35, salary: 165000, employment: 'payg', superBalance: 118000 },
    partner: { name: 'Ana', age: 33, salary: 98000, employment: 'payg', superBalance: 74000 },
  };
  p.finances = {
    housing: 'own', rentMonthly: null, mortgageMonthly: null, mortgageSharePct: 100, livingMode: 'breakdown',
    livingBreakdown: { groceries: 1400, energy: 260, water: 90, internet: 120, subscriptions: 85, petrol: 420, transport: 60, carInsurance: 140, carRunning: 110, health: 380, homeInsurance: 210, school: 0, kids: 0, eatingOut: 600, clothing: 250, medical: 120, pets: 90, other: 235 },
    livingMonthly: 4570, cash: 53000, cashOffset: 45000, cashSavings: 8000, offsetIsCash: true, buffer: 20000,
    debts: [
      { id: uid(), kind: 'car', label: 'Car loan', balance: 21000, monthlyRepayment: 640, limit: null, rate: 9.49 },
      { id: uid(), kind: 'credit-card', label: 'Credit card', balance: 6400, monthlyRepayment: null, limit: 12000, rate: 20.99 },
      { id: uid(), kind: 'personal', label: 'Personal loan', balance: 9500, monthlyRepayment: 420, limit: null, rate: 13.9 },
      { id: uid(), kind: 'hecs', label: 'HECS / HELP', balance: 18000, monthlyRepayment: null, limit: null, owner: 'partner', voluntaryMonthly: 0 },
    ],
  };

  const today = new Date().toISOString().slice(0, 10);
  const props: Property[] = [
    {
      ...emptyProperty(), address: '14 Kirkland Avenue', suburb: 'Coorparoo', state: 'QLD', postcode: '4151', geo: { lat: -27.4996757, lon: 153.0525236 }, use: 'home', kind: 'house', structure: 'joint',
      purchasePrice: 720000, purchaseDate: '2019-03', growthRate: 6, bedrooms: 4, yearBuilt: 1962, weeklyRent: null, annualCosts: 7200,
      valuations: [
        { id: uid(), source: 'realestate.com.au', value: 1150000, date: today },
        { id: uid(), source: 'Domain', value: 1210000, date: today },
        { id: uid(), source: 'RP Data', value: 1175000, date: today },
      ],
      loans: [{ id: uid(), lender: 'CBA', balance: 470000, rate: 6.09, type: 'pi', yearsLeft: 23, offset: 45000 }],
    },
    {
      ...emptyProperty(), address: '8/22 Esplanade', suburb: 'Bargara', state: 'QLD', postcode: '4670', geo: { lat: -24.8122745, lon: 152.4624863 }, use: 'investment', kind: 'unit', structure: 'personal',
      purchasePrice: 245000, purchaseDate: '2021-06', growthRate: 5, bedrooms: 2, yearBuilt: 2003, weeklyRent: 480, annualCosts: 6900,
      valuations: [
        { id: uid(), source: 'realestate.com.au', value: 395000, date: today },
        { id: uid(), source: 'Domain', value: 410000, date: today },
      ],
      loans: [{ id: uid(), lender: 'Macquarie', balance: 196000, rate: 6.29, type: 'io', yearsLeft: 26, offset: 0 }],
    },
    {
      ...emptyProperty(), address: '31 Ashgrove Road', suburb: 'Harlaxton', state: 'QLD', postcode: '4350', geo: null, use: 'investment', kind: 'house', structure: 'personal',
      purchasePrice: 510000, purchaseDate: '2023-02', growthRate: 5.5, bedrooms: 3, yearBuilt: 2014, weeklyRent: 560, annualCosts: 5400,
      valuations: [
        { id: uid(), source: 'realestate.com.au', value: 630000, date: today },
        { id: uid(), source: 'RP Data', value: 652000, date: today },
      ],
      loans: [{ id: uid(), lender: 'ING', balance: 408000, rate: 5.89, type: 'io', rateType: 'fixed', fixedUntil: futureMonth(4), yearsLeft: 27, offset: 0 }],
    },
  ];
  p.properties = props;
  p.holdings = [
    h('VAS', 'ASX', 'Vanguard Australian Shares ETF', 420, 88.5, '2020-08-14', 'etf'),
    h('VGS', 'ASX', 'Vanguard MSCI Intl Shares ETF', 260, 104.2, '2021-02-03', 'etf'),
    h('CBA', 'ASX', 'Commonwealth Bank', 60, 98.4, '2020-11-20', 'share'),
    h('BHP', 'ASX', 'BHP Group', 300, 41.1, '2022-05-11', 'share'),
    h('CSL', 'ASX', 'CSL Limited', 25, 262.0, '2022-09-01', 'share'),
    h('NDQ', 'ASX', 'Betashares Nasdaq 100 ETF', 150, 38.7, '2023-01-17', 'etf'),
    h('BTC', 'CRYPTO', 'Bitcoin', 0.12, 61000, '2023-03-02', 'crypto'),
  ];
  p.household.dependantsDetail = [
    { id: uid(), name: 'Mia', age: 7, monthlyCosts: 450, childcareMonthly: 0, activitiesMonthly: 180, schoolFeesYearly: 4200, supportUntil: 18 },
    { id: uid(), name: 'Leo', age: 4, monthlyCosts: 400, childcareMonthly: 1100, activitiesMonthly: 90, schoolFeesYearly: 0, supportUntil: 18 },
  ];
  p.household.you.jobTitle = 'Operations manager';
  p.household.partner.jobTitle = 'Physiotherapist';
  p.household.you.salaryAsOf = p.household.partner.salaryAsOf = '2026-07-01';
  p.household.you.superAsOf = p.household.partner.superAsOf = '2026-06-30';
  p.plannedPurchases = [
    { id: uid(), label: 'Property 4', price: 620000, yieldPct: 5.2, rate: 6.6, growth: 5, notBefore: null },
    { id: uid(), label: 'Property 5', price: 700000, yieldPct: 4.8, rate: 6.6, growth: 5, notBefore: null },
  ];
  p.rateWatch = { cashRate: 4.6, date: '2026-09-30' }; // demo: last confirmed before the RBA's November rise
  p.firstLookSeen = true;
  p.goals = {
    retirementAge: 58, lifeExpectancy: 90, sharesTarget: 1500000, passiveIncome: 130000, targetProperties: 5, risk: 4,
    events: [{ id: uid(), label: 'Kitchen renovation', year: new Date().getFullYear() + 1, amount: 45000 }],
  };
  return p;
}

export const SAMPLE_CSV = `Trade Date,Code,Market,Buy/Sell,Quantity,Price,Brokerage
2021-03-02,VAS,ASX,Buy,120,89.10,9.50
2021-09-15,VAS,ASX,Buy,80,95.40,9.50
2022-02-08,A200,ASX,Buy,200,121.30,9.50
2022-06-21,WES,ASX,Buy,45,48.20,9.50
2023-04-04,NDQ,ASX,Buy,150,30.85,9.50
2023-11-29,WES,ASX,Sell,15,55.70,9.50
2024-07-10,MQG,ASX,Buy,12,192.00,9.50
2025-01-22,AAPL,NASDAQ,Buy,10,358.00,0`;
