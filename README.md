# WealthWise

A property portfolio and personal wealth planner for Australian investors. People answer an adviser-style questionnaire, and WealthWise values their portfolio, tracks their shares with delayed prices, projects their wealth to retirement and shows when their equity could fund the next purchase.

Built with Claude as an AI app-building portfolio piece.

## Features
- Sign-up and an 8-step fact-find (Simple or Thorough), with a live balance sheet that builds as you answer
- CSV import from any broker: match the columns, buys and sells are combined into current holdings
- Property cards with multi-source valuations (realestate.com.au, Domain, RP Data, Microburbs), equity, usable equity and cash flow
- Projection engine: wealth over time, purchase timeline funded from equity, borrowing capacity with a 3% buffer, rate stress tests
- Wise: rule-based observations from the user's own numbers, framed as general information
- Property Pulse and Equity Spot market briefings (sample content in this version)
- Light and dark mode, responsive down to mobile

## Stack
- React, TypeScript, Vite, Tailwind, Recharts
- Cloudflare Workers (API + static assets) and D1 (SQLite) for users, sessions and profiles
- PBKDF2 password hashing, HttpOnly session cookies storing only a hashed token
- Delayed share prices cached in D1 to stay within free limits

## Run locally
```
npm install
npm run cf:dev        # builds the app and runs the Worker with a local D1 database
npm run build:preview # browser-only build with demo prices, no server needed
```

## Deploy
Set `database_id` in `wrangler.jsonc` to your D1 database, then `npm run deploy`, or connect the repo to Cloudflare Workers Builds.
