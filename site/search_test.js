const fs = require("fs");
const path = require("path");

const payloadCandidates = [
  path.join(__dirname, "report_payload.json"),
  path.join(process.cwd(), "report_payload.json"),
  path.join(process.cwd(), "site", "report_payload.json"),
];
const payloadPath = payloadCandidates.find((candidate) => fs.existsSync(candidate));

if (!payloadPath) {
  throw new Error("Could not locate report_payload.json");
}

const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/oauth\s*2(\.0)?/g, "oauth2")
    .replace(/api[\s_-]*key/g, "api key")
    .replace(/self[\s_-]*serve/g, "self serve")
    .replace(/partially[\s_-]*gated/g, "partially gated")
    .replace(/none[\s_-]*found/g, "none found")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function safeArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined && item !== "");
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function getField(raw, candidates, fallback = "") {
  for (const key of candidates) {
    if (raw && raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
      return raw[key];
    }
  }
  return fallback;
}

function canonicalAuthValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized.includes("oauth")) return "oauth2";
  if (normalized.includes("api key")) return "api_key";
  if (normalized === "basic") return "basic";
  if (normalized.includes("token")) return "token";
  if (normalized.includes("session")) return "session";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalAccessValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("partially gated")) return "partially_gated";
  if (normalized.includes("self serve")) return "self_serve";
  if (normalized.includes("gated")) return "gated";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalBuildabilityValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("buildable today")) return "buildable_today";
  if (normalized.includes("buildable with limitations") || normalized.includes("limited")) {
    return "buildable_with_limitations";
  }
  if (normalized.includes("needs outreach") || normalized.includes("outreach")) return "needs_outreach";
  if (normalized.includes("not buildable")) return "not_buildable_now";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalMcpValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("official")) return "official";
  if (normalized.includes("unofficial")) return "unofficial";
  if (normalized.includes("none found")) return "none_found";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function canonicalApiSurface(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("rest and graphql")) return "rest_and_graphql";
  if (normalized === "rest") return "rest";
  if (normalized === "graphql") return "graphql";
  if (normalized.includes("sdk only")) return "sdk_only";
  if (normalized.includes("undocumented")) return "undocumented";
  if (normalized.includes("mixed")) return "mixed";
  if (normalized.includes("unclear")) return "unclear";
  return normalized.replace(/\s+/g, "_");
}

function confidenceBucket(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

const correctedApps = new Set((payload.corrected_app_names || []).map((value) => normalizeText(value)));

function normalizeApp(rawApp) {
  const name = cleanText(getField(rawApp, ["app_name", "name", "App", "app"], "Unknown app"));
  const category = cleanText(getField(rawApp, ["category", "Category"], "Unknown"));
  const description = cleanText(getField(rawApp, ["one_line_description", "description"], "Not available"));
  const authMethods = [...new Set(safeArray(getField(rawApp, ["auth_methods", "auth", "Auth"], [])).map(canonicalAuthValue).filter(Boolean))];
  const accessStatus = canonicalAccessValue(getField(rawApp, ["self_serve_status", "self_serve_vs_gated", "access"], "unknown"));
  const apiSurface = canonicalApiSurface(getField(rawApp, ["api_surface", "api"], "unknown"));
  const mcpStatus = canonicalMcpValue(getField(rawApp, ["existing_mcp", "mcp", "mcp_status"], "unknown"));
  const buildability = canonicalBuildabilityValue(getField(rawApp, ["buildability_verdict", "verdict", "buildability"], "unknown"));
  const blocker = cleanText(getField(rawApp, ["main_blocker", "blocker"], "Not available"));
  const evidenceUrls = safeArray(getField(rawApp, ["evidence_urls", "evidence", "docs_urls"], [])).map(cleanText).filter(Boolean);
  const notes = cleanText(getField(rawApp, ["notes", "note"], ""));
  const uncertainFields = safeArray(getField(rawApp, ["uncertain_fields"], [])).map(cleanText);
  const lowConfidence = Boolean(getField(rawApp, ["low_confidence"], false));
  const normalizedName = normalizeText(name);
  const humanReviewRequired = lowConfidence || uncertainFields.length > 0;

  return {
    name,
    category,
    description,
    authMethods,
    accessStatus,
    apiSurface,
    mcpStatus,
    buildability,
    blocker,
    notes,
    confidence: Number(getField(rawApp, ["confidence_score", "confidence"], 0)),
    confidenceBucket: confidenceBucket(Number(getField(rawApp, ["confidence_score", "confidence"], 0))),
    humanReviewRequired,
    isCorrected: correctedApps.has(normalizedName),
    normalizedName,
    normalizedCategory: normalizeText(category),
    evidenceText: normalizeText(evidenceUrls.join(" ")),
    searchableText: normalizeText(
      [
        name,
        category,
        description,
        authMethods.join(" "),
        accessStatus,
        apiSurface,
        mcpStatus,
        buildability,
        blocker,
        notes,
        evidenceUrls.join(" "),
        humanReviewRequired ? "human review low confidence" : "",
        correctedApps.has(normalizedName) ? "corrected corrected app" : "",
      ].join(" ")
    ),
  };
}

const apps = (payload.results || []).map(normalizeApp);

function scoreApp(app, query) {
  if (!query) return 0;
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(normalizedQuery);
  if (!tokens.length) return 0;

  let score = 0;
  const name = app.normalizedName;
  const category = app.normalizedCategory;
  const auth = normalizeText(app.authMethods.join(" "));
  const access = normalizeText(app.accessStatus);
  const buildability = normalizeText(app.buildability);
  const apiSurface = normalizeText(app.apiSurface);
  const mcp = normalizeText(app.mcpStatus);
  const blocker = normalizeText(app.blocker);
  const description = normalizeText(app.description);
  const notes = normalizeText(app.notes);
  const evidence = app.evidenceText;
  const searchable = app.searchableText;

  if (name === normalizedQuery) score += 100;
  else if (name.startsWith(normalizedQuery)) score += 80;
  else if (name.includes(normalizedQuery)) score += 60;

  let matchedTokens = 0;
  tokens.forEach((token) => {
    let tokenMatched = false;
    if (name === token) {
      score += 100;
      tokenMatched = true;
    } else if (name.startsWith(token)) {
      score += 80;
      tokenMatched = true;
    } else if (name.includes(token)) {
      score += 60;
      tokenMatched = true;
    }
    if (category === token || category.includes(token)) {
      score += 35;
      tokenMatched = true;
    }
    if (
      auth.includes(token) ||
      buildability.includes(token) ||
      access.includes(token) ||
      (token === "oauth" && auth.includes("oauth2")) ||
      (token === "api" && auth.includes("api key")) ||
      (token === "buildable" && buildability.includes("buildable")) ||
      (token === "gated" && access.includes("gated")) ||
      (token === "mcp" && mcp !== "unknown")
    ) {
      score += 30;
      tokenMatched = true;
    }
    if (apiSurface.includes(token) || mcp.includes(token) || blocker.includes(token)) {
      score += 25;
      tokenMatched = true;
    }
    if (description.includes(token) || notes.includes(token) || evidence.includes(token)) {
      score += 10;
      tokenMatched = true;
    }
    if (!tokenMatched && searchable.includes(token)) {
      score += 8;
      tokenMatched = true;
    }
    if (tokenMatched) matchedTokens += 1;
  });

  if (matchedTokens === tokens.length) score += 20;
  return score;
}

function search(query, filters = {}) {
  const filtered = apps
    .filter((app) => !filters.category || normalizeText(app.category) === normalizeText(filters.category))
    .filter((app) => !filters.auth || app.authMethods.includes(canonicalAuthValue(filters.auth)))
    .filter((app) => !filters.correctedOnly || app.isCorrected)
    .map((app) => ({ app, score: scoreApp(app, query) }));

  const narrowed = query ? filtered.filter((entry) => entry.score > 0) : filtered;
  narrowed.sort((a, b) => {
    if (query && b.score !== a.score) return b.score - a.score;
    if (b.app.confidence !== a.app.confidence) return b.app.confidence - a.app.confidence;
    return a.app.name.localeCompare(b.app.name);
  });
  return narrowed.map((entry) => entry.app);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const exactQueries = ["Slack", "Salesforce", "Clay", "NotebookLM", "WhatsApp Business", "GitHub", "Stripe"];
exactQueries.forEach((query) => {
  const result = search(query);
  assert(result.length > 0, `No result for ${query}`);
  assert(result[0].name.toLowerCase() === query.toLowerCase(), `Exact match not first for ${query}`);
});

["CRM", "Ecommerce", "Finance", "Productivity", "AI", "OAuth", "API key", "Basic", "token", "buildable", "gated", "outreach", "limited", "MCP", "low confidence", "human review"].forEach((query) => {
  const result = search(query);
  assert(result.length > 0, `No result for broad query ${query}`);
});

["oauth crm", "api key ecommerce", "gated finance", "mcp ai"].forEach((query) => {
  const result = search(query);
  assert(result.length > 0, `No result for combined query ${query}`);
});

const slackFlow = search("Slack");
assert(slackFlow[0].name === "Slack", "Slack should rank first");
const clayFlow = search("Clay");
assert(clayFlow[0].name === "Clay", "Clay should rank first");
const crmOauth = search("", { category: "CRM", auth: "OAuth2" });
assert(crmOauth.length > 0, "CRM + OAuth2 filter should return results");
const correctedOnly = search("", { correctedOnly: true });
assert(correctedOnly.length > 0, "Corrected-only filter should return results");

console.log(
  JSON.stringify(
    {
      apps: apps.length,
      exactQueriesChecked: exactQueries,
      reviewerFlow: {
        slackFirst: slackFlow[0].name,
        clayFirst: clayFlow[0].name,
        crmOauthCount: crmOauth.length,
        correctedOnlyCount: correctedOnly.length,
      },
    },
    null,
    2
  )
);
