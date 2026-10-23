// Before you move: API proxy (Cloudflare Worker)
//
// Why this exists: the EPC API needs a bearer token and does not answer the
// CORS preflight browsers send before keyed requests, so the page cannot call it
// directly. The proxy keeps the EPC token and TfL key out of the public page.
//
// Routes
//   GET /epc?postcode=N16%200AS   -> { certificates: [...] } latest certificate per address
//   GET /certificate?number=XXXX-XXXX-XXXX-XXXX-XXXX -> running costs, scores, heating for one certificate
//   GET /tfl/<any TfL path>        -> passthrough to api.tfl.gov.uk with app_key added
//
// Secrets (set with `wrangler secret put`): EPC_TOKEN, TFL_APP_KEY
// Vars (wrangler.toml): ALLOWED_ORIGIN, EPC_SEARCH_URL

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const corsOrigin = allowed.includes(origin) ? origin : allowed[0] || "";
    const cors = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "Only GET is supported" }, 405, cors);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/epc") return await epc(url, env, ctx, cors);
      if (url.pathname === "/certificate") return await certificate(url, env, ctx, cors);
      if (url.pathname.startsWith("/tfl/")) return await tfl(url, env, cors);
      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: "Upstream request failed", detail: String(err.message || err) }, 502, cors);
    }
  }
};

function json(body, status, headers, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers, ...extra }
  });
}

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i;

async function epc(url, env, ctx, cors) {
  const postcode = (url.searchParams.get("postcode") || "").trim().toUpperCase();
  if (!POSTCODE.test(postcode)) return json({ error: "Enter a full postcode" }, 400, cors);
  if (!env.EPC_TOKEN || !env.EPC_SEARCH_URL) return json({ notConnected: true }, 200, cors);

  // Cache for a day: certificates change rarely and this keeps us well inside rate limits.
  const cacheKey = new Request("https://cache.before-you-move/epc/" + encodeURIComponent(postcode));
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });

  // The API documents postcodes as "LS1+4AP", so encode the space as a plus.
  const upstream = env.EPC_SEARCH_URL.replace("{postcode}", encodeURIComponent(postcode).replace(/%20/g, "+"));
  const res = await fetch(upstream, {
    headers: { Authorization: "Bearer " + env.EPC_TOKEN, Accept: "application/json" }
  });
  // 404 means no certificates match this postcode: an answer, not a failure.
  if (res.status === 404) return json({ certificates: [] }, 200, cors, { "Cache-Control": "public, max-age=86400" });
  if (!res.ok) throw new Error("EPC API returned " + res.status);
  const raw = await res.json();

  const rows = Array.isArray(raw.data) ? raw.data : raw.rows || raw.results || raw.certificates || (Array.isArray(raw) ? raw : []);
  const latest = new Map();
  for (const r of rows) {
    const c = normaliseCertificate(r);
    if (!c.address || !c.band) continue;
    // The register stores the same home as "79 Church St" and "79, Church St": merge them.
    const key = c.address.toLowerCase().replace(/[,\s]+/g, " ").trim();
    const prev = latest.get(key);
    if (!prev || c.lodged > prev.lodged) latest.set(key, c);
  }
  const certificates = [...latest.values()].sort((a, b) => a.address.localeCompare(b.address, "en-GB", { numeric: true }));

  const out = json({ certificates }, 200, cors, { "Cache-Control": "public, max-age=86400" });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

// Field names differ between the old and new EPC services (kebab-case vs camelCase).
// Read either so the page gets one stable shape.
function pick(r, ...keys) {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function normaliseCertificate(r) {
  const titleCase = s => String(s).toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
  const address = titleCase([pick(r, "address1", "addressLine1"), pick(r, "address2", "addressLine2"), pick(r, "address3", "addressLine3"), pick(r, "addressLine4")]
    .filter(Boolean).join(", ") || pick(r, "address", "fullAddress") || "")
    .replace(/(\d+[A-Za-z]?), (?=[A-Za-z])/g, "$1 ");
  const cost = (...k) => num(pick(r, ...k));
  return {
    address,
    certificateNumber: pick(r, "certificateNumber", "lmk-key") || "",
    band: pick(r, "current-energy-rating", "currentEnergyRating", "currentEnergyEfficiencyBand"),
    score: num(pick(r, "current-energy-efficiency", "currentEnergyEfficiency")),
    potentialBand: pick(r, "potential-energy-rating", "potentialEnergyRating"),
    potentialScore: num(pick(r, "potential-energy-efficiency", "potentialEnergyEfficiency")),
    lodged: String(pick(r, "lodgement-date", "lodgementDate", "registrationDate") || "").slice(0, 10),
    floorArea: num(pick(r, "total-floor-area", "totalFloorArea")),
    heating: pick(r, "mainheat-description", "mainheatDescription") || "",
    estAnnual: cost("heating-cost-current", "heatingCostCurrent") + cost("hot-water-cost-current", "hotWaterCostCurrent") + cost("lighting-cost-current", "lightingCostCurrent"),
    estAnnualPotential: cost("heating-cost-potential", "heatingCostPotential") + cost("hot-water-cost-potential", "hotWaterCostPotential") + cost("lighting-cost-potential", "lightingCostPotential")
  };
}

async function tfl(url, env, cors) {
  const target = new URL("https://api.tfl.gov.uk" + url.pathname.slice(4) + url.search);
  if (!target.pathname.startsWith("/Journey/") && !target.pathname.startsWith("/Line/") && !target.pathname.startsWith("/StopPoint/")) {
    return json({ error: "Route not allowed" }, 403, cors);
  }
  if (env.TFL_APP_KEY) target.searchParams.set("app_key", env.TFL_APP_KEY);
  const res = await fetch(target, { headers: { Accept: "application/json" } });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...cors }
  });
}

const CERT_NUMBER = /^\d{4}-\d{4}-\d{4}-\d{4}-\d{4}$/;

async function certificate(url, env, ctx, cors) {
  const number = (url.searchParams.get("number") || "").trim();
  if (!CERT_NUMBER.test(number)) return json({ error: "Enter a 20-digit certificate number" }, 400, cors);
  if (!env.EPC_TOKEN || !env.EPC_SEARCH_URL) return json({ notConnected: true }, 200, cors);

  // Certificates never change once lodged, so cache for a week.
  const cacheKey = new Request("https://cache.before-you-move/certificate/" + number);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return new Response(hit.body, { headers: { ...Object.fromEntries(hit.headers), ...cors } });

  const base = new URL(env.EPC_SEARCH_URL).origin;
  const res = await fetch(base + "/api/certificate?certificate_number=" + encodeURIComponent(number), {
    headers: { Authorization: "Bearer " + env.EPC_TOKEN, Accept: "application/json" }
  });
  if (res.status === 404) return json({ notFound: true }, 200, cors);
  if (!res.ok) throw new Error("EPC API returned " + res.status);
  const raw = await res.json();
  const d = raw.data || raw;

  // Older schemas wrap values as {"value": 214, "currency": "GBP"}; newer ones use plain numbers.
  const val = v => (v && typeof v === "object" && "value" in v) ? v.value : v;
  const n = k => num(val(d[k]));
  const heatingList = Array.isArray(d.main_heating) ? d.main_heating : [];
  const heating = heatingList.map(h => val(h && h.description)).filter(Boolean).join("; ");

  const out = json({
    certificateNumber: number,
    score: n("energy_rating_current"),
    potentialScore: n("energy_rating_potential"),
    band: val(d.current_energy_efficiency_band) || undefined,
    potentialBand: val(d.potential_energy_efficiency_band) || undefined,
    floorArea: n("total_floor_area"),
    heating,
    estAnnual: n("heating_cost_current") + n("hot_water_cost_current") + n("lighting_cost_current"),
    estAnnualPotential: n("heating_cost_potential") + n("hot_water_cost_potential") + n("lighting_cost_potential")
  }, 200, cors, { "Cache-Control": "public, max-age=604800" });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
