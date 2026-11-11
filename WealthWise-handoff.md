# WealthWise: handoff for a new chat

Read all of this before you change anything. It covers what WealthWise is, how it's built and deployed, the rules I've set, and what's still open.

---

## 1. What WealthWise is

WealthWise is a property and wealth planner for Australians. It's loosely modelled on Gameplans. You enter what you own, what you earn and what you want, and it plans when to buy each property, how much to put into shares, how much cash to keep and when you can retire. It also shows the plan on charts and suggests ways to improve it, using AI ideas that the app can actually model.

It's a **portfolio showcase**, so it has to look polished and feel easy to use. It runs free on Cloudflare.

- **Who I am:** Cameron Donley, a Brisbane buyer's agent.
- **Who the app is for:** everyday Australian property investors and home owners, not finance experts.
- **What matters most:** looks, plain-English wording and simple UX, then accuracy.
- **Cost:** free and simple options only (Cloudflare free tier and Cloudflare's free Workers AI).
- **Status:** Wise is general information, not financial advice. Keep it that way in all wording.

---

## 2. How to work with me

- **Plain, direct language.** No jargon and nothing "too technical". If a screen needs a paragraph to explain itself, simplify the screen.
- **Australian English:** realise, colour, organise, superannuation, offset account.
- **Proofread every piece of copy you write:** grammar, punctuation and consistency. I've noticed sloppy wording, so check it twice.
- **Use my exact wording** when I give you text. Don't "improve" it unless I ask.
- **Ask when a request is ambiguous** rather than guessing. One example from the old chat: I said "you put the loan-paid-off dot on the cash line". I meant that was correct, but it was read as a complaint and moved twice.
- **Check your work visually** with a screenshot after every UI change (see section 5) before saying it's done. Check phone width (390px) as well as desktop.
- **Keep replies short:** what changed, then the link. No long recaps.

### Every change must work across the whole app
This is one of the most important things.

- When I ask for a change, follow it through everything it affects:
  - the calculations (`calc.ts`) and the projections
  - the charts
  - Plan Check, Wise Insights and the ideas
  - Wise Actions
  - the inflation update
  - onboarding, the demo data and the wording
- Find what's affected by searching the code. Don't guess.
- If a change needs the maths or a calculation method to change, change it. Don't just change the screen.
- In your reply, list in a line or two what else you updated and why.
- Don't change things the request doesn't touch (unrelated layout, wording or features). If you spot a separate problem, tell me instead.

### Real-world numbers and methods
- Base every calculation on current, real Australian rules and data. Look them up first. Don't rely on memory.
- Use sources such as:
  - the RBA, ABS, ATO, APRA, Treasury and Budget papers
  - state revenue offices (stamp duty, land tax)
  - Services Australia
  - super funds
  - the big banks' published calculators and lending policies
- Follow how lenders and government actually work things out:
  - borrowing capacity (the APRA serviceability buffer, the HEM living expense benchmark, rental income shading, credit card limits counted as debt)
  - stamp duty and first home buyer concessions
  - CGT
  - tax brackets and the Medicare levy
  - super rules and preservation age
  - the Age Pension tests
- Where a rule is changing, use the right rule for each year (for example, the CGT changes from 1 July 2027).
- Note your sources in code comments, and tell me when an assumption is an estimate.

### New features: you have creative licence
- If I give a short overview of a bigger feature, design and build it properly using best practice for financial planning apps. Make it intuitive and consistent with the rest of WealthWise.
- If the feature has a big fork in the road (two quite different ways it could work), ask me one quick question first. Otherwise build it, then tell me the choices you made.

### Before saying anything is done
1. Type-check it (`npx tsc --noEmit -p .` and `npx tsc --noEmit -p worker`).
2. Sanity-check the numbers on the demo account.
3. Check the screen with a screenshot, on desktop and at phone width.
4. Commit and push to `main`, and update the preview artifact.
5. When we finish something significant, update this handoff file (in the repo and in the Claude project) so the next chat stays current.

---

## 3. Stack, repo and deploy

- **Repo:** GitHub `camdon84/wealthwise` (branch `main`). Cloudflare auto-deploys on every push to `main`. If a push is refused by the git proxy, attach the repo to the session with push access first.
- **Live app:** https://wealthwise.cam-donley.workers.dev
- **Frontend:** Vite 5, React 18, TypeScript, Tailwind 3 (colour tokens are CSS variables: `gum`, `brass`, `sky`, `clay`, `sage`, `ink`, `muted`, `line`, `ground`), Recharts 2 and Zustand 4.
- **Backend:** a Cloudflare Worker (`worker/index.ts`) serving static assets, with:
  - **D1** database `wealthwise`
  - Workers AI model `gpt-oss-120b` via `askAI()`
  - a `cached(env, key, ttl, fn, force)` helper (AI cache key prefix currently `wise4:`; bump it when the AI rules change so old answers are dropped)
  - a daily cron (`0 20 * * *`) that refreshes cached data
- **API routes** include:
  - `/api/wise`, with modes such as `ideas` and `goals`, plus a `fresh` param. Request bodies up to 16,000 characters.
  - `/api/cpi`, which reads RBA G1 CSV (CPI index GCPIAG). Dates are dd/mm/yyyy and the file is Latin-1.
  - `/api/savings-rates`, which reads RBA F4 CSV: bonus saver FRDIRSAB10K (5.05%), online FRDIRSAO10K and transaction FRDIRTAB5K
- **Scripts:** `npm run dev`, `npm run build`, `npm run build:preview`, `npm run deploy`.
- **Commits** go in my name, `git -c user.name="Cameron Donley" -c user.email="cam.donley@gmail.com" commit …`, and end with whatever attribution lines your session gives you.

- **Claude preview artifact.** A copy of the app runs as a Claude artifact on demo data:
  - slug `426277df-a86e-4fce-b44a-40e1f0c7bdee`
  - URL https://claude.ai/artifact/9CTFY1vT9D9F4XH3Yo8him
  - latest version `1794365070-ac94`
  - Build it with `npx vite build --mode preview --outDir dist-preview`.
  - Publish with mode `replace`, including `index.html`, `assets/index-*.js`, `assets/index-*.css`, `samples/{loan,super,valuation}-sample.pdf` and `demo/*.jpg`.
- **Admin portal:** https://wealthwise-admin.cam-donley.workers.dev (separate Worker `wealthwise-admin`, same D1 database).
  - Code in `admin/` (`admin/index.ts`, `admin/wrangler.jsonc`). Its own Workers Builds trigger ("Admin portal") deploys it on pushes to `main` that touch `admin/*`, `worker/shared.ts` or `package.json`. Manual: `npm run deploy:admin`.
  - Admins live in the `admins` table (separate from app users) with their own sessions. Cameron's admin login is cam.donley@gmail.com. **No admin password is kept in the repo.** To add or change an admin, hash the password with PBKDF2-SHA256, 100,000 rounds and a random 16-byte salt (same as `hashPassword()` in `worker/shared.ts`), then insert into `admins` through the D1 API.
- **Demo account:** log in with "Explore the demo account". Each click starts a fresh copy (the demo lives in the visitor's browser). The demo's CPI baseline is set one year back, so the inflation pop-up shows. Demo properties (and Michelle's) use stock photos from `public/demo/` (Unsplash licence; IDs listed in `defaults.ts` at `DEMO_PHOTO`).

---

## 4. Key files

| Area | Files |
|---|---|
| Engine (projection maths) | `src/lib/calc.ts`: `project()` returns points, events and `sales[]`; also covers the cash plan split, liquidations and loan payoffs. Purchases only happen while working. |
| Data model | `src/lib/types.ts` (Profile, Goals, CashPlan, Liquidation, Gift, InsightState, actionState and more); `src/lib/defaults.ts` (`normalize()` migrations and the demo profile) |
| Store | `src/lib/store.ts` (Zustand). `syncOffsets` sets cash to savings plus offsets. |
| Plan check and ideas | `src/lib/planCheck.ts`; `src/components/PlanCheck.tsx` (PlanCheckBox, RetireIncomeNotice, LockNudge, WiseRead, PlanIdeas) |
| Insights and AI facts | `src/lib/insights.ts` (max 10, ranking, `wiseFacts`, `planSettings`, and the AI idea filters `notWorkIdea`, `notDelayIdea`, `buysBeforeRetiring`, `respectsShareHold`, combined in `wiseIdeaOk`); `src/components/Assistants.tsx` (WisePanel, useWiseTake) |
| Wise Actions | `src/lib/actions.ts`; `src/pages/WiseActions.tsx` |
| Inflation | `src/lib/cpi.ts`; `src/components/InflationUpdate.tsx` |
| Savings rates | `src/lib/rates.ts` |
| Charts | `src/components/Charts.tsx` (WealthChart, CashFlowChart, MarkerKey, SeriesToggles, toReal, `useNarrow`); `src/components/ChartControls.tsx` (ChartToolbar, DollarsToggle); `src/components/PriceCharts.tsx` |
| Pages | `Overview`, `Plan` (all Wise Plan tabs and Your Wise Future), `CashTab`, `Properties`, `Investments`, `MyDetails`, `WiseActions`, `Documents`, `Account` |
| Onboarding | `src/onboarding/Onboarding.tsx` |
| Admin portal | `admin/index.ts` (server-rendered pages, no build step); `worker/shared.ts` (password hashing and admin tables, shared by both workers) |
| Example users | `scripts/demo-users.ts` (Michelle and Melissa Donley; prints their profiles as JSON) |
| Shared UI | `src/components/ui.tsx` (Segmented with `size="xs"`, `stretch` and `scroll`, MoneyInput, icons) |
| Wording constants | `src/lib/format.ts` (`money()`, `CGT_2027_NOTE`) |
| Plan mode | `src/lib/planContext.tsx`: `usePlanProfile`, `usePlanUpdate` and `usePlanMode` respect lock and Forecast mode. Use raw `useApp(s=>s.update)` for preference and state fields (ideas, actions, insights) so they still work when the plan is locked. |

---

## 5. Testing approach

- **Type check:** `npx tsc --noEmit -p .` and `npx tsc --noEmit -p worker`
- **Preview build:** `npx vite build --mode preview --outDir dist-preview`, then serve it with `npx vite preview --outDir dist-preview --port 4173`.
- **Screenshots:** Playwright (Python) with Chrome at `/usr/bin/google-chrome`.
  1. Click "Explore the demo account".
  2. Navigate with `location.hash` (for example `'plan'`). Plan and My Details sections are `role="radio"` buttons (Your Wise Future is `role="tab"`), so click by role with exact names.
  3. Use exact-match locators to avoid strict-mode errors.
  4. **Phone check:** viewport 390×844 with `is_mobile=True`. Check `document.documentElement.scrollWidth` is 390 on every page and tab (nothing should scroll sideways), then look at full-page screenshots.
- **Engine checks:** bundle `calc.ts` / `planCheck.ts` with esbuild (`--define:import.meta.env={}`) and run them against the demo profile.
- **AI checks:** after deploying, POST facts to `https://wealthwise.cam-donley.workers.dev/api/wise?mode=goals&fresh=N` (or `mode=ideas`) with curl.

---

## 6. Features as they stand

### Overview
- **Net worth / Cash flow toggle:** extra small, sits next to the value.
- **Chart controls:** series tick boxes (with the hint underneath) in the top-right corner of the chart panel, beside the headline figure; they drop under the figure when there isn't room. The Today's money / Future money toggle is small (same size as Net worth / Cash flow) and sits under the chart, bottom right, beside the key (`ChartFooter`). There's no "I'm planning to live to" picker on the charts any more; life expectancy is set on the Goals tab (and in onboarding).
- **KPI tiles:** on phones the third tile ("Left over cash each month") spans both columns, so there's no empty box.
- **Wise Insights:**
  - Shows at most 10, newest and most relevant first.
  - Each has a Dismiss button that hides it for 6 months.
  - "Give me Wise Insights" regenerates the list.
  - Includes a "you can afford a higher retirement income" insight, which is snoozed for 12 months once the user changes their income.
  - Includes an idle cash reserves insight.
- **Inflation pop-up:** appears for locked plans once 12 or more months of CPI have passed. It shows old and new figures with an opt-out per item. It adjusts passive income, monthly shares, shares target, retirement cash and planned purchase prices. It never adjusts gifts or liquidations.
- **Yearly review reminder:** appears when a review is due.

### Wise Plan tabs
The tabs are Goals, Assumptions, Property Portfolio, Shares, Cash Reserves, Liquidation Events and Gifts, plus the Your Wise Future and Lock buttons. Below 1400px wide the section tabs sit on their own row (swipeable on phones, the chosen tab scrolls into view) with Your Wise Future and Lock on the row below; from 1400px everything sits on one row. My Details uses the same swipeable row.

- **Goals**
  - Wealth focus question (property, shares or balanced). It's also asked in onboarding, and it tailors the ideas.
  - **Cash reserves in retirement** is its own subheading in "What you want", above "Planning a big purchase?". We recommend $100,000 to $200,000 per person (`RETIRE_CASH_LOW_PER_PERSON` / `RETIRE_CASH_PER_PERSON`, `retireCashLow(p)` / `retireCashMin(p)`, doubled for a couple). The top of the range is the default when the field is blank. Field "Accessible cash reserves in retirement" (zero allowed). Only below the bottom of the range does a small alert (exclamation icon, brass, not red) show to the right of the box: "We recommend at least $X". On phones it sits under the box. A box under it says what happens to cash over the minimum and links to "Your spare cash" on the Shares tab.
  - **Share goal short:** the plan check says why (amount too low, savings can't always cover it, or it waits for a purchase) and offers a tested fix: start the share plan now, the monthly amount that actually reaches the goal in the projection, or a lower share goal. It's skipped when shares are already flagged for using deposit savings. Wise suggesting an *earlier* stop-work age is fine.
  - **Stop-work age is the user's choice.** Nothing in the app suggests working longer or retiring later. When money doesn't last, the tested fixes are: a lower retirement income, a bigger share plan while working (smallest tested amount that lasts and still buys every property on time), or one fewer property.
  - **Plan check:**
    - The dot points and red crosses can't be dismissed.
    - When the plan works: just the 3–4 green dot points, with no Wise summary underneath (Cameron asked for no sentence that repeats the dot points).
    - When it doesn't work: the AI read (WiseRead) sits under the problems. It's sent the plan check's tested problems, fixes and ideas, and must lead with one tested fix or idea and its figures, not a recap of the goals.
    - "Have you thought about these options?" shows at most 6 ideas, keeping one liquidation idea if there is one. Each idea has Dismiss (6 months); on phones Dismiss sits under the idea.
    - "Give me Wise ideas about my plan" refreshes the ideas, and they also refresh automatically every 6 months.
  - **Lock note:** "Now that your plan is complete, it's a good time to lock it in. To try different scenarios, you can always use Forecast mode." It has a Lock button and sits above the plan check result. It only shows when the plan works and it's the live plan.
  - **Late purchase message:** "You want to purchase this property before X, but the earliest it fits is Y. Adjust the price, the purchase year, or go to your Goals tab for further recommendations."
  - The boxes size to their content and don't stretch to the bottom.
  - **"Planning a big purchase?"** (just above "Planning to have children?"): description, cost (today's money) and year for each, stored in `goals.events`. The engine inflates each cost to its year and takes it from savings (this year's ones land next year, like gifts). It's also in onboarding, the inflation update, Wise Actions ("Set money aside: …" within 2 years) and the AI facts.
- **Property Portfolio:** each planned purchase is "An investment" or "My home to live in" (`use`).
  - A home earns no rent, has no negative gearing or capital gains tax, and its loan is paid off by retirement by default (otherwise paid from savings, then super). Rental yield, management and the new-build box are hidden for a home, and the stamp duty field notes the home concession.
  - Moving out of a home you own (or an earlier planned home): "Keep it and rent it out" (its rent counts for borrowing; its CGT cost base resets to its value then) or "Sell it" (no CGT; the money goes towards the new home, and it's listed under "Property sales already in your plan").
  - Rent stops when you first move into a home you own. First home buyer benefits only show for a first home you live in.
- **Liquidation Events**
  - **Intro:** "Plan the sale of shares, crypto or a property you own. Selling shares or crypto can free up capital for another property purchase, and selling any of your assets can strengthen your cash reserves."
  - **Selling a property:**
    - The sale price is prefilled with the projected value.
    - Agent costs are 2.5%.
    - It pays out the loan and estimates CGT (the home is exempt).
    - It shows the net figure.
  - **Shares and crypto:** a dollar amount with Quarter, Half and All buttons.
  - **"Property sales already in your plan":** only shows when there are sales, and says what is sold and why.
- **Cash Reserves** (simplified because the first version was "way too technical")
  - Intro states the peak cash amount and year, with build-up cards for each purchase.
  - A "Start here" box has three sliders: Offset accounts, High-interest savings and Savings account. It also has an offset loan picker, rates (high-interest prefilled from the RBA at 5.05%) and a "better off by X" line.
  - It saves to a summary with a "Review my cash reserves" button.
  - Also includes a "What about investing this extra capital?" statement and the CGT note.
  - No chart, no shares sweep and no scenario table.
- **Shares:** a "See how your monthly investment rises with inflation" pop-up, viewable by year or by month.
  - **Your spare cash** (`src/components/SpareCash.tsx`, anchor `#spare-cash`), full width under the share plan. Default: spare cash **stays in the bank** (the old automatic move into shares in retirement is gone). Two choices, each showing tested figures:
    - Step 1, after your last property: `goals.spareCashAbove` (today's money). Once every planned property is bought, cash over max(amount, emergency fund) plus whatever sits in offsets against loans still owing goes into shares each year, on top of the monthly investment.
    - Step 2, once you stop work: `goals.spareCashRetired`. Cash over the retirement cash reserve (plus any offset need) goes into shares.
  - Engine: `YearPoint.spareToShares`, `Projection.loansPaid`. Without a Cash Reserves plan, cash with no loan to offset earns `CASH_RATE_FALLBACK` (3.3%, RBA F4 online saver, Oct 2026) after tax.
  - Follow-through: plan check fix (when money runs out), "spare-cash" insight, Wise Action "Move spare cash into shares from YEAR", inflation update item, AI facts (`spareCash`) and prompt; AI cache prefix now `wise4:`.
  - "Set a retirement goal or a monthly amount, and we'll work out the other": whichever was set last leads. When the monthly amount leads, the goal is worked out from the plan and kept in step everywhere as the plan changes (synced in `App.tsx`, helper `sharesGoalFromPlan`). Typing a goal, or ticking the delay with a goal set, works out the monthly amount from the later start (`monthlyForShareGoal`).
  - With "don't invest until after I've bought…", the result box says the start year and years of investing, and what starting now would give. If that purchase can't happen by its target year, the note says so and gives the real start year.
- **Gifts:** a Save button locks each gift into a summary line, with Edit and trash.
- **Your Wise Future**
  - The net worth chart (or cash flow chart) plus retirement metrics, along with the retirement-income and lock notes only. It has no plan check and no ideas.
  - Same chart controls as Overview (no "planning to live to" picker).
  - The chart marker reads "Retirement".
  - The loan-paid-off dot sits on the cash line, and the key reads "Loan paid off: …".
  - On phones the small marker words (Buy #, Sell, Loan paid off) are hidden so they don't overlap; the key under the chart names them.
  - Cash flow chart colours: "From selling shares or crypto" is blue, "From selling property" is `#c0784a`, and "Gifts and inheritances" is purple.
  - Retirement metrics: on phones the fifth tile (Cash on hand) spans both columns.

### Admin portal
- **Sign in:** admins only, rate-limited (5 tries in 15 minutes), 12-hour sessions, SameSite=Strict cookie, not indexed by search engines.
- **Users:** stats (users, joined in the last 30 days, finished setup, signed in this week), search, and a table with name, email, age and state, properties, setup status, joined and last sign-in.
- **User page:** account, household, properties, goals and an admin activity log.
- **View as user:** a one-time token that lasts 15 minutes (`view_tokens`) opens the app at `#view=<token>`. The app loads that account through `/api/view`, shows a blue "Viewing X's account. Read only" banner with Exit, blocks typing in fields and never saves (`update()` does nothing while viewing). Only for accounts that have finished setup.
- **Send password reset:** placeholder only. It logs the request and shows a "Demo only" notice; nothing is sent and no password changes.
- **Example users:** Michelle Donley (70, stops work at 75, a unit in Bargara and a house in Bundaberg West, about $500k super and $100k shares) and Melissa Donley (40, with Costa, buying an $850k established first home in Brisbane in 2027 with the 5% Deposit Scheme, two children planned). Emails are made up but realistic (michelle.donley.bargara@bigpond.com, melandcosta.donley@gmail.com), so **leave these two out when password reset emails go live**. Random passwords nobody knows; open them with View as user. Their join dates and sign-ins (Sept to Nov 2026) are set in D1, with unusable session rows recording the sign-ins. No crypto.

### Wise Actions page
In the sidebar under Wise Plan, with a badge that counts items needing attention.

- **Pay split bar:** Everyday spending, Bills account, Shares, Offset and High-interest savings.
- **Set up once:** a high-interest account (no bank links), an emergency fund in its own account, a separate bills account, offsets for each target, and a broker with auto-invest.
- **Every payday:** auto-invest, offset and high-interest transfers, credit card repayments, loan auto-repayments, rent into the offset, and property bills.
- **Check in:** a super check, getting ready to buy within 2 years, seeing an accountant before a planned liquidation, and "Start your automatic share purchase in YEAR" when the share start is delayed.
- **Ticked items:** if the plan changes, they untick themselves and raise an alert.
- **Yearly review:** "I've reviewed my plan" resets the clock.

### Other pages
- **Properties:** each row shows the card and the value chart side by side, 50/50 width and equal height.
- **Shares and Crypto pages:**
  - The portfolio value is at the top.
  - The carousel opens on "Your portfolio over time", then slides to Markets after 15 seconds.
  - The range buttons sit next to the title, with the arrows on the same line.
  - Holdings: a table from `sm` up; on phones a compact list (code, units, price, today's move, value and gain).
- **My Details:**
  - Tabs: "Work and Income", "Home and Living Costs", "Cash, Superannuation and Debts", "Dependants".
  - Cash is entered as "Total cash and savings at bank, excluding any offset accounts", plus an offset block for each property.
  - The offset is read-only in the property editor, with the hint "This value can only be edited in your My Details tab."
  - Super is shown as "Cameron's superannuation balance", with optional Provider and Policy / account number fields.
  - Credit cards take a limit only, with no balance or rate.
  - Ownership options are only "Me personally" and "Jointly".

---

## 7. Hard rules

### AI content
These rules are enforced in the prompts and also by filters in `worker/index.ts` and `src/lib/insights.ts` (`wiseIdeaOk`).

- **Never suggest more work:** no part-time work, consulting, side hustles, working longer, later retirement or a higher retirement age. The stop-work age is the user's choice.
- **Never suggest delaying or postponing a purchase.** People want each property as soon as it fits; timing ideas bring purchases forward.
- **Never suggest buying a property in or after the stop-work year.** The facts include `goal.stopWorkYear`.
- **Respect settings already in place.** The facts include `sharePlan` (amount, and `alreadyOnHoldUntilPropertyNumber` when "don't invest in shares until after my next property" is ticked) and `plannedPurchases` (price, wanted-by year, year it fits, interest-only, paid off). If the share plan already waits for a purchase, never suggest lowering, pausing or rebalancing it to fund that deposit.
- **Figures:** use only the app's figures, copied exactly as written. The worker tidies stray spaces in dollar figures ("$1.5 m" → "$1.5m").
- **Never suggest anything the app can't model yet, and never mention it in the app:** trusts, companies, SMSF, salary sacrifice, extra super contributions, debt recycling, insurance, refinancing, or rentvesting. The exception is when I ask you to build that feature.

### Data and safety
- **Scraping:** never scrape realestate.com.au or Domain. Official APIs are OK.
- **Credentials and purchases:** never type passwords or API keys into fields. I handle purchases and OAuth grants myself.
- **Sample documents:** use fictional organisations only.

### Wording
- Keep copy short: one idea per sentence, no text that repeats what's already on screen, and no explaining the obvious. A full copy pass was done in November 2026.
- Say why once per group (for example, one reason above a list of property sales), not under every item.
- Join lists with `listJoin()` from `format.ts` ("a, b and c").
- Put "(in today's money)" in brackets when it appears mid-sentence.
- Show the CGT note (`CGT_2027_NOTE`) wherever CGT is estimated. From 1 July 2027, the 50% discount is replaced by indexation plus a 30% minimum tax, for gains after that date. The engine still uses the 50% discount.

---

## 8. Open ideas (not started; ask me before doing any)

1. Update the engine for the 2027 CGT rules.
2. Change the default assumption when there's no cash plan (currently all cash is treated as offset against debt, and any cash beyond the debt earns 3.3%).
3. Add an interest-only loan premium.
4. Add a borrowing capacity explainer.
5. Add suburb data (see below).
6. Set up a custom domain.

Done in November 2026: AI ideas no longer suggest purchases after retirement, and the "keep working to X" fixes are gone. Admin portal built.

Admin portal next steps (not started): real password reset emails (for example Cloudflare Email Sending), a way to change an admin password from the portal, and more admins.

### Suburb data research (done; nothing built yet)
- **Free official sources, open licence, quarterly:**
  - NSW DCJ Rent and Sales: by LGA and postcode, since 2011.
  - QLD RTA median rents: by postcode, suburb and LGA.
  - Victorian Property Sales Report: median house price by suburb.
- Yield would be median rent ÷ median price. Growth comes from stacking the quarterly files.
- **Suggested approach:** a quarterly Worker cron that loads the files into D1. WA, SA, Tas and ACT sources haven't been checked yet.
- **Paid or restricted:**
  - Microburbs: $3,000/month, and its terms forbid caching.
  - Domain API: suburb performance is on paid tiers.
  - SQM Research: paid CSV downloads.
  - Propertylens: the free tier allows 5 requests a day.
