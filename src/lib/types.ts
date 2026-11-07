export type AuState = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';
export type Owner = 'you' | 'partner' | 'joint';
export type Structure = 'personal' | 'joint' | 'trust' | 'company' | 'smsf';

export interface Person {
  name: string;
  age: number | null;
  salary: number | null; // gross annual
  employment: 'payg' | 'self' | 'not-working';
  superBalance: number | null;
}

export interface Household {
  state: AuState;
  hasPartner: boolean;
  you: Person;
  partner: Person;
  dependants: number[]; // ages
  otherIncome: number | null; // annual, gross
}

export interface Debt {
  id: string;
  kind: 'car' | 'personal' | 'hecs' | 'credit-card' | 'other';
  label: string;
  balance: number | null;
  monthlyRepayment: number | null;
  limit: number | null; // credit cards
  owner?: 'you' | 'partner'; // HECS
  voluntaryMonthly?: number | null; // HECS extra repayments
}

export interface Loan {
  id: string;
  lender: string;
  balance: number | null;
  rate: number | null; // % p.a.
  type: 'io' | 'pi';
  yearsLeft: number | null;
  offset: number | null;
}

export interface ValuationEntry {
  id: string;
  source: 'realestate.com.au' | 'Domain' | 'RP Data' | 'Microburbs' | 'Bank valuation' | 'My estimate';
  value: number;
  date: string; // ISO
}

export interface Property {
  id: string;
  address: string;
  suburb: string;
  state: AuState;
  postcode: string;
  use: 'home' | 'investment';
  kind: 'house' | 'unit' | 'townhouse' | 'land';
  structure: Structure;
  purchasePrice: number | null;
  purchaseDate: string; // yyyy-mm
  valuations: ValuationEntry[];
  growthRate: number; // % p.a. assumption
  loans: Loan[];
  weeklyRent: number | null;
  vacancyWeeks: number;
  managementPct: number;
  annualCosts: number | null; // rates, insurance, strata, maintenance
  bedrooms: number | null;
  yearBuilt: number | null;
}

export interface Holding {
  id: string;
  code: string;
  exchange: 'ASX' | 'NASDAQ' | 'NYSE' | 'CRYPTO';
  name: string;
  units: number;
  avgCost: number; // per unit
  firstBought: string;
  kind: 'share' | 'etf' | 'crypto' | 'fund';
}

export interface LifeEvent { id: string; label: string; year: number; amount: number }

export interface Goals {
  retirementAge: number;
  passiveIncome: number; // today's dollars p.a.
  targetProperties: number;
  risk: number; // 1-5
  events: LifeEvent[];
}

export interface Finances {
  housing: 'own' | 'rent' | 'other';
  rentMonthly: number | null;
  mortgageMonthly: number | null;
  mortgageSharePct: number; // share of the home loan repayments this household pays
  livingMode: 'total' | 'breakdown';
  livingBreakdown: Record<string, number | null>;
  livingMonthly: number | null;
  cash: number | null;
  offsetIsCash: boolean;
  buffer: number | null;
  debts: Debt[];
}

export interface Assumptions {
  lvr: number; // usable equity LVR %
  shareReturn: number;
  superReturn: number;
  inflation: number;
  rentGrowth: number;
  newPurchasePrice: number;
  newPurchaseYield: number;
  newLoanRate: number;
  serviceBuffer: number;
}

export interface Profile {
  version: 1;
  mode: 'simple' | 'thorough';
  onboardingStep: number;
  onboarded: boolean;
  household: Household;
  finances: Finances;
  properties: Property[];
  holdings: Holding[];
  goals: Goals;
  assumptions: Assumptions;
  updatedAt: string;
}

export interface Session { userId: string; email: string; name: string; demo?: boolean; sandbox?: boolean }
