export type AuState = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'ACT' | 'NT';
export type Owner = 'you' | 'partner' | 'joint';
export type Structure = 'personal' | 'joint' | 'trust' | 'company' | 'smsf';

export interface Person {
  name: string;
  lastName?: string;
  age: number | null;
  salary: number | null; // gross annual
  employment: 'payg' | 'self' | 'not-working';
  superBalance: number | null;
  superReturn?: number | null; // last financial year's net return, %
  jobTitle?: string;
  salaryAsOf?: string; // yyyy-mm-dd the salary was last confirmed
  superAsOf?: string; // yyyy-mm-dd the super balance was last confirmed
  salaryGrowth?: number | null; // expected pay rise each year, %
  promotions?: { id: string; year: number; salary: number }[]; // new salary (before tax) from that year
}

export interface Dependant {
  id: string;
  name: string;
  age: number | null;
  schoolStartYear?: number | null; // when school fees start
  schoolDone?: boolean; // already finished school: no fees
  monthlyCosts: number | null; // food, clothing, phone etc.
  childcareMonthly: number | null;
  activitiesMonthly: number | null;
  schoolFeesYearly: number | null;
  supportUntil: number; // age costs stop
}

export interface Household {
  state: AuState;
  hasPartner: boolean;
  you: Person;
  partner: Person;
  dependants: number[]; // ages (kept in step with dependantsDetail)
  dependantsDetail?: Dependant[];
  otherIncome: number | null; // annual, gross
}

export interface Debt {
  id: string;
  kind: 'car' | 'personal' | 'hecs' | 'credit-card' | 'other';
  label: string;
  balance: number | null;
  monthlyRepayment: number | null;
  limit: number | null; // credit cards
  rate?: number | null; // % p.a. for cards and loans
  owner?: 'you' | 'partner'; // HECS
  voluntaryMonthly?: number | null; // HECS extra repayments
}

export interface Loan {
  id: string;
  lender: string;
  balance: number | null;
  rate: number | null; // % p.a.
  type: 'io' | 'pi';
  rateType?: 'variable' | 'fixed';
  fixedUntil?: string; // yyyy-mm
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
  oldNegGearing?: boolean; // bought before 7:30pm AEST 12 May 2026: grandfathered under the old negative gearing rules
  planIo5?: boolean; // plan: interest-only for the next 5 years
  photo?: string | null; // the user's own photo (small JPEG data URL); replaces the aerial view
  renoAdds?: { id: string; amount: number; date: string }[]; // value added by finished renovations (see propertyValuation)
  geo?: { lat: number; lon: number; street?: boolean } | null; // looked up from the address for the aerial photo; null = not found
  planPayOff?: boolean; // plan: paid off by retirement (otherwise an investment is sold at retirement, a home loan is cleared from super)
}

export interface Holding {
  id: string;
  code: string;
  exchange: 'ASX' | 'NASDAQ' | 'NYSE' | 'CRYPTO';
  name: string;
  units: number;
  avgCost: number; // per unit, in `currency`
  currency?: string; // what the buy price was paid in; AUD if missing
  firstBought: string;
  kind: 'share' | 'etf' | 'crypto' | 'fund';
}

export interface LifeEvent { id: string; label: string; year: number; amount: number }

export interface Goals {
  retirementAge: number;
  lifeExpectancy?: number; // age the plan runs to
  sharesTarget?: number | null; // share portfolio wanted at retirement, today's money
  shareMonthly?: number | null; // planned monthly share investment; null = whatever reaches the target
  shareStartAfter?: number | null; // don't start the share plan until this many planned purchases are bought
  passiveIncome: number; // today's dollars p.a.
  plannedChildren?: { id: string; year: number }[]; // children you plan to have: average costs from birth to 18
  retireCash?: number | null; // cash to keep on hand in retirement, today's money (replaces the emergency buffer once retired)
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
  cash: number | null; // total cash savings
  cashOffset?: number | null; // part of the total sitting in offset accounts
  cashSavings?: number | null; // part of the total in cash and normal savings
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
  plannedPurchases?: PlannedPurchase[];
  rateWatch?: { cashRate: number; date: string }; // RBA cash rate the variable loan rates were last confirmed against
  firstLookSeen?: boolean;
  documents?: DocRecord[];
  eofy?: { fy: string; done: string[] }; // end-of-financial-year update checklist
  renovations?: Renovation[];
  liquidations?: Liquidation[];
  forecasts?: Forecast[]; // saved forecasts and previous live plans
  insightState?: InsightState;
  planIdeas?: { dismissed?: Record<string, number>; refreshedAt?: number; ai?: { id: string; title: string; body: string; at: number }[] }; // "Have you thought about these options?" on the plan
  cpiBase?: { period: string; index: number }; // CPI quarter the locked plan's figures are in (set when the plan is locked)
  cpiLog?: { period: string; annual: number; at: string; updated: string[]; kept: string[] }[]; // inflation updates offered // Wise Insights: what's been seen, dismissed and refreshed
  planLocked?: boolean;
  gifts?: Gift[];
  cryptoGrowth?: number | null;
  cryptoInPlan?: boolean; // opted in: crypto grows at cryptoGrowth in the plan // the user's own guess, only used on the Crypto page

  updatedAt: string;
}

export interface Session { userId: string; email: string; name: string; demo?: boolean; sandbox?: boolean }

export type DocKind = 'valuation' | 'super' | 'loan' | 'rental' | 'payslip' | 'trades' | 'other';
export interface DocRecord { id: string; name: string; kind: DocKind; uploadedAt: string; summary: string; applied: string[] }

export interface PlannedPurchase {
  id: string; label: string; price: number; yieldPct: number; rate: number; growth: number;
  notBefore?: number | null; // legacy, no longer used
  buyBy?: number | null; // buy before this year; null = as soon as possible
  ioFirst5?: boolean; // interest-only for the first 5 years, then principal and interest
  payOff?: boolean; // paid off by retirement; otherwise sold at retirement
  depositPct?: number; costsPct?: number; holdingPct?: number; mgmtPct?: number;
  newBuild?: boolean; // a new build: keeps negative gearing under the 2026 rules
  firstHome?: boolean; // bought as your first home to live in
  fhb?: { deposit5?: boolean; grant?: boolean; grantAmount?: number | null; noStampDuty?: boolean };
}

/** A renovation saved from the Renovator. Planned ones are modelled in the projection in their year; done ones live in the property's valuations. */
export interface Renovation {
  id: string; propertyId: string; year: number; label: string; items: string[];
  cost: number; uplift: number; rentPerWeek: number; // today's money
  done?: boolean;
}

/** A planned sale of part of the crypto or share portfolio, to free up cash. */
/**
 * A planned sale. Shares and crypto: amount is the dollars to sell in that year (older events used pct of the holding).
 * Property: sells the whole property; salePrice (that year's dollars) defaults to its projected value, sellCostPct to 2.5%.
 */
export interface Liquidation {
  id: string; year: number; asset: 'crypto' | 'shares' | 'property';
  pct?: number; amount?: number | null;
  propertyId?: string; salePrice?: number | null; sellCostPct?: number | null;
  note?: string;
}
/** Money expected from family: a gift or an inheritance. Amount is in the dollars of that year. */
export interface Gift { id: string; year: number; amount: number; from: string; kind: 'gift' | 'inheritance'; note?: string; saved?: boolean }

export interface PlanSnapshot {
  goals: Goals; assumptions: Assumptions; plannedPurchases: PlannedPurchase[]; liquidations: Liquidation[]; gifts: Gift[];
  propertyPlans: Record<string, { planIo5?: boolean; planPayOff?: boolean }>;
}
/** A saved forecast, or a previous live plan kept when a forecast replaced it. */
export interface Forecast { id: string; name: string; kind: 'forecast' | 'previous'; savedAt: string; plan: PlanSnapshot }

/** Wise Insights bookkeeping. Keys are insight id + title, so a changed insight counts as new. Times are ms since epoch. */
export interface InsightState {
  seen?: Record<string, number>; // first time each insight appeared
  back?: Record<string, number>; // pushed to the back of the queue by "Give me Wise Insights"
  dismissed?: Record<string, number>;
  refreshedAt?: number; // last "Give me Wise Insights"
  spendBase?: number | null; // retirement income when we first suggested they could afford more
  spendSnoozeUntil?: number; // they changed it after that suggestion: don't suggest again until then
}
