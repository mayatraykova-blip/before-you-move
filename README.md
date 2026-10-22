# Before you move

**Check the postcode. Know what to ask.**

Buying or renting? Understand the area, spot potential concerns and get a checklist of questions to ask before you commit.

Before you move takes a London postcode and returns one report built from six public data sources: energy performance, crime, flood risk, planning restrictions, sold prices and the 8am commute. It has two routes. Renters get a checklist for before they pay a holding deposit. Buyers get one for before they make an offer.

**Status:** live at [mayatraykova-blip.github.io/before-you-move](https://mayatraykova-blip.github.io/before-you-move). Five of six data sources run live in the browser: postcodes.io, Police.uk, TfL, HM Land Registry and planning.data.gov.uk. I tested planning data against N1 1RA, which correctly returns the Upper Street (North) conservation area. EPC data waits on the proxy.

---

## The problem

28% of London households rent privately, against 17% in the rest of England ([English Housing Survey 2024-25](https://www.gov.uk/government/statistics/chapters-for-english-housing-survey-2024-to-2025-headline-findings-on-demographics-and-household-resilience/chapter-1-profile-of-households-and-dwellings)). That is roughly 1 million of London's 3.8 million households.

Those renters decide under time pressure. In August 2026 Foxtons recorded 24 renters registering per new rental listing, the highest level of the year, and 17.9 on average across 2026 ([Foxtons Lettings Market Report, August 2026](https://www.foxtons.co.uk/discover/2026/09/why-londons-lettings-season-arrived-early-lettings-market-report)).

The cost of a bad pick shows up later. A three-bedroom house rated EPC band F averages £4,431 a year in energy bills, against £1,669 at band C (Rightmove, 2024). 81% of private renters are satisfied with their home, against 94% of owner occupiers (English Housing Survey 2024-25).

The data that would change the decision is public. It is spread across at least six government and agency sites, and almost nobody checks them during a 15-minute viewing.

## What I decided, and why

**I built renters and buyers on one shared core.** Energy, flood, crime and commute matter to both, so they share one data layer. Each route then adds what only that audience needs. Renters get landlord licensing. Buyers get planning restrictions and sold prices on the postcode. Adding the buyer route cost one extra card each, not a second product.

**I started with renters in the framing, not buyers.** Buyers already get solicitor searches and surveys, and tools like PropertyData and Chimnie cover much of this. Renters get nothing comparable, and they decide in hours rather than over a conveyancing window of months. Buyers are still not fully served: one survey of 2,000 homeowners found 49% hit a surprise issue even though 55% had a survey done (Gas Safe Register).

**I chose postcode input over listing links.** Rightmove and Zoopla listings cannot be scraped within their terms. A postcode works with every open API and keeps the tool independent of any portal.

**I didn't score crime.** A raw count within a mile always looks high near a station or high street, and there is no fair baseline in the data. The report shows the count and the top categories, and tells people to compare postcodes they are considering.

**I turned findings into questions.** The output that matters is the checklist at the top of each report. An EPC of E, F or G generates a question about winter bills and the legal minimum. A conservation area generates a question about extensions. This is the step the raw data sites don't do.

**I added a small server for the keys.** The EPC API needs a token and does not answer the CORS preflight that browsers send. A Cloudflare Worker holds the EPC token and TfL key, so neither sits in the public page.

## How it works

```
Browser (GitHub Pages, index.html)
 ├── postcodes.io ............ postcode → location, borough, ward
 ├── data.police.uk .......... street-level crime, latest month
 ├── Environment Agency ...... live flood alerts and warnings
 ├── planning.data.gov.uk .... conservation areas, flood zones, listed buildings, Article 4
 ├── HM Land Registry ........ sold prices on the postcode (SPARQL)
 └── Proxy (Cloudflare Worker)
      ├── EPC register ....... certificates for every property on the postcode
      └── TfL Journey Planner  8am commute, with the API key kept server-side
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

1. **Deploy the proxy and connect EPC.** The proxy reads both the old and new EPC field formats, but I haven't seen a live response from the new service yet.
2. **Handle failures visibly.** Done: if a source doesn't respond, its row says so instead of showing an empty result.
3. **Interview 10 renters.** The secondary data shows the market pressure and the cost of a bad pick. It doesn't show that renters would use a checker before signing. That is the riskiest assumption.
4. **Landlord licensing by street.** Each borough publishes its selective licensing areas differently. Mapping them would let the renter card answer directly instead of pointing to the council.
5. **Surface water flood risk.** It is the more common flood risk in London and is not in the data the page uses today.

## Limits

The report is guidance, not a survey or legal advice. Planning coverage depends on what each borough has published, and your solicitor's local authority search is the definitive check. Leasehold details (lease length, ground rent, service charges) are not in open data.

## Licence

Code: MIT. Data: see [docs/data-sources.md](docs/data-sources.md). Contains public sector information licensed under the Open Government Licence v3.0.
