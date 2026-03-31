var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var GHL_BRAND_MAP = {
  "6QJMf2T1hCm4Mtzbr1Ta": "cct",
  "qpfdd6rnb2qUHIURVuvd": "nps",
  "G2jPKHKTjA0Cbtcu4kwF": "takiteztiki",
  "977HOLxKJ5cNKJh8OVb0": "brand",
  "6v5gpkt26Eta20eZRpb1": "aldecoa",
  "SeZr4YCwEZ50IcWqylkQ": "tlt",
  "Q4q1WV7WUS11V3AWEpAZ": "scottlehr",
  "SVNbbdAPJLmldKSHRy1V": "onestop",
  "kleUkEt0lBuPK6YezWV8": "tejeda",
  "TV1OqxyXM7YHSLC1ekMh": "houserealty"
};
var LOCATION_ID_REGEX = /\\/location\\/([a-zA-Z0-9]+)/;
var brandsCache = null;
var brandsCacheTime = 0;
var CACHE_TTL = 3e5;
function invalidateCache() {
  brandsCacheTime = 0;
}
__name(invalidateCache, "invalidateCache");
async function getBrand(env, key) {
  if (brandsCache && Date.now() - brandsCacheTime < CACHE_TTL) {
    return brandsCache[key] || null;
  }
  try {
    const kvKey = key.startsWith("brand:") ? key : `brand:${key}`;
    const data = await env.BRANDS.get(kvKey);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error("[getBrand] KV error:", e.message);
    if (brandsCache) return brandsCache[key] || null;
    return null;
  }
}
__name(getBrand, "getBrand");
async function setBrand(env, key, brand) {
  const kvKey = key.startsWith("brand:") ? key : `brand:${key}`;
  await env.BRANDS.put(kvKey, JSON.stringify(brand));
  if (brandsCache) {
    brandsCache[key] = brand;
  }
  invalidateCache();
}
__name(setBrand, "setBrand");
async function deleteBrand(env, key) {
  const kvKey = key.startsWith("brand:") ? key : `brand:${key}`;
  await env.BRANDS.delete(kvKey);
  if (brandsCache) {
    delete brandsCache[key];
  }
  invalidateCache();
  try {
    const objects = await env.LOGOS.list({ prefix: `logos/${key.replace("brand:", "")}/` });
    for (const obj of objects.objects) {
      await env.LOGOS.delete(obj.key);
    }
  } catch (e) {
  }
}
__name(deleteBrand, "deleteBrand");
var KNOWN_BRAND_KEYS = [...new Set(Object.values(GHL_BRAND_MAP))];
async function getAllBrands(env) {
  if (brandsCache && Date.now() - brandsCacheTime < CACHE_TTL) {
    return brandsCache;
  }
  try {
    const brands = {};
    const fetches = KNOWN_BRAND_KEYS.map(async (key) => {
      try {
        const data = await env.BRANDS.get(`brand:${key}`, "json");
        if (data) brands[key] = data;
      } catch (e) {
      }
    });
    await Promise.all(fetches);
    try {
      const list = await env.BRANDS.list();
      for (const k of list.keys) {
        if (k.name.startsWith("brand:")) {
          const brandKey = k.name.replace("brand:", "");
          if (!brands[brandKey]) {
            const data = await env.BRANDS.get(k.name, "json");
            if (data) brands[brandKey] = data;
          }
        }
      }
    } catch (listErr) {
      console.log("[getAllBrands] list() unavailable, using known keys only");
    }
    brandsCache = brands;
    brandsCacheTime = Date.now();
    return brands;
  } catch (e) {
    console.error("[getAllBrands] KV error:", e.message);
    if (brandsCache) return brandsCache;
    return {};
  }
}
__name(getAllBrands, "getAllBrands");
async function fetchLocationData(env, locationId) {
  const url = `https://services.leadconnectorhq.com/locations/${locationId}`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.GHL_AGENCY_KEY}`,
      "Version": "2021-07-28",
      "Content-Type": "application/json"
    }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.location || data;
}
__name(fetchLocationData, "fetchLocationData");
async function fetchLocationCustomValues(env, locationId, apiKey) {
  const url = `https://rest.gohighlevel.com/v1/custom-values/`;
  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${apiKey}`
    }
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.customValues || [];
}
__name(fetchLocationCustomValues, "fetchLocationCustomValues");
function extractColorsFromCustomValues(customValues) {
  const colors = {};
  const valueMap = {};
  customValues.forEach((cv) => {
    if (cv.name && cv.value) {
      valueMap[cv.name.toLowerCase()] = cv.value;
    }
  });
  colors.gradLeft = valueMap["branding colors primary"] || valueMap["branding color primary"] || "#0066cc";
  colors.gradMid = valueMap["branding color secondary"] || "#0066cc";
  colors.textStrong = valueMap["primary color"] || "#000000";
  colors.gradRight = valueMap["secondary color"] || "#0066cc";
  colors.textMuted = valueMap["branding color text"] || "#666666";
  colors.logo = valueMap["company logo"] || valueMap["logo image url"];
  return colors;
}
__name(extractColorsFromCustomValues, "extractColorsFromCustomValues");
async function syncBrandFromGHL(env, locationId, brandKey) {
  const locationData = await fetchLocationData(env, locationId);
  if (!locationData) return null;
  let brand = await getBrand(env, brandKey) || {
    name: locationData.name || "Unknown",
    ids: [locationId],
    logo: null,
    colors: {},
    ghlSync: {}
  };
  if (!brand.ids.includes(locationId)) {
    brand.ids.push(locationId);
  }
  brand.ghlSync[locationId] = {
    syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    name: locationData.name
  };
  if (brand.ghlApiKey) {
    const customValues = await fetchLocationCustomValues(env, locationId, brand.ghlApiKey);
    if (customValues) {
      const extracted = extractColorsFromCustomValues(customValues);
      if (extracted.logo) brand.logo = extracted.logo;
      brand.colors = { ...brand.colors, ...extracted };
    }
  }
  await setBrand(env, brandKey, brand);
  return brand;
}
__name(syncBrandFromGHL, "syncBrandFromGHL");
async function syncAllBrandsFromGHL(env) {
  const results = {};
  for (const [locationId, brandKey] of Object.entries(GHL_BRAND_MAP)) {
    results[brandKey] = await syncBrandFromGHL(env, locationId, brandKey);
  }
  return results;
}
__name(syncAllBrandsFromGHL, "syncAllBrandsFromGHL");
async function autoDetectBrand(env, pathname) {
  const match = pathname.match(LOCATION_ID_REGEX);
  if (!match) return;
  const locationId = match[1];
  const brands = await getAllBrands(env);
  for (const [key, brand] of Object.entries(brands)) {
    if (brand.ids && brand.ids.includes(locationId)) return;
  }
  try {
    const locationData = await fetchLocationData(env, locationId);
    if (!locationData || !locationData.name) return;
    const brandKey = locationData.name.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 20) || locationId;
    const existing = await getBrand(env, brandKey);
    if (existing) {
      if (!existing.ids.includes(locationId)) {
        existing.ids.push(locationId);
        await setBrand(env, brandKey, existing);
      }
      return;
    }
    const newBrand = {
      name: locationData.name,
      ids: [locationId],
      logo: locationData.logoUrl || locationData.logo || null,
      colors: {
        gradLeft: "#1a1a2e",
        gradMid: "#16213e",
        gradRight: "#0f3460",
        gradUnderline: "#e94560",
        chipGreen: "#0f3460",
        surfaceBlue: "#E8F0FE",
        textStrong: "#1a1a2e",
        textMuted: "#424242"
      },
      ghlSync: {
        [locationId]: {
          syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
          name: locationData.name,
          autoDetected: true
        }
      }
    };
    await setBrand(env, brandKey, newBrand);
    console.log(`[Auto-Detect] Created brand "${brandKey}" for location ${locationId} (${locationData.name})`);
  } catch (e) {
    console.error(`[Auto-Detect] Failed for location ${locationId}:`, e.message);
  }
}
__name(autoDetectBrand, "autoDetectBrand");
async function buildBrandScript(env) {
  const brands = await getAllBrands(env);
  const brandsJson = JSON.stringify(brands);
  return `
<script data-injected-by="cf-brand-worker">
(function () {
  \'use strict\';

  var BRANDS = ${brandsJson};
  var lastBrandKey = null;

  function detectBrand() {
    var href = location.href;
    for (var brandKey in BRANDS) {
      if (!BRANDS.hasOwnProperty(brandKey)) continue;
      var brand = BRANDS[brandKey];
      if (!brand.ids) continue;
      for (var i = 0; i < brand.ids.length; i++) {
        if (href.indexOf(brand.ids[i]) !== -1) return brandKey;
      }
    }
    return null;
  }

  // \\u2500\\u2500 CSS custom properties \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
  function setCSSVars(c) {
    var root = document.documentElement;
    root.style.setProperty(\'--brand-primary\', c.gradLeft || \'\');
    root.style.setProperty(\'--brand-secondary\', c.gradMid || \'\');
    root.style.setProperty(\'--brand-accent\', c.gradRight || \'\');
    root.style.setProperty(\'--brand-underline\', c.gradUnderline || \'\');
    root.style.setProperty(\'--brand-chip\', c.chipGreen || \'\');
    root.style.setProperty(\'--brand-surface\', c.surfaceBlue || \'\');
    root.style.setProperty(\'--brand-text-strong\', c.textStrong || \'\');
    root.style.setProperty(\'--brand-text-muted\', c.textMuted || \'\');
  }

  // \\u2500\\u2500 Favicon swapping \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
  function setFavicon(logoUrl) {
    if (!logoUrl) return;
    [\'icon\', \'apple-touch-icon\'].forEach(function(rel) {
      var el = document.querySelector(\'link[rel="\' + rel + \'"]\');
      if (!el) { el = document.createElement(\'link\'); el.rel = rel; document.head.appendChild(el); }
      if (el.href !== logoUrl) el.href = logoUrl;
    });
  }

  // \\u2500\\u2500 Apply gradient + white text (skip popups) \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
  function applyBrandInlineStyles(brandKey) {
    var brand = BRANDS[brandKey];
    if (!brand || !brand.colors) return;
    document.documentElement.setAttribute(\'data-brand\', brandKey);
    var c = brand.colors;
    var hGrad = \'linear-gradient(90deg, \' + c.gradLeft + \', \' + c.gradMid + \' 55%, \' + c.gradRight + \')\';
    var vGrad = \'linear-gradient(180deg, \' + c.gradLeft + \', \' + c.gradMid + \' 55%, \' + c.gradRight + \')\';

    setCSSVars(c);
    setFavicon(brand.logo);

    var header = document.querySelector(\'header\') || document.querySelector(\'[role="banner"]\');
    if (header) {
      header.style.setProperty(\'background\', hGrad, \'important\');
      header.style.setProperty(\'background-image\', hGrad, \'important\');
      header.style.setProperty(\'border-bottom\', \'3px solid \' + (c.gradUnderline || c.gradRight), \'important\');
    }
    var sidebar = document.querySelector(\'aside\') || document.querySelector(\'[role="complementary"]\');
    if (sidebar) {
      sidebar.style.setProperty(\'background\', hGrad, \'important\');
      sidebar.style.setProperty(\'background-image\', hGrad, \'important\');
      sidebar.style.setProperty(\'border-right\', \'3px solid \' + (c.gradUnderline || c.gradRight), \'important\');
      sidebar.style.setProperty(\'color\', \'#ffffff\', \'important\');
      // Override GHL inner sidebar containers that paint their own gradient
      var innerContainers = sidebar.querySelectorAll(\'.lead-connector, [class*="flex-col"][class*="flex-grow"][class*="h-screen"]\');
      for (var ic = 0; ic < innerContainers.length; ic++) {
        innerContainers[ic].style.setProperty(\'background\', hGrad, \'important\');
        innerContainers[ic].style.setProperty(\'background-image\', hGrad, \'important\');
      }
      var sidebarAll = sidebar.querySelectorAll(\'*\');
      for (var s = 0; s < sidebarAll.length; s++) {
        var el = sidebarAll[s];
        var isPopup = false;
        var parent = el;
        while (parent && parent !== sidebar) {
          var pos = window.getComputedStyle(parent).position;
          if (pos === \'absolute\' || pos === \'fixed\') { isPopup = true; break; }
          parent = parent.parentElement;
        }
        if (!isPopup) el.style.setProperty(\'color\', \'#ffffff\', \'important\');
      }
    }
    if (header) {
      header.style.setProperty(\'color\', \'#ffffff\', \'important\');
      var headerAll = header.querySelectorAll(\'*\');
      for (var h = 0; h < headerAll.length; h++) {
        var hel = headerAll[h];
        var isHPopup = false;
        var hp = hel;
        while (hp && hp !== header) {
          var hpos = window.getComputedStyle(hp).position;
          if (hpos === \'absolute\' || hpos === \'fixed\') { isHPopup = true; break; }
          hp = hp.parentElement;
        }
        if (!isHPopup) hel.style.setProperty(\'color\', \'#ffffff\', \'important\');
      }
    }
    // Also target complementary if sidebar was found via aside (both may exist)
    var comp = document.querySelector(\'[role="complementary"]\');
    if (comp && comp !== sidebar) {
      comp.style.setProperty(\'background\', vGrad, \'important\');
      comp.style.setProperty(\'background-image\', vGrad, \'important\');
      comp.style.setProperty(\'color\', \'#ffffff\', \'important\');
      var compAll = comp.querySelectorAll(\'*\');
      for (var ci = 0; ci < compAll.length; ci++) {
        var cel = compAll[ci];
        var isCPopup = false;
        var cp = cel;
        while (cp && cp !== comp) {
          var cpos = window.getComputedStyle(cp).position;
          if (cpos === \'absolute\' || cpos === \'fixed\') { isCPopup = true; break; }
          cp = cp.parentElement;
        }
        if (!isCPopup) cel.style.setProperty(\'color\', \'#ffffff\', \'important\');
      }
    }
  }

  // \\u2500\\u2500 Logo swapping \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
  function updateLogos(brandKey) {
    var brand = BRANDS[brandKey];
    if (!brand || !brand.logo) return;
    var selectors = [\'img.agency-logo\',\'img[alt*="logo" i]\',\'img[alt*="agency" i]\',\'[class*="logo"] img\',\'img[class*="logo"]\',\'.agency-logo-container img\'];
    selectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(img) {
          if (img.src !== brand.logo && img.src.indexOf(\'brand-assets\') === -1) {
            img.src = brand.logo;
            img.style.setProperty(\'max-height\', \'100px\', \'important\');
            img.style.setProperty(\'width\', \'auto\', \'important\');
            img.style.setProperty(\'object-fit\', \'contain\', \'important\');
          }
        });
      } catch (e) {}
    });
  }

  // \\u2500\\u2500 Main apply function \\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500
  function applyBrand() {
    var currentBrand = detectBrand();
    if (!currentBrand) {
      document.documentElement.removeAttribute(\'data-brand\');
      lastBrandKey = null;
      return;
    }
    if (currentBrand !== lastBrandKey) lastBrandKey = currentBrand;
    applyBrandInlineStyles(currentBrand);
    updateLogos(currentBrand);
  }

  // SPA navigation hooks
  var _push = history.pushState.bind(history);
  var _replace = history.replaceState.bind(history);
  history.pushState = function () { _push.apply(history, arguments); setTimeout(applyBrand, 150); };
  history.replaceState = function () { _replace.apply(history, arguments); setTimeout(applyBrand, 150); };
  window.addEventListener(\'popstate\', function () { setTimeout(applyBrand, 150); });

  // MutationObserver for GHL Vue SPA re-renders
  if (document.body) {
    var observer = new MutationObserver(function () {
      if (lastBrandKey) applyBrandInlineStyles(lastBrandKey);
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  // Initial application
  setTimeout(applyBrand, 500);

  // Re-apply every 3s to catch GHL re-renders
  setInterval(function () {
    if (lastBrandKey) applyBrandInlineStyles(lastBrandKey);
  }, 3000);

  console.log(\'[CF Brand Worker] GHL Brand Manager v4.0 injected\');
})();
<\\/script>`;
}
__name(buildBrandScript, "buildBrandScript");
var ScriptInjector = class {
  static {
    __name(this, "ScriptInjector");
  }
  constructor(script) {
    this.script = script;
  }
  element(element) {
    element.append(this.script, { html: true });
  }
};
async function getAgencySettings(env) {
  const defaults = {
    agencyName: "The Listing Team",
    agencyLogo: "",
    contactEmail: "",
    contactPhone: "",
    defaultColors: {
      gradLeft: "#1a1a2e",
      gradMid: "#16213e",
      gradRight: "#0f3460",
      gradUnderline: "#e94560",
      chipGreen: "#0f3460",
      surfaceBlue: "#E8F0FE",
      textStrong: "#1a1a2e",
      textMuted: "#424242"
    },
    ghlAgencyKey: ""
  };
  const stored = await env.BRANDS.get("agency:settings", "json");
  return stored ? { ...defaults, ...stored } : defaults;
}
__name(getAgencySettings, "getAgencySettings");

async function setAgencySettings(env, settings) {
  await env.BRANDS.put("agency:settings", JSON.stringify(settings));
}
__name(setAgencySettings, "setAgencySettings");

async function setPasswordOverride(env, password) {
  await env.BRANDS.put("admin:password_override", password);
}
__name(setPasswordOverride, "setPasswordOverride");

async function handleAdminAPI(req, env, path) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  const passwordOverride = await env.BRANDS.get("admin:password_override");
  const validToken = passwordOverride ? token === passwordOverride : token === env.ADMIN_KEY;
  if (!validToken) {
    return new Response("Unauthorized", { status: 401 });
  }
  const method = req.method;
  const parts = path.split("/").filter(Boolean);
  if (method === "GET" && parts.length === 1 && parts[0] === "brands") {
    const brands = await getAllBrands(env);
    return new Response(JSON.stringify(brands), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "GET" && parts.length === 2 && parts[0] === "brands") {
    const brand = await getBrand(env, parts[1]);
    return new Response(JSON.stringify(brand || {}), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "POST" && parts.length === 1 && parts[0] === "brands") {
    const body = await req.json();
    const key = body.key || crypto.randomUUID();
    await setBrand(env, key, body);
    return new Response(JSON.stringify({ key, ...body }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "PUT" && parts.length === 2 && parts[0] === "brands") {
    const body = await req.json();
    const existing = await getBrand(env, parts[1]) || {};
    const merged = { ...existing, ...body };
    if (body.colors && existing.colors) {
      merged.colors = { ...existing.colors, ...body.colors };
    }
    await setBrand(env, parts[1], merged);
    return new Response(JSON.stringify(merged), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "DELETE" && parts.length === 2 && parts[0] === "brands") {
    await deleteBrand(env, parts[1]);
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "POST" && parts.length === 3 && parts[0] === "brands" && parts[2] === "sync-colors") {
    const brandKey = parts[1];
    const brand = await getBrand(env, brandKey);
    if (!brand || !brand.ghlApiKey || !brand.ids || brand.ids.length === 0) {
      return new Response(JSON.stringify({ error: "Brand not found or missing API key" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const locationId = brand.ids[0];
    const customValues = await fetchLocationCustomValues(env, locationId, brand.ghlApiKey);
    if (!customValues) {
      return new Response(JSON.stringify({ error: "Failed to fetch custom values" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    const extracted = extractColorsFromCustomValues(customValues);
    if (extracted.logo) brand.logo = extracted.logo;
    brand.colors = { ...brand.colors, ...extracted };
    await setBrand(env, brandKey, brand);
    return new Response(JSON.stringify(brand), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "POST" && parts.length === 1 && parts[0] === "sync") {
    const results = await syncAllBrandsFromGHL(env);
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "GET" && parts.length === 1 && parts[0] === "export") {
    const brands = await getAllBrands(env);
    return new Response(JSON.stringify(brands, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": "attachment; filename=brands-backup.json"
      }
    });
  }
  if (method === "POST" && parts.length === 1 && parts[0] === "import") {
    const brands = await req.json();
    for (const [key, brand] of Object.entries(brands)) {
      await setBrand(env, key, brand);
    }
    return new Response(JSON.stringify({ success: true, count: Object.keys(brands).length }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "GET" && parts.length === 1 && parts[0] === "agency-settings") {
    const settings = await getAgencySettings(env);
    return new Response(JSON.stringify(settings), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (method === "PUT" && parts.length === 1 && parts[0] === "agency-settings") {
    try {
      const settings = await req.json();
      await setAgencySettings(env, settings);
      return new Response(JSON.stringify({ success: true, settings }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
  }
  if (method === "PUT" && parts.length === 1 && parts[0] === "change-password") {
    try {
      const body = await req.json();
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return new Response(JSON.stringify({ error: "currentPassword and newPassword required" }), {
          status: 400, headers: { "Content-Type": "application/json" }
        });
      }
      const pwOverride = await env.BRANDS.get("admin:password_override");
      const validPw = pwOverride ? currentPassword === pwOverride : currentPassword === env.ADMIN_KEY;
      if (!validPw) {
        return new Response(JSON.stringify({ error: "Current password is incorrect" }), {
          status: 401, headers: { "Content-Type": "application/json" }
        });
      }
      await setPasswordOverride(env, newPassword);
      return new Response(JSON.stringify({ success: true, message: "Password changed" }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }
  }
  return new Response("Not Found", { status: 404 });
}
__name(handleAdminAPI, "handleAdminAPI");
function getAdminHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GHL Brand Manager</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\\/script>
  <script src="https://cdn.tailwindcss.com"><\\/script>
  <style>
    [data-testid="root"] { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef } = React;

    function PasswordChangeForm({ apiCall }) {
      const [currentPassword, setCurrentPassword] = useState(\'\');
      const [newPassword, setNewPassword] = useState(\'\');
      const [confirmPassword, setConfirmPassword] = useState(\'\');
      const [pwMsg, setPwMsg] = useState(\'\');
      const [pwErr, setPwErr] = useState(\'\');

      const handleChangePassword = async (e) => {
        e.preventDefault();
        setPwMsg(\'\'); setPwErr(\'\');
        if (newPassword !== confirmPassword) {
          setPwErr(\'New passwords do not match\');
          return;
        }
        if (newPassword.length < 4) {
          setPwErr(\'Password must be at least 4 characters\');
          return;
        }
        try {
          const key = localStorage.getItem(\'brandAdminKey\') || \'\';
          const res = await fetch(\'/__admin/api/change-password\', {
            method: \'PUT\',
            headers: { \'Authorization\': \'Bearer \' + key, \'Content-Type\': \'application/json\' },
            body: JSON.stringify({ currentPassword, newPassword })
          });
          const data = await res.json();
          if (!res.ok) { setPwErr(data.error || \'Failed to change password\'); return; }
          localStorage.setItem(\'brandAdminKey\', newPassword);
          setPwMsg(\'Password changed successfully!\');
          setCurrentPassword(\'\'); setNewPassword(\'\'); setConfirmPassword(\'\');
        } catch (err) {
          setPwErr(\'Error: \' + err.message);
        }
      };

      return (
        <form onSubmit={handleChangePassword} className="space-y-3">
          <h3 className="font-bold text-lg border-b pb-2">Change Admin Password</h3>
          {pwMsg && <div className="bg-green-100 text-green-700 p-2 rounded text-sm">{pwMsg}</div>}
          {pwErr && <div className="bg-red-100 text-red-700 p-2 rounded text-sm">{pwErr}</div>}
          <input type="password" placeholder="Current Password" value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="password" placeholder="New Password" value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="password" placeholder="Confirm New Password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition">
            Change Password
          </button>
        </form>
      );
    }

    function AgencySettingsPanel({ apiCall, onClose }) {
      const [settings, setSettings] = useState(null);
      const [saving, setSaving] = useState(false);
      const [msg, setMsg] = useState(\'\');
      const [errMsg, setErrMsg] = useState(\'\');

      useEffect(() => {
        loadSettings();
      }, []);

      const loadSettings = async () => {
        try {
          const data = await apiCall(\'/agency-settings\');
          setSettings(data);
        } catch (err) {
          setErrMsg(\'Failed to load settings\');
        }
      };

      const saveSettings = async () => {
        setSaving(true); setMsg(\'\'); setErrMsg(\'\');
        try {
          await apiCall(\'/agency-settings\', \'PUT\', settings);
          setMsg(\'Settings saved!\');
          setTimeout(() => setMsg(\'\'), 3000);
        } catch (err) {
          setErrMsg(\'Failed to save: \' + err.message);
        } finally {
          setSaving(false);
        }
      };

      const handleField = (field, value) => {
        setSettings({ ...settings, [field]: value });
      };

      const handleColor = (colorField, value) => {
        setSettings({
          ...settings,
          defaultColors: { ...settings.defaultColors, [colorField]: value }
        });
      };

      if (!settings) return (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex justify-end">
          <div className="w-96 bg-white h-full shadow-xl p-6">Loading...</div>
        </div>
      );

      return (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex justify-end">
          <div className="w-[420px] bg-white h-full shadow-xl overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold">Agency Settings</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-6">
              {msg && <div className="bg-green-100 text-green-700 p-3 rounded">{msg}</div>}
              {errMsg && <div className="bg-red-100 text-red-700 p-3 rounded">{errMsg}</div>}

              <div className="space-y-3">
                <h3 className="font-bold text-lg border-b pb-2">Agency Identity</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agency Name</label>
                  <input type="text" value={settings.agencyName || \'\'} onChange={(e) => handleField(\'agencyName\', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agency Logo URL</label>
                  <input type="text" value={settings.agencyLogo || \'\'} onChange={(e) => handleField(\'agencyLogo\', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {settings.agencyLogo && <img src={settings.agencyLogo} alt="Logo" className="mt-2 h-12 object-contain" />}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input type="email" value={settings.contactEmail || \'\'} onChange={(e) => handleField(\'contactEmail\', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input type="text" value={settings.contactPhone || \'\'} onChange={(e) => handleField(\'contactPhone\', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-lg border-b pb-2">Default Theme Colors</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[\'gradLeft\', \'gradMid\', \'gradRight\', \'gradUnderline\', \'chipGreen\', \'surfaceBlue\', \'textStrong\', \'textMuted\'].map(field => (
                    <div key={field}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{field}</label>
                      <div className="flex gap-1">
                        <input type="color" value={settings.defaultColors?.[field] || \'#000000\'}
                          onChange={(e) => handleColor(field, e.target.value)}
                          className="w-10 h-8 border border-gray-300 rounded cursor-pointer" />
                        <input type="text" value={settings.defaultColors?.[field] || \'#000000\'}
                          onChange={(e) => handleColor(field, e.target.value)}
                          className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-bold text-lg border-b pb-2">GHL Agency Key</h3>
                <input type="text" value={settings.ghlAgencyKey || \'\'} onChange={(e) => handleField(\'ghlAgencyKey\', e.target.value)}
                  placeholder="GHL Agency API Key"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <button onClick={saveSettings} disabled={saving}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded font-medium transition">
                {saving ? \'Saving...\' : \'Save Settings\'}
              </button>

              <PasswordChangeForm apiCall={apiCall} />
            </div>
          </div>
        </div>
      );
    }

    function App() {
      const [authenticated, setAuthenticated] = useState(false);
      const [password, setPassword] = useState(\'\');
      const [apiKey, setApiKey] = useState(localStorage.getItem(\'brandAdminKey\') || \'\');
      const [brands, setBrands] = useState({});
      const [loading, setLoading] = useState(false);
      const [editing, setEditing] = useState(null);
      const [previewing, setPreviewing] = useState(null);
      const [syncing, setSyncing] = useState(false);
      const [error, setError] = useState(\'\');
      const [success, setSuccess] = useState(\'\');
      const [showSettings, setShowSettings] = useState(false);
      const fileInputRef = useRef();

      useEffect(() => {
        const savedKey = localStorage.getItem(\'brandAdminKey\');
        if (savedKey) {
          fetch(\'/__admin/api/brands\', { headers: { \'Authorization\': \'Bearer \' + savedKey } })
            .then(res => { if (res.ok) return res.json(); throw new Error(\'bad\'); })
            .then(data => { setApiKey(savedKey); setAuthenticated(true); setBrands(data || {}); })
            .catch(() => localStorage.removeItem(\'brandAdminKey\'));
        }
      }, []);

      const apiCall = async (endpoint, method = \'GET\', body = null) => {
        const key = apiKey || password;
        const opts = {
          method,
          headers: {
            \'Authorization\': \'Bearer \' + key,
            \'Content-Type\': \'application/json\',
          },
        };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(\'/__admin/api\' + endpoint, opts);
        if (res.status === 401) {
          setAuthenticated(false);
          localStorage.removeItem(\'brandAdminKey\');
          throw new Error(\'Unauthorized\');
        }
        return res.json();
      };

      const handleLogin = async (e) => {
        e.preventDefault();
        setError(\'\');
        try {
          const key = password;
          const res = await fetch(\'/__admin/api/brands\', {
            headers: { \'Authorization\': \'Bearer \' + key },
          });
          if (!res.ok) throw new Error(\'Auth failed\');
          const data = await res.json();
          setApiKey(key);
          localStorage.setItem(\'brandAdminKey\', key);
          setAuthenticated(true);
          setBrands(data || {});
          setPassword(\'\');
        } catch (err) {
          setError(\'Incorrect password. Please try again.\');
        }
      };

      const loadBrands = async () => {
        try {
          setLoading(true);
          const data = await apiCall(\'/brands\');
          setBrands(data || {});
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      };

      const saveBrand = async (key, brand) => {
        try {
          await apiCall(\\`/brands\\${key ? \'/\' + key : \'\'}\\`, key ? \'PUT\' : \'POST\', { key, ...brand });
          await loadBrands();
          setEditing(null);
        } catch (err) {
          alert(\'Failed to save brand: \' + err.message);
        }
      };

      const deleteBrand = async (key) => {
        if (!confirm(\'Delete this brand?\')) return;
        try {
          await apiCall(\\`/brands/\\${key}\\`, \'DELETE\');
          await loadBrands();
        } catch (err) {
          alert(\'Failed to delete: \' + err.message);
        }
      };

      const handleSyncBrand = async (key) => {
        try {
          setSyncing(key);
          await apiCall(\\`/brands/\\${key}/sync-colors\\`, \'POST\');
          await loadBrands();
          setSuccess(\\`\\${key} synced!\\`);
          setTimeout(() => setSuccess(\'\'), 2000);
        } catch (err) {
          alert(\'Sync failed for \' + key + \': \' + err.message);
        } finally {
          setSyncing(false);
        }
      };

      const handleExport = async () => {
        try {
          const res = await fetch(\\`/__admin/api/export\\`, {
            headers: { \'Authorization\': \'Bearer \' + apiKey },
          });
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement(\'a\');
          a.href = url;
          a.download = \'brands-backup.json\';
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          alert(\'Export failed: \' + err.message);
        }
      };

      const handleImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await apiCall(\'/import\', \'POST\', data);
          await loadBrands();
          alert(\'Import complete!\');
        } catch (err) {
          alert(\'Import failed: \' + err.message);
        }
        e.target.value = \'\';
      };

      if (!authenticated) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-600 to-blue-600">
            <form onSubmit={handleLogin} className="bg-white rounded-lg shadow-xl p-8 w-96">
              <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">Brand Manager</h1>
              <input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition"
              >
                Login
              </button>
            </form>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white shadow">
            <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-900">Brand Manager</h1>
              <div className="flex gap-2">
                <button
                  onClick={handleExport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Export
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: \'none\' }}
                />
                <button
                  onClick={() => setEditing({ key: \'\', name: \'\', ids: [], logo: \'\', ghlApiKey: \'\', colors: {} })}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  + Add Brand
                </button>
                <button
                  onClick={() => { setAuthenticated(false); setBrands({}); }}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Logout
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Settings
                </button>
              </div>
            </div>
          </header>

          {loading && <div className="text-center py-8">Loading...</div>}

          <div className="max-w-7xl mx-auto px-4 py-8">
            {Object.keys(brands).length === 0 && !loading && (
              <div className="text-center text-gray-500 py-12">
                No brands yet. Click "+ Add Brand" to get started.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(brands).map(([key, brand]) => (
                <div key={key} className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden">
                  <div
                    className="h-24 bg-gradient-to-r flex items-center justify-center"
                    style={{
                      backgroundImage: \\`linear-gradient(90deg, \\${brand.colors?.gradLeft || \'#0066cc\'}, \\${brand.colors?.gradMid || \'#0066cc\'}, \\${brand.colors?.gradRight || \'#0066cc\'})\\`,
                    }}
                  >
                    {brand.logo && <img src={brand.logo} alt={brand.name} className="h-16 max-w-full object-contain drop-shadow-lg" />}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg mb-2">{brand.name || \'Unnamed\'}</h3>
                    <p className="text-sm text-gray-600 mb-2">Key: {key}</p>
                    <p className="text-sm text-gray-600 mb-2">Locations: {(brand.ids || []).join(\', \')}</p>
                    <div className="flex gap-1 mb-4">
                      {Object.values(brand.colors || {}).slice(0, 5).map((color, i) => (
                        typeof color === \'string\' && color.startsWith(\'#\') && (
                          <div
                            key={i}
                            className="w-6 h-6 rounded border border-gray-300"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        )
                      ))}
                    </div>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => setEditing({ key, ...brand })}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-medium transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleSyncBrand(key)}
                        disabled={syncing === key}
                        className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-2 rounded text-sm font-medium transition"
                      >
                        {syncing === key ? \'Syncing...\' : \'Sync\'}
                      </button>
                      <button
                        onClick={() => setPreviewing({ key, ...brand })}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm font-medium transition"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => deleteBrand(key)}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-medium transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editing && (
            <BrandEditor
              brand={editing}
              onSave={saveBrand}
              onCancel={() => setEditing(null)}
              apiCall={apiCall}
            />
          )}

          {previewing && (
            <BrandPreview
              brand={previewing}
              onClose={() => setPreviewing(null)}
            />
          )}

          {showSettings && (
            <AgencySettingsPanel
              apiCall={apiCall}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      );
    }

    function BrandEditor({ brand, onSave, onCancel, apiCall }) {
      const [data, setData] = useState(brand);
      const canvasRef = useRef();

      const handleChange = (field, value) => {
        setData({ ...data, [field]: value });
      };

      const handleColorChange = (colorField, value) => {
        setData({
          ...data,
          colors: { ...data.colors, [colorField]: value },
        });
      };

      const handleExtractPalette = async () => {
        if (!data.logo) {
          alert(\'Please set a logo URL first\');
          return;
        }

        const img = new Image();
        img.crossOrigin = \'anonymous\';
        img.onload = () => {
          const canvas = canvasRef.current;
          canvas.width = 100;
          canvas.height = 100;
          const ctx = canvas.getContext(\'2d\');
          ctx.drawImage(img, 0, 0, 100, 100);

          const imageData = ctx.getImageData(0, 0, 100, 100);
          const pixels = imageData.data;
          const colorFreq = {};

          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            const color = \\`#\\${((r << 16) | (g << 8) | b).toString(16).padStart(6, \'0\')}\\`;
            colorFreq[color] = (colorFreq[color] || 0) + 1;
          }

          const sorted = Object.entries(colorFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([color]) => color);

          if (sorted.length > 0) {
            setData({
              ...data,
              colors: {
                ...data.colors,
                gradLeft: sorted[0],
                gradMid: sorted[Math.floor(sorted.length / 2)],
                gradRight: sorted[sorted.length - 1],
              },
            });
          }
        };
        img.onerror = () => alert(\'Failed to load image\');
        img.src = data.logo;
      };

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-screen overflow-y-auto p-6">
            <h2 className="text-2xl font-bold mb-4">{data.key ? \'Edit\' : \'New\'} Brand</h2>

            {!data.key && (
              <input
                type="text"
                placeholder="Brand Key"
                value={data.key || \'\'}
                onChange={(e) => handleChange(\'key\', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            <input
              type="text"
              placeholder="Brand Name"
              value={data.name || \'\'}
              onChange={(e) => handleChange(\'name\', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <textarea
              placeholder="Location IDs (comma-separated)"
              value={(data.ids || []).join(\', \')}
              onChange={(e) => handleChange(\'ids\', e.target.value.split(\',\').map(x => x.trim()))}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="2"
            />

            <input
              type="text"
              placeholder="Logo URL"
              value={data.logo || \'\'}
              onChange={(e) => handleChange(\'logo\', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="text"
              placeholder="GHL Location API Key (optional)"
              value={data.ghlApiKey || \'\'}
              onChange={(e) => handleChange(\'ghlApiKey\', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={handleExtractPalette}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded mb-4 font-medium transition"
            >
              Extract Palette from Logo
            </button>

            <div className="grid grid-cols-2 gap-4 mb-4">
              {[\'gradLeft\', \'gradMid\', \'gradRight\', \'gradUnderline\', \'chipGreen\', \'surfaceBlue\', \'textStrong\', \'textMuted\'].map(field => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field}</label>
                  <input
                    type="color"
                    value={data.colors?.[field] || \'#0066cc\'}
                    onChange={(e) => handleColorChange(field, e.target.value)}
                    className="w-full h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={data.colors?.[field] || \'#0066cc\'}
                    onChange={(e) => handleColorChange(field, e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="#000000"
                  />
                </div>
              ))}
            </div>

            <div
              className="h-16 rounded mb-4 border border-gray-300"
              style={{
                backgroundImage: \\`linear-gradient(90deg, \\${data.colors?.gradLeft || \'#0066cc\'}, \\${data.colors?.gradMid || \'#0066cc\'}, \\${data.colors?.gradRight || \'#0066cc\'})\\`,
              }}
            />

            <canvas ref={canvasRef} style={{ display: \'none\' }} />

            <div className="flex gap-2">
              <button
                onClick={() => onSave(data.key, data)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition"
              >
                Save
              </button>
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    function BrandPreview({ brand, onClose }) {
      const colors = brand.colors || {};
      const gradient = \\`linear-gradient(90deg, \\${colors.gradLeft || \'#0066cc\'}, \\${colors.gradMid || \'#0066cc\'}, \\${colors.gradRight || \'#0066cc\'})\\`;

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold mb-6">{brand.name} - Preview</h2>

            <div className="border border-gray-300 rounded-lg overflow-hidden mb-6">
              <div
                className="h-16 flex items-center px-6 text-white font-bold text-xl"
                style={{ background: gradient }}
              >
                <span>{brand.logo && <span className="mr-3">\\u{1F4CB}</span>} {brand.name}</span>
              </div>

              <div className="flex h-96">
                <div
                  className="w-64 text-white p-4 space-y-4"
                  style={{ background: gradient }}
                >
                  <div className="font-bold py-2">Navigation</div>
                  <div className="py-2 opacity-80">Accounts</div>
                  <div className="py-2 opacity-80">Contacts</div>
                  <div className="py-2 opacity-80">Campaigns</div>
                  <div className="py-2 opacity-80">Reports</div>
                </div>

                <div className="flex-1 p-6 bg-gray-50">
                  <h3 className="text-lg font-bold mb-4" style={{ color: colors.textStrong }}>Content Area</h3>
                  <p className="text-gray-600 mb-4">This is how your brand colors will appear in GHL.</p>

                  <div className="grid grid-cols-2 gap-4">
                    {[\'gradLeft\', \'gradMid\', \'gradRight\', \'chipGreen\'].map(field => (
                      <div key={field} className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded"
                          style={{ backgroundColor: colors[field] }}
                        />
                        <span className="text-sm font-medium">{field}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    const root = ReactDOM.createRoot(document.getElementById(\'root\'));
    root.render(<App />);
  <\\/script>
</body>
</html>
  `;
}
__name(getAdminHTML, "getAdminHTML");
var worker_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    if (pathname === "/__brand-worker/health") {
      const brands = await getAllBrands(env);
      return new Response(JSON.stringify({
        ok: true,
        worker: "ghl-brand-injector",
        version: "4.0",
        origin: "app.gohighlevel.com",
        brandCount: Object.keys(brands).length,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (pathname.startsWith("/__brand-assets/")) {
      const r2Key = pathname.replace("/__brand-assets/", "");
      const object = await env.LOGOS.get(r2Key);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      headers.set("Content-Type", object.httpMetadata?.contentType || "image/png");
      headers.set("Cache-Control", "public, max-age=86400");
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(object.body, { headers });
    }
    if (pathname === "/__admin") {
      return new Response(getAdminHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (pathname.startsWith("/__admin/api/")) {
      return handleAdminAPI(req, env, pathname.replace("/__admin/api", ""));
    }
    const originUrl = new URL(pathname + url.search, "https://app.gohighlevel.com");
    const fwdHeaders = new Headers(req.headers);
    fwdHeaders.set("Host", "app.gohighlevel.com");
    fwdHeaders.delete("cf-connecting-ip");
    fwdHeaders.delete("cf-ipcountry");
    fwdHeaders.delete("cf-ray");
    fwdHeaders.delete("cf-visitor");
    let originResponse;
    try {
      originResponse = await fetch(originUrl.toString(), {
        method: req.method,
        headers: fwdHeaders,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : void 0,
        redirect: "manual"
      });
    } catch (err) {
      return new Response("Origin fetch failed: " + err.message, { status: 502 });
    }
    if ([301, 302, 303, 307, 308].includes(originResponse.status)) {
      const loc = originResponse.headers.get("Location");
      if (loc) {
        const newLoc = loc.replace("https://app.gohighlevel.com", "https://" + url.hostname).replace("http://app.gohighlevel.com", "https://" + url.hostname);
        const rHeaders = new Headers(originResponse.headers);
        rHeaders.set("Location", newLoc);
        return new Response(null, { status: originResponse.status, headers: rHeaders });
      }
      return originResponse;
    }
    const ct = originResponse.headers.get("Content-Type") || "";
    if (!ct.includes("text/html")) return originResponse;
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(autoDetectBrand(env, pathname).catch((e) => console.error("[AutoDetect]", e.message)));
    }
    try {
      const brandScript = await buildBrandScript(env);
      const response = new HTMLRewriter().on("head", new ScriptInjector(brandScript)).transform(originResponse);
      const respHeaders = new Headers(response.headers);
      respHeaders.set("X-Brand-Worker", "v4.0");
      respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      return new Response(response.body, { status: response.status, headers: respHeaders });
    } catch (e) {
      console.error("[BrandInject] Error:", e.message);
      return originResponse;
    }
  },
  async scheduled(event, env) {
    await syncAllBrandsFromGHL(env);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
\r
