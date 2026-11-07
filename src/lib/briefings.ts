import type { Profile } from './types';

/**
 * Property Pulse and Equity Spot. Once hosted, a Cloudflare scheduled job collects the last
 * 7–30 days of headlines, summarises them with AI and stores a briefing with source links.
 * The preview has no server, so it shows sample briefings that are clearly labelled.
 */
export interface BriefItem { id: string; scope: string; headline: string; body: string; tone: 'up' | 'down' | 'flat'; stat?: string; statLabel?: string }
export interface Briefing { kind: 'property' | 'equity'; sample: boolean; asOf: string; items: BriefItem[] }

export function propertyPulse(p: Profile): Briefing {
  const suburbs = [...new Map(p.properties.map((pr) => [pr.suburb, pr])).values()].filter((pr) => pr.suburb);
  const local: BriefItem[] = suburbs.slice(0, 3).map((pr, i) => ({
    id: `sub-${i}`,
    scope: `${pr.suburb} ${pr.state}`,
    headline: [
      `Listings in ${pr.suburb} stayed tight this month`,
      `${pr.suburb} rents keep edging up`,
      `Buyer interest in ${pr.suburb} holding steady`,
    ][i % 3],
    body: [
      'New listings ran below the five-year average for this time of year, and well-presented homes sold in under a month. Sellers still hold the upper hand.',
      'Advertised rents rose again over the quarter as vacancies stayed low. Investors are getting stronger yields on newly signed leases.',
      'Open-home numbers and enquiry per listing were steady. Agents report more first-home buyers alongside investors.',
    ][i % 3],
    tone: i === 2 ? 'flat' : 'up',
    stat: ['−8%', '+1.9%', '24 days'][i % 3],
    statLabel: ['new listings vs last year', 'rents, last quarter', 'median days on market'][i % 3],
  }));
  return {
    kind: 'property', sample: true, asOf: new Date().toISOString(),
    items: [
      { id: 'nat-1', scope: 'National', headline: 'Home values rose again this month', body: 'Growth was led by the mid-sized capitals and regional markets, while the most expensive markets were flatter. Affordability is the main brake on further gains.', tone: 'up', stat: '+0.6%', statLabel: 'national values, month' },
      { id: 'nat-2', scope: 'National', headline: 'Auction clearance rates eased into spring', body: 'More stock came to market and clearance rates slipped from winter highs, giving buyers slightly more choice and time.', tone: 'down', stat: '64%', statLabel: 'preliminary clearance rate' },
      { id: 'nat-3', scope: 'Lending', headline: 'Investor lending share keeps climbing', body: 'Investors made up a larger share of new loans than a year ago, which regulators are watching. Serviceability buffers stay at 3 percentage points.', tone: 'up', stat: '38%', statLabel: 'investor share of new loans' },
      ...local,
    ],
  };
}

export function equitySpot(): Briefing {
  return {
    kind: 'equity', sample: true, asOf: new Date().toISOString(),
    items: [
      { id: 'eq-1', scope: 'ASX 200', headline: 'Australian shares finished the week higher', body: 'Banks and miners did most of the lifting. Tech was mixed after a weaker lead from Wall Street mid-week.', tone: 'up', stat: '+1.2%', statLabel: 'ASX 200, week' },
      { id: 'eq-2', scope: 'Rates', headline: 'Markets price a steady RBA at the next meeting', body: 'Bond markets moved to price fewer cuts after stronger-than-expected inflation data. Rate-sensitive sectors like property trusts softened.', tone: 'flat', stat: 'Hold', statLabel: 'market-implied next move' },
      { id: 'eq-3', scope: 'IPOs', headline: 'Two listings on the ASX calendar this month', body: 'A healthcare services group and a renewable energy developer are set to list. IPO activity is picking up from a quiet first half.', tone: 'up', stat: '2', statLabel: 'scheduled listings' },
      { id: 'eq-4', scope: 'Global', headline: 'US tech earnings set the tone', body: 'Big US tech results beat expectations on cloud and AI spending, though guidance was more cautious. The Nasdaq ended the week flat.', tone: 'flat', stat: '0.0%', statLabel: 'Nasdaq 100, week' },
      { id: 'eq-5', scope: 'Movers', headline: 'Lithium names slide as prices fall again', body: 'Lithium producers led the losers after spot prices hit a fresh low on oversupply. Several miners have flagged output cuts.', tone: 'down', stat: '−7%', statLabel: 'sector, week' },
    ],
  };
}
