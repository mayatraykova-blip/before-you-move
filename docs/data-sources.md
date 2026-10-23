# Data sources

| Card | Source | Endpoint | Key needed | Licence |
|---|---|---|---|---|
| Location | postcodes.io | `api.postcodes.io/postcodes/{postcode}` | No | OGL v3, contains OS and Royal Mail data |
| Crime | Police.uk | `data.police.uk/api/crimes-street/all-crime?lat=&lng=` | No | OGL v3 |
| Flood alerts | Environment Agency flood monitoring | `environment.data.gov.uk/flood-monitoring/id/floods?lat=&long=&dist=3` | No | OGL v3 |
| Flood zone, conservation area, listed building, Article 4, tree preservation | planning.data.gov.uk | `www.planning.data.gov.uk/entity.json?latitude=&longitude=&dataset=...` | No | OGL v3 (check per dataset) |
| Sold prices | HM Land Registry Price Paid Data | `landregistry.data.gov.uk/landregistry/query` (SPARQL) | No | OGL v3, with Land Registry attribution |
| Commute | TfL Unified API, Journey Planner | `api.tfl.gov.uk/Journey/JourneyResults/{from}/to/{to}` | Optional (higher limits) | TfL open data terms, "Powered by TfL Open Data" |
| Business: commercial energy | EPC register, non-domestic certificates | Via proxy: `/api/non-domestic/search`, then `/api/certificate` | Yes, bearer token | As EPC |
| Business: busy times | TfL Unified API, StopPoint and crowding | `api.tfl.gov.uk/StopPoint?lat=&lon=&stopTypes=NaptanMetroStation&radius=1000`, then `/crowding/{naptan}` | Via proxy | TfL open data terms |
| Business: competitors | Food Standards Agency, Food Hygiene Rating Scheme API v2 | Via proxy: `api.ratings.food.gov.uk/Establishments?latitude=&longitude=&maxDistanceLimit=0.3` with header `x-api-version: 2` | No | OGL v3 |
| Energy | EPC register (MHCLG) | Via proxy; see API documentation on get-energy-performance-data.communities.gov.uk | Yes, bearer token | Check the register's licence page: address data carries extra conditions |

## Notes

- **Crime** covers roughly a one-mile radius around the point, for the latest published month. Locations are snapped to anonymised points.
- **Flood zones** cover rivers and the sea. Surface water risk is separate: [check long-term flood risk](https://check-long-term-flood-risk.service.gov.uk).
- **Planning designations** depend on each borough publishing to planning.data.gov.uk. A missing result does not prove there is no designation.
- **EPC** results are per property. The page lists every address on the postcode with its latest certificate and lets the user pick one.
- **Price Paid** covers sales in England and Wales since 1995. It excludes some transfers, such as right-to-buy sales at a discount.
- **Commercial asset ratings** run the other way to homes: lower is better. Band A+ is below 0 and band G is over 150.
- **TfL crowding** covers Underground stations only, and shows busyness as a share of each station's busiest level, not a count of people.
- **FSA data** covers food businesses only, so the competitor count is empty for non-food shops and offices. Those see places to eat and drink nearby instead.
