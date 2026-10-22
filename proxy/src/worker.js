// Before you move: API proxy (Cloudflare Worker)
//
// Why this exists: the EPC API needs a bearer token and does not answer the
// CORS preflight browsers send before keyed requests, so the page cannot call it
// directly. The proxy keeps the EPC token and TfL key out of the public page.
//
// Routes
//   GET /epc?postcode=N16%200AS   -> { certificates: [...] } latest certificate per address
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

  const upstream = env.EPC_SEARCH_URL.replace("{postcode}", encodeURIComponent(postcode));
  const res = await fetch(upstream, {
    headers: { Authorization: "Bearer " + env.EPC_TOKEN, Accept: "application/json" }
  });
  if (!res.ok) throw new Error("EPC API returned " + res.status);
  const raw = await res.json();

  const rows = raw.rows || raw.data || raw.results || raw.certificates || (Array.isArray(raw) ? raw : []);
  const latest = new Map();
  for (const r of rows) {
    const c = normaliseCertificate(r);
    if (!c.address || !c.band) continue;
    const prev = latest.get(c.address);
    if (!prev || c.lodged > prev.lodged) latest.set(c.address, c);
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
  const address = [pick(r, "address1", "addressLine1"), pick(r, "address2", "addressLine2"), pick(r, "address3", "addressLine3")]
    .filter(Boolean).join(", ") || pick(r, "address", "fullAddress") || "";
  const cost = (...k) => num(pick(r, ...k));
  return {
    address,
    band: pick(r, "current-energy-rating", "currentEnergyRating"),
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
