# Before you move

**Check the postcode. Know what to ask.**

Buying, renting or leasing for a business? Understand the area, spot potential concerns and get a checklist of questions to ask before you commit.

Before you move takes a London postcode and returns one report built from six public data sources: energy performance, crime, flood risk, planning restrictions, sold prices and the 8am commute. It has three routes. Renters get a checklist for before they pay a holding deposit. Buyers get one for before they make an offer. Small businesses get one for before they sign a commercial lease.

**Status:** live at [mayatraykova-blip.github.io/before-you-move](https://mayatraykova-blip.github.io/before-you-move). All six data sources run live. I tested each against real postcodes:

- **Planning:** N1 1RA returns the Upper Street (North) conservation area.
- **EPC:** N16 0AS returns 25 certificates. For 77 Stoke Newington Church Street the report shows band C (score 74, potential 85), £2,410 a year in energy costs, and a £601 saving from the recommended upgrades.
- **Sold prices, crime and commute:** real counts and journey times for every postcode tested.

---

## The problem

28% of London households rent privately, against 17% in the rest of England ([English Housing Survey 2024-25](https://www.gov.uk/government/statistics/chapters-for-english-housing-survey-2024-to-2025-headline-findings-on-demographics-and-household-resilience/chapter-1-profile-of-households-and-dwellings)). That is roughly 1 million of London's 3.8 million households.

Those renters decide under time pressure. In August 2026 Foxtons recorded 24 renters registering per new rental listing, the highest level of the year, and 17.9 on average across 2026 ([Foxtons Lettings Market Report, August 2026](https://www.foxtons.co.uk/discover/2026/09/why-londons-lettings-season-arrived-early-lettings-market-report)).

The cost of a bad pick shows up later. A three-bedroom house rated EPC band F averages £4,431 a year in energy bills, against £1,669 at band C (Rightmove, 2024). 81% of private renters are satisfied with their home, against 94% of owner occupiers (English Housing Survey 2024-25).

The data that would change the decision is public. It is spread across at least six government and agency sites, and almost nobody checks them during a 15-minute viewing.

## What I decided, and why

**I built renters and buyers on one shared core.** Energy, flood, crime and commute matter to both, so they share one data layer. Each route then adds what only that audience needs. Renters get landlord licensing. Buyers get planning restrictions and sold prices on the postcode. Adding the buyer route cost one extra card each, not a second product.

**I started with renters in the framing, not buyers.** Buyers already get solicitor searches and surveys, and tools like PropertyData and Chimnie cover much of this. Renters get nothing comparable, and they decide in hours rather than over a conveyancing window of months. Buyers are still not fully served: one survey of 2,000 homeowners found 49% hit a surprise issue even though 55% had a survey done (Gas Safe Register).

**I added small businesses as a third route.** A commercial lease usually runs for years, and the tenant often takes on repairs. Small business owners rarely have a surveyor checking the area for them. My search found law-firm guides on the commercial energy rules and no tool. The route reuses the postcode lookup, crime, planning, flood and the proxy, and adds three sources:

- **Commercial EPCs.** Landlords in England can't let a commercial building rated F or G without a registered exemption, so the band is a legal question, not just a running cost.
- **TfL station busyness by hour.** It isn't footfall past the door, but it shows when people are around, which matters for a café's lunch trade or a bar's evenings.
- **Food Standards Agency ratings.** These count similar food businesses within 500 m and their hygiene scores.

The checklist changes with the type of business. Takeaways and pubs need their own planning permission rather than Class E, so they get a different question from cafés and shops.

**I chose postcode input over listing links.** Rightmove and Zoopla listings cannot be scraped within their terms. A postcode works with every open API and keeps the tool independent of any portal.

**I didn't score crime.** A raw count within a mile always looks high near a station or high street, and there is no fair baseline in the data. The report shows the count and the top categories, and tells people to compare postcodes they are considering.

**I turned findings into questions.** The output that matters is the checklist at the top of each report. An EPC of E, F or G generates a question about winter bills and the legal minimum. A conservation area generates a question about extensions. This is the step the raw data sites don't do.

**I added a small server for the keys.** The EPC API needs a token and does not answer the CORS preflight that browsers send. A Cloudflare Worker holds the EPC token and TfL key, so neither sits in the public page.

**I load running costs only for the property someone picks.** The EPC search returns band and date for every home on a postcode, but costs, scores and heating need one extra call per certificate. A postcode can hold 25 or more homes. Fetching all of them up front would make every check slow, so the page fetches details on selection and the proxy caches each certificate for a week.

## How it works

```
Browser (GitHub Pages, index.html)
 ├── postcodes.io ............ postcode → location, borough, ward
 ├── data.police.uk .......... street-level crime, latest month
 ├── Environment Agency ...... live flood alerts and warnings
 ├── planning.data.gov.uk .... conservation areas, flood zones, listed buildings, Article 4
 ├── HM Land Registry ........ sold prices on the postcode (SPARQL)
 └── Proxy (Cloudflare Worker)
      ├── EPC register ....... home and commercial certificates, then details for the one selected
      ├── TfL ................ 8am commute, nearest station and its busyness by hour
      └── Food Standards Agency food businesses within 500 m, with hygiene ratings
```

When live calls are blocked (for example in a sandboxed preview), the page falls back to a sample report and labels every card as sample data.

Full source list and licences: [docs/data-sources.md](docs/data-sources.md).

## Run it

### The page

1. Open `index.html` in a browser, or serve the folder: `npx serve .`
2. Enter a London postcode.

Without the proxy, everything except the EPC card works. TfL still answers without a key at a lower rate limit.

### Publish with GitHub Pages

Settings → Pages → Deploy from branch → `main`, folder `/ (root)`. The page appears at `https://<username>.github.io/before-you-move/`.

### The proxy

You need free accounts for the EPC register (sign in with GOV.UK One Login, then copy the bearer token from My Account) and the [TfL API portal](https://api-portal.tfl.gov.uk).

```bash
cd proxy
npx wrangler login
npx wrangler secret put EPC_TOKEN
npx wrangler secret put TFL_APP_KEY
npx wrangler deploy
```

Then:

1. In `proxy/wrangler.toml`, set `EPC_SEARCH_URL` to the domestic search URL from the EPC API documentation, with `{postcode}` where the postcode goes. Redeploy.
2. In `index.html`, set `CONFIG.PROXY_BASE` to the Worker URL that `wrangler deploy` prints.

Never commit tokens. `.dev.vars` is git-ignored for local testing.

## What's next

1. **Interview 10 renters.** The secondary data shows the market pressure and the cost of a bad pick. It doesn't show that renters would use a checker before signing. That is the riskiest assumption.
2. **Landlord licensing by street.** Each borough publishes its selective licensing areas differently. Mapping them would let the renter card answer directly instead of pointing to the council.
3. **Surface water flood risk.** It is the more common flood risk in London and is not in the data the page uses today.

## What I fixed after launch

- **Silent failures.** The first version showed an empty result when a source failed, so a failed crime lookup read as "0 reports". Each row now says when its data couldn't load.
- **Capped sale counts.** I limited the Land Registry query to 25 results, so busy postcodes all showed exactly 25. It now fetches up to 100 and shows "100+" at the cap.
- **Blocked EPC responses.** The proxy duplicated a browser security header when it answered from cache. Direct tests passed but the page was blocked. It now replaces the header instead of adding a second one.
- **Competitor counts five times too high.** The business route first showed 375 cafés within 500 m of Stoke Newington Church Street. The Food Standards Agency API ignores its own distance limit, so the proxy now filters each result by its distance. The same postcode now shows 68.
- **A station that peaks at 10pm.** TfL's data put Highbury & Islington's busiest weekday period at 21:45 to 23:45. I checked Bank as a control, and it peaks at 08:00 to 10:00 and 17:00 to 19:00, so my code was reading the data correctly. TfL builds this measure from WiFi connections, which overcounts people who linger. I kept the charts, show TfL's own peak windows under them, and explain the measure, so an odd result is visible as TfL's data and not my analysis.
- **Duplicate addresses.** The EPC register stores some homes twice with different punctuation. The proxy merges them and keeps the latest certificate.

## Limits

The report is guidance, not a survey or legal advice. Planning coverage depends on what each borough has published, and your solicitor's local authority search is the definitive check. Leasehold details (lease length, ground rent, service charges) are not in open data.

## Licence

Code: MIT. Data: see [docs/data-sources.md](docs/data-sources.md). Contains public sector information licensed under the Open Government Licence v3.0.
