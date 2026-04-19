var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    try {
      if (path === "/api/submit-post" && request.method === "POST") return await handleSubmitPost(request, env, corsHeaders);
      if (path === "/api/sessions" && request.method === "GET") return await handleGetSessions(env, corsHeaders);
      if (path === "/api/sessions/export/csv" && request.method === "GET") return await handleExportCSV(env, corsHeaders);
      if (path.startsWith("/api/sessions/") && request.method === "DELETE") return await handleDeleteSession(path.split("/api/sessions/")[1], env, corsHeaders);
      if (path === "/api/submit-blog" && request.method === "POST") return await handleSubmitBlog(request, env, corsHeaders);
      if (path === "/api/blogs" && request.method === "GET") return await handleGetBlogs(env, corsHeaders);
      if (path === "/api/blogs/export/csv" && request.method === "GET") return await handleExportBlogCSV(env, corsHeaders);
      if (path.match(/^\/api\/blogs\/[^/]+\/csv$/) && request.method === "GET") {
        const blogId = path.split("/api/blogs/")[1].replace("/csv", "");
        return await handleExportSingleBlogCSV(blogId, env, corsHeaders);
      }
      if (path === "/api/spin" && request.method === "POST") return await handleSpinContent(request, env, corsHeaders);
      if (path === "/api/extract-text" && request.method === "POST") return await handleExtractText(request, env, corsHeaders);
      if (path.startsWith("/api/blogs/") && request.method === "DELETE") return await handleDeleteBlog(path.split("/api/blogs/")[1], env, corsHeaders);
      if (path === "/api/bulk-submit" && request.method === "POST") return await handleBulkSubmit(request, env, corsHeaders);
      if (path === "/api/ai-write" && request.method === "POST") return await handleAIWrite(request, env, corsHeaders);
      if (path === "/api/locations" && request.method === "GET") return await handleGetLocations(env, corsHeaders);
      if (path === "/api/domains" && request.method === "GET") return await handleGetDomains(env, corsHeaders);
      if (path === "/api/health") return jsonResponse({ status: "healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() }, corsHeaders);
      if (path === "/blog" || path === "/blog/") return new Response(BLOG_PAGE, { headers: { "Content-Type": "text/html;charset=UTF-8", ...corsHeaders } });
      if (path === "/bulk" || path === "/bulk/") return new Response(BULK_PAGE, { headers: { "Content-Type": "text/html;charset=UTF-8", ...corsHeaders } });
      return new Response(HTML_PAGE, { headers: { "Content-Type": "text/html;charset=UTF-8", ...corsHeaders } });
    } catch (err) {
      return jsonResponse({ error: err.message }, corsHeaders, 500);
    }
  }
};
function jsonResponse(data, corsHeaders, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
__name(jsonResponse, "jsonResponse");
function generateId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
__name(generateId, "generateId");
function seoRenameImage(originalName, content, index) {
  const ext = (originalName || "image.jpg").split(".").pop().toLowerCase();
  const words = content.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "for", "that", "this", "with", "from", "are", "was", "has", "have"].includes(w)).slice(0, 5);
  const slug = words.length > 0 ? words.join("-") : "social-post";
  return `${slug}-${index + 1}-${Date.now().toString(36)}.${ext}`;
}
__name(seoRenameImage, "seoRenameImage");
function generateHashtagsTemplate(content) {
  const keywords = content.toLowerCase().split(/\s+/).filter((word) => word.length > 4 && !["that", "this", "from", "with", "have", "been"].includes(word)).slice(0, 5);
  const generatedTags = keywords.map((keyword) => `#${keyword.replace(/[^a-z0-9]/g, "")}`);
  return [...generatedTags, "#socialmedia", "#marketing", "#business", "#growth"].slice(0, 10);
}
__name(generateHashtagsTemplate, "generateHashtagsTemplate");
async function getAllSessions(env) {
  const list = await env.SESSIONS.list();
  const sessions = [];
  for (const key of list.keys) {
    if (key.name.startsWith("__")) continue;
    const val = await env.SESSIONS.get(key.name, "json");
    if (val && val.sessionId) sessions.push(val);
  }
  return sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
__name(getAllSessions, "getAllSessions");
async function handleSubmitPost(request, env, corsHeaders) {
  const body = await request.json();
  const requestId = generateId();
  const {
    postContent,
    scheduledDateTime,
    platforms = [],
    externalLink,
    ghlBusiness,
    imageFiles = [],
    videoFiles = [],
    postAtSpecificTime,
    content,
    link
  } = body;
  const resolvedContent = postContent || content || "";
  const resolvedDateTime = scheduledDateTime || postAtSpecificTime || "";
  const resolvedLink = externalLink || link || "";
  if (!resolvedContent || !resolvedDateTime) return jsonResponse({ success: false, error: "Missing required fields" }, corsHeaders, 400);
  const dedupeKey = `${resolvedContent}_${resolvedDateTime}`;
  const existingSessions = await getAllSessions(env);
  if (existingSessions.some((s) => s.dedupeKey === dedupeKey)) {
    return jsonResponse({ success: true, isDuplicate: true, message: "Duplicate post detected", data: { generatedHashtags: [], generatedCaption: resolvedContent, uploadedImages: [] } }, corsHeaders);
  }
  const generatedHashtags = generateHashtagsTemplate(resolvedContent);
  const generatedCaption = `${resolvedContent}

${generatedHashtags.join(" ")}`;
  const uploadedImages = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const img = imageFiles[i];
    const seoName = seoRenameImage(img.name, resolvedContent, i);
    const seoSlug = seoName.replace(/\.[^.]+$/, "");
    let uploadedUrl = "";
    if (env.IMAGE_SERVER_URL && env.IMAGE_SERVER_USERNAME) {
      try {
        const base64Data = img.data.split(",")[1];
        const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const blob = new Blob([binaryData], { type: img.type || "image/jpeg" });
        const formData = new FormData();
        formData.append("image", blob, seoName);
        formData.append("alt_title", resolvedContent.substring(0, 100));
        formData.append("description", resolvedContent.substring(0, 200));
        formData.append("slug", seoSlug);
        const uploadEndpoint = env.IMAGE_SERVER_UPLOAD || "/admin/api/images";
        const res = await fetch(`${env.IMAGE_SERVER_URL}${uploadEndpoint}`, {
          method: "POST",
          body: formData,
          headers: {
            "Authorization": `Basic ${btoa(`${env.IMAGE_SERVER_USERNAME}:${env.IMAGE_SERVER_PASSWORD}`)}`
          }
        });
        const data = await res.json();
        if (data.url) uploadedUrl = data.url;
        else if (data.slug) uploadedUrl = `${env.IMAGE_SERVER_URL}/images/${data.slug}`;
      } catch (e) {
        uploadedUrl = `[upload-error: ${e.message}]`;
      }
    }
    uploadedImages.push({ originalName: img.name, seoName, uploadedUrl: uploadedUrl || `[no-server: ${seoName}]`, type: img.type || "image" });
  }
  for (let i = 0; i < videoFiles.length; i++) {
    const vid = videoFiles[i];
    const seoName = seoRenameImage(vid.name, resolvedContent, imageFiles.length + i);
    const seoSlug = seoName.replace(/\.[^.]+$/, "");
    let videoUrl = "";
    if (env.IMAGE_SERVER_URL && env.IMAGE_SERVER_USERNAME) {
      try {
        const base64Data = vid.data.split(",")[1];
        const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const blob = new Blob([binaryData], { type: vid.type || "video/mp4" });
        const formData = new FormData();
        formData.append("video", blob, seoName);
        formData.append("alt_title", resolvedContent.substring(0, 100));
        formData.append("slug", seoSlug);
        const res = await fetch(`${env.IMAGE_SERVER_URL}${env.IMAGE_SERVER_UPLOAD || "/admin/api/images"}`, {
          method: "POST",
          body: formData,
          headers: { "Authorization": `Basic ${btoa(`${env.IMAGE_SERVER_USERNAME}:${env.IMAGE_SERVER_PASSWORD}`)}` }
        });
        const data = await res.json();
        videoUrl = data.url || `${env.IMAGE_SERVER_URL}/media/${data.slug || seoSlug}`;
      } catch (e) {
        videoUrl = `[upload-error: ${e.message}]`;
      }
    }
    uploadedImages.push({ originalName: vid.name, seoName, uploadedUrl: videoUrl || `[no-server: ${seoName}]`, type: vid.type || "video" });
  }
  const hostedMedia = uploadedImages.filter((img) => img.uploadedUrl && !img.uploadedUrl.startsWith("data:")).map((img) => ({ url: img.uploadedUrl, type: img.type?.startsWith("video") ? "video" : "image" }));
  let ghlPost = null;
  if (env.GHL_API_KEY && env.GHL_LOCATION_ID) {
    try {
      const ghlRes = await fetch(`${env.GHL_API_URL}/social-media-posting/${env.GHL_LOCATION_ID}/posts`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${env.GHL_API_KEY}`, "Content-Type": "application/json", "Version": "2021-07-28" },
        body: JSON.stringify({ body: generatedCaption, media: hostedMedia, scheduledAt: resolvedDateTime })
      });
      const ghlData = await ghlRes.json();
      ghlPost = { success: ghlRes.ok, ghl_post_id: ghlData.id || null, error: ghlData.message || null };
    } catch (e) {
      ghlPost = { success: false, error: e.message };
    }
  } else {
    ghlPost = { success: false, error: "GHL API not configured" };
  }
  const sessionImages = uploadedImages.map((img) => {
    const url = img.uploadedUrl && !img.uploadedUrl.startsWith("data:") ? img.uploadedUrl : `[local:${img.seoName}]`;
    return `${img.seoName} (${url})`;
  });
  await env.SESSIONS.put(requestId, JSON.stringify({
    sessionId: requestId,
    dedupeKey,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    scheduledDateTime: resolvedDateTime,
    postContent: resolvedContent,
    platforms: platforms.join(", "),
    ghlBusiness: ghlBusiness || "",
    externalLink: resolvedLink,
    uploadedImages: sessionImages.join(", "),
    generatedCaption,
    generatedHashtags: generatedHashtags.join(", "),
    ghlPostId: ghlPost?.ghl_post_id || "",
    ghlStatus: ghlPost?.success ? "Scheduled" : ghlPost?.error || "Not configured",
    errors: ""
  }));
  return jsonResponse({
    success: true,
    requestId,
    isDuplicate: false,
    sessionId: requestId,
    data: { uploadedImages, generatedHashtags, generatedCaption, excelFile: null, ghlPost },
    errors: []
  }, corsHeaders);
}
__name(handleSubmitPost, "handleSubmitPost");
async function handleGetSessions(env, corsHeaders) {
  return jsonResponse({ sessions: await getAllSessions(env), total: (await getAllSessions(env)).length }, corsHeaders);
}
__name(handleGetSessions, "handleGetSessions");
async function handleDeleteSession(id, env, corsHeaders) {
  if (!await env.SESSIONS.get(id)) return jsonResponse({ error: "Session not found" }, corsHeaders, 404);
  await env.SESSIONS.delete(id);
  return jsonResponse({ success: true }, corsHeaders);
}
__name(handleDeleteSession, "handleDeleteSession");
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
async function handleGetLocations(env, corsHeaders) {
  const locations = [];
  for (const [locationId, brandKey] of Object.entries(GHL_BRAND_MAP)) {
    let name = brandKey;
    try {
      const brandData = await env.BRANDS.get(`brand:${brandKey}`, "json");
      if (brandData && brandData.name) name = brandData.name;
    } catch (e) {
    }
    locations.push({ locationId, brandKey, name });
  }
  locations.sort((a, b) => a.name.localeCompare(b.name));
  return jsonResponse({ locations }, corsHeaders);
}
__name(handleGetLocations, "handleGetLocations");
async function handleGetDomains(env, corsHeaders) {
  const apiKey = env.GHL_AGENCY_KEY || env.GHL_API_KEY;
  try {
    const cached = await env.SESSIONS.get("__domains_cache", "json");
    if (cached && cached.domains?.length > 0) {
      const age = Date.now() - new Date(cached.cachedAt).getTime();
      if (age < 36e5) return jsonResponse(cached, corsHeaders);
    }
  } catch (e) {
  }
  if (!apiKey) {
    return jsonResponse({ error: "GHL API key not configured", domains: [] }, corsHeaders, 200);
  }
  const allDomains = [];
  const errors = [];
  for (const [locationId, brandKey] of Object.entries(GHL_BRAND_MAP)) {
    let brandName = brandKey;
    try {
      const brandData = await env.BRANDS.get(`brand:${brandKey}`, "json");
      if (brandData && brandData.name) brandName = brandData.name;
    } catch (e) {
    }
    try {
      const res = await fetch(`${env.GHL_API_URL || "https://services.leadconnectorhq.com"}/locations/${locationId}`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "Version": "2021-07-28", "Content-Type": "application/json" }
      });
      if (!res.ok) {
        allDomains.push({ locationId, brandKey, name: brandName, domains: [], website: "", domain: "" });
        continue;
      }
      const data = await res.json();
      const loc = data.location || data;
      const domains = [];
      if (loc.website) domains.push({ type: "website", url: loc.website });
      if (loc.domain) domains.push({ type: "custom_domain", url: loc.domain });
      if (loc.settings?.domain) domains.push({ type: "settings_domain", url: loc.settings.domain });
      allDomains.push({
        locationId,
        brandKey,
        name: brandName,
        businessName: loc.name || brandName,
        website: loc.website || "",
        domain: loc.domain || "",
        city: loc.city || "",
        state: loc.state || "",
        domains
      });
    } catch (e) {
      allDomains.push({ locationId, brandKey, name: brandName, domains: [], error: e.message });
      errors.push(`${brandKey}: ${e.message}`);
    }
  }
  const result = { domains: allDomains, cachedAt: (/* @__PURE__ */ new Date()).toISOString(), errors };
  await env.SESSIONS.put("__domains_cache", JSON.stringify(result));
  return jsonResponse(result, corsHeaders);
}
__name(handleGetDomains, "handleGetDomains");
async function handleExportCSV(env, corsHeaders) {
  const allSessions = await getAllSessions(env);
  const sessions = allSessions.filter((s) => s.sessionId && s.postContent);
  if (sessions.length === 0) return jsonResponse({ error: "No sessions to export" }, corsHeaders, 404);
  const ghlHeaders = ["postAtSpecificTime (YYYY-MM-DD HH:mm:ss)", "content", "link (OGmetaUrl)", "imageUrls", "gifUrl", "videoUrls"];
  const esc = /* @__PURE__ */ __name((v) => {
    const s = String(v || "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }, "esc");
  const rows = sessions.map((s) => {
    const rawMedia = s.uploadedImages || "";
    const imageUrls = [];
    const videoUrls = [];
    let gifUrl = "";
    const urlPattern = /https?:\/\/[^\s,)]+/g;
    const allUrls = rawMedia.match(urlPattern) || [];
    allUrls.forEach((url) => {
      const lower = url.toLowerCase();
      if (lower.includes(".gif")) {
        gifUrl = url;
      } else if (lower.includes(".mp4") || lower.includes(".mov") || lower.includes(".avi") || lower.includes("video")) {
        videoUrls.push(url);
      } else {
        imageUrls.push(url);
      }
    });
    const content = s.postContent || "";
    const link = s.externalLink || "";
    return [
      s.scheduledDateTime,
      // postAtSpecificTime (YYYY-MM-DD HH:mm:ss)
      content,
      // content
      link,
      // link (OGmetaUrl)
      imageUrls.join(","),
      // imageUrls (comma-separated public URLs)
      gifUrl,
      // gifUrl (single public URL)
      videoUrls.join(",")
      // videoUrls (comma-separated public URLs)
    ].map(esc).join(",");
  });
  return new Response([ghlHeaders.join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="social-posts-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`, ...corsHeaders }
  });
}
__name(handleExportCSV, "handleExportCSV");
var SYNONYMS = {
  // Real estate terms
  "home": "house,property,residence,dwelling",
  "house": "home,property,residence",
  "property": "home,house,residence,estate",
  "buy": "purchase,acquire,invest in",
  "purchase": "buy,acquire,invest in",
  "sell": "list,market,put on the market",
  "listing": "property listing,home for sale,available property",
  "agent": "realtor,real estate professional,broker",
  "realtor": "agent,real estate professional,broker",
  "market": "industry,sector,landscape",
  "neighborhood": "community,area,district,locale",
  "location": "area,spot,locale,neighborhood",
  "investment": "opportunity,asset,venture",
  "luxury": "upscale,premium,high-end,exclusive",
  "affordable": "budget-friendly,cost-effective,reasonably priced",
  "spacious": "roomy,expansive,generous",
  // Action words
  "find": "discover,locate,explore",
  "discover": "find,uncover,explore",
  "explore": "discover,browse,check out",
  "connect": "reach out,get in touch,contact",
  "contact": "reach out,connect with,get in touch with",
  "looking": "searching,seeking,hunting",
  "searching": "looking,seeking,browsing",
  "offer": "provide,deliver,present",
  "provide": "offer,deliver,supply",
  "help": "assist,support,guide",
  "learn": "discover,find out,understand",
  "understand": "grasp,comprehend,appreciate",
  "important": "crucial,essential,vital,key",
  "great": "excellent,outstanding,fantastic,remarkable",
  "beautiful": "stunning,gorgeous,attractive,lovely",
  "new": "brand new,fresh,latest,modern",
  "best": "top,finest,premier,leading",
  "perfect": "ideal,excellent,optimal",
  // Connectors
  "also": "additionally,moreover,furthermore",
  "however": "nevertheless,yet,on the other hand",
  "therefore": "consequently,as a result,thus",
  "because": "since,as,due to the fact that",
  "many": "numerous,several,a variety of",
  "very": "extremely,highly,remarkably",
  "show": "demonstrate,illustrate,highlight",
  "make": "create,build,develop",
  "get": "obtain,receive,acquire",
  "know": "understand,recognize,be aware of",
  "think": "believe,consider,feel",
  "want": "desire,wish,aim to",
  "need": "require,must have,call for",
  "like": "enjoy,appreciate,prefer",
  "good": "excellent,quality,solid,strong",
  "big": "large,substantial,significant,major",
  "small": "compact,modest,intimate",
  "old": "established,historic,classic",
  // Real estate specific
  "mortgage": "home loan,financing,lending",
  "closing": "settlement,finalizing,completion",
  "renovation": "remodel,upgrade,improvement",
  "inspection": "evaluation,assessment,examination",
  "appraisal": "valuation,assessment,evaluation",
  "equity": "ownership stake,home value,investment value",
  "downtown": "city center,urban core,central district",
  "suburban": "residential,outlying,family-friendly",
  "condo": "condominium,unit,apartment",
  "townhouse": "townhome,row house,attached home",
  "waterfront": "beachfront,oceanfront,coastal",
  "views": "vistas,panoramas,scenery",
  "community": "neighborhood,development,subdivision",
  "amenities": "features,perks,facilities",
  "schools": "education,school district,learning institutions",
  "commute": "travel,drive,transit"
};
function spinText(text, intensity = "medium") {
  if (!text) return text;
  const threshold = intensity === "light" ? 0.3 : intensity === "heavy" ? 0.8 : 0.5;
  const parts = text.split(/(<[^>]+>)/g);
  return parts.map((part) => {
    if (part.startsWith("<")) return part;
    const words = part.split(/(\s+)/);
    return words.map((word) => {
      if (/^\s+$/.test(word) || word.length < 3 || /^\d+$/.test(word) || /^https?:/.test(word)) return word;
      const lower = word.toLowerCase().replace(/[^a-z]/g, "");
      const syns = SYNONYMS[lower];
      if (!syns && Math.random() > threshold) return word;
      if (!syns) return word;
      const options = syns.split(",");
      if (Math.random() > threshold) return word;
      const replacement = options[Math.floor(Math.random() * options.length)].trim();
      if (word[0] === word[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1) + word.replace(/[a-zA-Z]+/, "").slice(replacement.length > 0 ? 0 : 0);
      }
      return replacement;
    }).join("");
  }).join("");
}
__name(spinText, "spinText");
function spinTitle(title) {
  return spinText(title, "light");
}
__name(spinTitle, "spinTitle");
function spinContent(content, intensity = "medium") {
  let spun = spinText(content, intensity);
  if (intensity === "heavy") {
    const paragraphs = spun.split(/(<\/p>\s*<p|<\/li>\s*<li)/gi);
    if (paragraphs.length > 4) {
      const mid = Math.floor(paragraphs.length / 2);
      if (mid > 1 && mid < paragraphs.length - 1) {
        [paragraphs[mid], paragraphs[mid - 1]] = [paragraphs[mid - 1], paragraphs[mid]];
      }
    }
    spun = paragraphs.join("");
  }
  return spun;
}
__name(spinContent, "spinContent");
async function handleSpinContent(request, env, corsHeaders) {
  const body = await request.json();
  const { title, content, metaDescription, intensity = "medium", count = 1 } = body;
  if (!content) return jsonResponse({ error: "Content is required" }, corsHeaders, 400);
  const variations = [];
  const maxCount = Math.min(count, 5);
  for (let i = 0; i < maxCount; i++) {
    variations.push({
      title: title ? spinTitle(title) : "",
      content: spinContent(content, intensity),
      metaDescription: metaDescription ? spinText(metaDescription, "light") : "",
      variation: i + 1
    });
  }
  return jsonResponse({ success: true, variations, original: { title, content, metaDescription } }, corsHeaders);
}
__name(handleSpinContent, "handleSpinContent");
var TAG_KEYWORDS = {
  "real estate": ["real estate", "realty", "properties", "mls", "listing", "listings"],
  "home buying": ["buy", "buying", "buyer", "purchase", "first-time", "homebuyer", "mortgage", "pre-approval"],
  "home selling": ["sell", "selling", "seller", "staging", "open house", "asking price"],
  "market update": ["market", "trend", "forecast", "inventory", "median price", "appreciation", "statistics"],
  "investment": ["invest", "investment", "roi", "rental", "cash flow", "cap rate", "portfolio", "flip"],
  "luxury homes": ["luxury", "premium", "high-end", "estate", "waterfront", "penthouse", "mansion"],
  "South Florida": ["miami", "fort lauderdale", "boca raton", "palm beach", "broward", "dade", "coral gables", "hollywood fl", "pompano", "delray"],
  "mortgage": ["mortgage", "loan", "rate", "interest", "financing", "lender", "pre-qualified", "fha", "va loan"],
  "home improvement": ["renovation", "remodel", "upgrade", "repair", "maintenance", "improvement", "diy"],
  "neighborhood": ["neighborhood", "community", "schools", "walkability", "amenities", "downtown", "suburban"],
  "condos": ["condo", "condominium", "hoa", "association", "high-rise", "unit"],
  "new construction": ["new construction", "builder", "development", "pre-construction", "model home"],
  "tips": ["tips", "advice", "guide", "how to", "checklist", "steps", "mistakes to avoid"],
  "lifestyle": ["lifestyle", "living", "dining", "entertainment", "culture", "recreation"],
  "relocation": ["relocation", "moving", "relocate", "transfer", "settling", "new city"],
  "commercial": ["commercial", "office", "retail", "industrial", "warehouse", "lease"],
  "RESF": ["resf", "real estate sales force"],
  "The Listing Team": ["listing team", "tlt", "scott lehr"]
};
function generateTags(title, content, category) {
  const text = `${title} ${content} ${category}`.toLowerCase();
  const tags = /* @__PURE__ */ new Set();
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        tags.add(tag);
        break;
      }
    }
  }
  const hashtags = text.match(/#(\w+)/g);
  if (hashtags) hashtags.forEach((h) => tags.add(h.replace("#", "").replace(/([A-Z])/g, " $1").trim()));
  tags.add("South Florida");
  tags.add("real estate");
  return [...tags].slice(0, 15);
}
__name(generateTags, "generateTags");
function generateExcerpt(content, maxLength = 160) {
  const plain = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;
  return plain.substring(0, maxLength).replace(/\s\w+$/, "") + "...";
}
__name(generateExcerpt, "generateExcerpt");
async function getExistingBlogSlugs(env) {
  const list = await env.SESSIONS.list();
  const blogs = [];
  for (const key of list.keys) {
    if (!key.name.startsWith("blog_")) continue;
    const val = await env.SESSIONS.get(key.name, "json");
    if (val && val.slug && val.title) {
      blogs.push({ slug: val.slug, title: val.title, category: val.category || "", tags: val.tags || "" });
    }
  }
  return blogs;
}
__name(getExistingBlogSlugs, "getExistingBlogSlugs");
function addInternalLinks(content, existingBlogs, currentSlug) {
  let linked = content;
  const baseUrl = "https://www.reallistingagent.com/post/";
  const added = /* @__PURE__ */ new Set();
  for (const blog of existingBlogs) {
    if (blog.slug === currentSlug || added.size >= 3) break;
    const titleWords = blog.title.split(/\s+/).filter((w) => w.length > 4);
    for (const word of titleWords) {
      const regex = new RegExp(`\\b(${word})\\b(?![^<]*>)`, "i");
      if (regex.test(linked) && !added.has(blog.slug)) {
        linked = linked.replace(regex, `<a href="${baseUrl}${blog.slug}" title="${blog.title}">$1</a>`);
        added.add(blog.slug);
        break;
      }
    }
  }
  return linked;
}
__name(addInternalLinks, "addInternalLinks");
async function pushBlogToGHL(blogData, env) {
  const apiKey = env.GHL_BLOG_TOKEN || env.GHL_API_KEY;
  if (!apiKey) return { success: false, error: "GHL blog token not configured. Set GHL_BLOG_TOKEN (OAuth token with blog scopes)." };
  try {
    const payload = {
      locationId: blogData.locationId || env.GHL_LOCATION_ID,
      title: blogData.title,
      slug: blogData.slug,
      blogBody: blogData.fullHtml || blogData.content,
      status: blogData.scheduledDate ? "scheduled" : "published",
      imageUrl: blogData.imageUrl || "",
      imageAltText: blogData.imageAlt || blogData.title,
      excerpt: blogData.excerpt || generateExcerpt(blogData.content),
      author: blogData.author || "Scott Lehr",
      tags: (blogData.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      categories: blogData.category ? [blogData.category] : [],
      publishedAt: blogData.publishDate ? `${blogData.publishDate}T08:00:00-05:00` : (/* @__PURE__ */ new Date()).toISOString(),
      rawHTML: true
    };
    if (blogData.scheduledDate) {
      payload.scheduledAt = `${blogData.scheduledDate}T08:00:00-05:00`;
    }
    const res = await fetch(`${env.GHL_API_URL || "https://services.leadconnectorhq.com"}/blogs/posts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Version": "2021-07-28"
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) return { success: true, postId: data.id || data._id, data };
    return { success: false, error: data.message || `HTTP ${res.status}`, statusCode: res.status };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
__name(pushBlogToGHL, "pushBlogToGHL");
async function handleExtractText(request, env, corsHeaders) {
  const body = await request.json();
  const { fileData, fileName, fileType } = body;
  if (!fileData) return jsonResponse({ error: "No file data provided" }, corsHeaders, 400);
  try {
    const base64 = fileData.split(",")[1] || fileData;
    const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    let html = "";
    let title = "";
    if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName?.endsWith(".docx")) {
      const result = await parseDocx(binary);
      html = result.html;
      title = result.title;
    } else if (fileType === "application/pdf" || fileName?.endsWith(".pdf")) {
      const text = extractPdfText(binary);
      html = text.split("\n").filter((l) => l.trim()).map((l) => `<p>${l.trim()}</p>`).join("\n");
      title = text.split("\n")[0]?.trim().substring(0, 100) || "Imported PDF";
    } else if (fileType === "text/plain" || fileName?.endsWith(".txt")) {
      const text = new TextDecoder().decode(binary);
      html = text.split("\n\n").filter((l) => l.trim()).map((l) => `<p>${l.trim()}</p>`).join("\n");
      title = text.split("\n")[0]?.trim().substring(0, 100) || "Imported Document";
    } else {
      return jsonResponse({ error: "Unsupported file type. Use .docx, .pdf, or .txt" }, corsHeaders, 400);
    }
    return jsonResponse({ success: true, html, title, fileName }, corsHeaders);
  } catch (e) {
    return jsonResponse({ error: `Extraction failed: ${e.message}` }, corsHeaders, 500);
  }
}
__name(handleExtractText, "handleExtractText");
async function parseDocx(data) {
  const zip = parseZip(data);
  const docXml = zip["word/document.xml"] || zip["word\\\\document.xml"];
  if (!docXml) return { html: "<p>Could not parse DOCX file</p>", title: "" };
  const xml = new TextDecoder().decode(docXml);
  const paragraphs = [];
  let title = "";
  const pRegex = /<w:p[\s>]([\s\S]*?)<\/w:p>/g;
  let match;
  while ((match = pRegex.exec(xml)) !== null) {
    const pContent = match[1];
    const isHeading = /<w:pStyle\s+w:val="Heading(\d)"/.exec(pContent);
    const textRuns = [];
    const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      textRuns.push(tMatch[1]);
    }
    const text = textRuns.join("");
    if (!text.trim()) continue;
    const isBold = /<w:b[\s/>]/.test(pContent) && !/<w:b\s+w:val="0"/.test(pContent);
    if (isHeading) {
      const level = Math.min(parseInt(isHeading[1]), 6);
      paragraphs.push(`<h${level}>${text}</h${level}>`);
      if (!title) title = text;
    } else if (isBold && text.length < 100) {
      paragraphs.push(`<h3>${text}</h3>`);
    } else {
      paragraphs.push(`<p>${text}</p>`);
    }
  }
  if (!title && paragraphs.length > 0) {
    title = paragraphs[0].replace(/<[^>]+>/g, "").substring(0, 100);
  }
  return { html: paragraphs.join("\n"), title };
}
__name(parseDocx, "parseDocx");
function parseZip(data) {
  const files = {};
  const view = new DataView(data.buffer);
  let offset = 0;
  while (offset < data.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 67324752) break;
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLen));
    const fileDataStart = offset + 30 + nameLen + extraLen;
    if (compMethod === 0) {
      files[name] = data.slice(fileDataStart, fileDataStart + uncompSize);
    } else if (compMethod === 8) {
      try {
        const compressed = data.slice(fileDataStart, fileDataStart + compSize);
        const ds = new DecompressionStream("deflate-raw");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        const chunks = [];
        writer.write(compressed);
        writer.close();
        files[name] = { compressed, compMethod: 8 };
      } catch (e) {
      }
    }
    offset = fileDataStart + compSize;
  }
  return files;
}
__name(parseZip, "parseZip");
function extractPdfText(data) {
  const text = new TextDecoder("latin1").decode(data);
  const lines = [];
  const btRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btRegex.exec(text)) !== null) {
    const block = match[1];
    const tjRegex = /\(([^)]*)\)\s*Tj|\[(.*?)\]\s*TJ/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      const content = tjMatch[1] || (tjMatch[2] || "").replace(/\([^)]*\)/g, (m) => m.slice(1, -1)).replace(/-?\d+\.?\d*/g, " ");
      if (content.trim()) lines.push(content.trim());
    }
  }
  return lines.join("\n") || "Could not extract text from PDF. Try a text-based PDF or paste content manually.";
}
__name(extractPdfText, "extractPdfText");
async function handleSubmitBlog(request, env, corsHeaders) {
  const body = await request.json();
  const blogId = `blog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const {
    title,
    slug,
    content,
    metaDescription,
    category,
    tags,
    author,
    publishDate,
    scheduledDate,
    imageFile,
    platform,
    ghlBusiness,
    ghlDomain,
    urlPrefix
  } = body;
  if (!title || !content) return jsonResponse({ success: false, error: "Title and content are required" }, corsHeaders, 400);
  const pushToGHL = body.pushToGHL || false;
  const seoSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
  const resolvedUrlPrefix = urlPrefix || (platform === "ghl" ? "/post/" : "/blog/");
  const selectedLocationId = ghlBusiness ? ghlBusiness.split("|")[0] : env.GHL_LOCATION_ID;
  const allKeys = await env.SESSIONS.list();
  for (const key of allKeys.keys) {
    if (!key.name.startsWith("blog_")) continue;
    const existing = await env.SESSIONS.get(key.name, "json");
    if (existing && existing.slug === seoSlug) {
      return jsonResponse({
        success: true,
        reused: true,
        blogId: existing.blogId,
        slug: existing.slug,
        imageUrl: existing.imageUrl,
        canonicalUrl: existing.canonicalUrl,
        fullHtml: existing.fullHtml,
        bodyHtml: existing.bodyHtml,
        tags: existing.tags,
        excerpt: existing.excerpt,
        message: "Blog with this slug already exists - returning existing"
      }, corsHeaders);
    }
  }
  const autoTags = tags || generateTags(title, content, category).join(", ");
  const excerpt = metaDescription || generateExcerpt(content);
  let imageUrl = "";
  let imageAlt = "";
  if (imageFile && imageFile.data) {
    const imgSlug = seoSlug + "-featured";
    try {
      const base64Data = imageFile.data.split(",")[1];
      const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: imageFile.type || "image/jpeg" });
      const formData = new FormData();
      formData.append("image", blob, imgSlug + "." + (imageFile.name || "image.jpg").split(".").pop());
      formData.append("alt_title", title);
      formData.append("description", excerpt);
      formData.append("slug", imgSlug);
      const res = await fetch(`${env.IMAGE_SERVER_URL}${env.IMAGE_SERVER_UPLOAD || "/admin/api/images"}`, {
        method: "POST",
        body: formData,
        headers: { "Authorization": `Basic ${btoa(`${env.IMAGE_SERVER_USERNAME}:${env.IMAGE_SERVER_PASSWORD}`)}` }
      });
      const data = await res.json();
      imageUrl = data.url || `${env.IMAGE_SERVER_URL}/images/${data.slug || imgSlug}`;
      imageAlt = title;
    } catch (e) {
      imageUrl = `[upload-error: ${e.message}]`;
    }
  }
  const existingBlogs = await getExistingBlogSlugs(env);
  const linkedContent = addInternalLinks(content, existingBlogs, seoSlug);
  const baseDomain = ghlDomain ? ghlDomain.replace(/\/$/, "") : "https://www.reallistingagent.com";
  const canonicalUrl = `${baseDomain}${resolvedUrlPrefix}${seoSlug}`;
  const pubDate = publishDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const blogOpts = {
    title,
    description: excerpt,
    canonicalUrl,
    category: category || "Real Estate",
    keywords: autoTags,
    publishDate: pubDate,
    content: linkedContent,
    imageUrl,
    imageAlt,
    author: author || "Scott Lehr"
  };
  const fullHtml = generateBlogHtml(blogOpts);
  const bodyHtml = generateBlogBodyHtml(blogOpts);
  const blogData = {
    blogId,
    slug: seoSlug,
    title,
    content: linkedContent,
    metaDescription: excerpt,
    category,
    tags: autoTags,
    author: author || "Scott Lehr",
    publishDate: pubDate,
    scheduledDate,
    excerpt,
    imageUrl,
    imageAlt,
    canonicalUrl,
    platform: platform || "ghl",
    ghlBusiness: ghlBusiness || "",
    ghlDomain: ghlDomain || "",
    urlPrefix: resolvedUrlPrefix,
    locationId: selectedLocationId,
    fullHtml,
    bodyHtml,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    internalLinks: existingBlogs.filter((b) => linkedContent.includes(b.slug)).map((b) => b.slug)
  };
  await env.SESSIONS.put(blogId, JSON.stringify(blogData));
  let ghlResult = null;
  if (pushToGHL) {
    ghlResult = await pushBlogToGHL({ ...blogData, fullHtml: bodyHtml, locationId: selectedLocationId }, env);
  }
  return jsonResponse({
    success: true,
    blogId,
    slug: seoSlug,
    imageUrl,
    canonicalUrl,
    fullHtml,
    bodyHtml,
    tags: autoTags,
    excerpt,
    ghlResult,
    internalLinks: blogData.internalLinks,
    csvRow: {
      "URL Slug": seoSlug,
      "Publish Date": pubDate,
      "Scheduled Date": scheduledDate || "",
      "Blog Post Title": title,
      "Meta description": excerpt,
      "Meta Image": imageUrl,
      "Meta Image Alt text": imageAlt,
      "Author": author || "Scott Lehr",
      "Category": category || "",
      "Blog Post Tags": autoTags,
      "Blog Post Content": fullHtml
    }
  }, corsHeaders);
}
__name(handleSubmitBlog, "handleSubmitBlog");
async function handleGetBlogs(env, corsHeaders) {
  const list = await env.SESSIONS.list();
  const blogs = [];
  for (const key of list.keys) {
    if (!key.name.startsWith("blog_")) continue;
    const val = await env.SESSIONS.get(key.name, "json");
    if (val) blogs.push(val);
  }
  blogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return jsonResponse({ blogs, total: blogs.length }, corsHeaders);
}
__name(handleGetBlogs, "handleGetBlogs");
async function handleDeleteBlog(id, env, corsHeaders) {
  if (!await env.SESSIONS.get(id)) return jsonResponse({ error: "Blog not found" }, corsHeaders, 404);
  await env.SESSIONS.delete(id);
  return jsonResponse({ success: true }, corsHeaders);
}
__name(handleDeleteBlog, "handleDeleteBlog");
async function handleExportBlogCSV(env, corsHeaders) {
  const list = await env.SESSIONS.list();
  const blogs = [];
  for (const key of list.keys) {
    if (!key.name.startsWith("blog_")) continue;
    const val = await env.SESSIONS.get(key.name, "json");
    if (val) blogs.push(val);
  }
  if (blogs.length === 0) return jsonResponse({ error: "No blogs to export" }, corsHeaders, 404);
  const headers = ["URL Slug", "Publish Date", "Scheduled Date", "Blog Post Title", "Meta description", "Meta Image", "Meta Image Alt text", "Author", "Category ", "Blog Post Tags", "Blog Post Content"];
  const esc = /* @__PURE__ */ __name((v) => {
    const s = String(v || "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }, "esc");
  const rows = blogs.map((b) => [
    b.slug,
    b.publishDate,
    b.scheduledDate || "",
    b.title,
    b.metaDescription || "",
    b.imageUrl || "",
    b.imageAlt || "",
    b.author || "Scott Lehr",
    b.category || "",
    b.tags || "",
    b.fullHtml || b.bodyHtml || b.content
  ].map(esc).join(","));
  return new Response([headers.join(","), ...rows].join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="blog-import-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`, ...corsHeaders }
  });
}
__name(handleExportBlogCSV, "handleExportBlogCSV");
async function handleExportSingleBlogCSV(blogId, env, corsHeaders) {
  const val = await env.SESSIONS.get(blogId, "json");
  if (!val) return jsonResponse({ error: "Blog not found" }, corsHeaders, 404);
  const headers = ["URL Slug", "Publish Date", "Scheduled Date", "Blog Post Title", "Meta description", "Meta Image", "Meta Image Alt text", "Author", "Category ", "Blog Post Tags", "Blog Post Content"];
  const esc = /* @__PURE__ */ __name((v) => {
    const s = String(v || "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  }, "esc");
  const row = [
    val.slug,
    val.publishDate,
    val.scheduledDate || "",
    val.title,
    val.metaDescription || "",
    val.imageUrl || "",
    val.imageAlt || "",
    val.author || "Scott Lehr",
    val.category || "",
    val.tags || "",
    val.fullHtml || val.bodyHtml || val.content
  ].map(esc).join(",");
  return new Response([headers.join(","), row].join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${val.slug || "blog"}-import.csv"`, ...corsHeaders }
  });
}
__name(handleExportSingleBlogCSV, "handleExportSingleBlogCSV");
function generateBlogBodyHtml(opts) {
  const { title, description, content, imageUrl, imageAlt, author, publishDate, category, canonicalUrl } = opts;
  const logo = "https://images.squarespace-cdn.com/content/v1/5b9ada8b2714e5f76f88a8a3/5731ebc1-6807-4d3e-af38-ec5e309856c4/RESF_Main+logo.png";
  const excerpt = (description || content.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim()).substring(0, 250);
  const formattedDate = (/* @__PURE__ */ new Date(publishDate + "T12:00:00")).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `<div style="font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a2e;line-height:1.8;max-width:800px;margin:0 auto">

  <!-- Hero Section -->
  <div style="margin-bottom:2rem">
${imageUrl && !imageUrl.startsWith("[") ? `    <div style="position:relative;border-radius:12px;overflow:hidden;margin-bottom:1.5rem">
      <img src="${imageUrl}" alt="${imageAlt || title}" style="width:100%;height:auto;display:block;object-fit:cover;max-height:450px" />
      <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(26,26,46,0.8));padding:2rem 1.5rem 1rem">
        <span style="background:#e94560;color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase">${category || "Real Estate"}</span>
      </div>
    </div>` : ""}
    <h1 style="font-size:2.2em;font-weight:800;color:#1a1a2e;margin:0 0 0.75rem;line-height:1.2;letter-spacing:-0.02em">${title}</h1>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;flex-wrap:wrap">
      <img src="${logo}" alt="The Listing Team" style="height:32px;width:auto" />
      <div style="font-size:14px;color:#666">
        <span style="font-weight:600;color:#1a1a2e">${author || "Scott Lehr"}</span>
        <span style="margin:0 6px;color:#ccc">|</span>
        <span>The Listing Team at RESF</span>
        <span style="margin:0 6px;color:#ccc">|</span>
        <time>${formattedDate}</time>
      </div>
    </div>
  </div>

  <!-- Intro -->
  <p style="font-size:1.15em;color:#444;line-height:1.75;border-left:4px solid #e94560;padding-left:1.25rem;margin:0 0 2rem;font-style:italic">
    ${excerpt}
  </p>

  <!-- Content -->
  <div style="font-size:1.05em;line-height:1.85;color:#333">
    <style>
      .blog-content h2 { font-size:1.5em; font-weight:700; color:#1a1a2e; margin:2rem 0 1rem; padding-bottom:0.5rem; border-bottom:2px solid #f0f0f0; }
      .blog-content h3 { font-size:1.25em; font-weight:600; color:#16213e; margin:1.5rem 0 0.75rem; }
      .blog-content p { margin:0 0 1.25rem; }
      .blog-content ul, .blog-content ol { margin:0 0 1.25rem; padding-left:1.5rem; }
      .blog-content li { margin-bottom:0.5rem; }
      .blog-content a { color:#2563eb; text-decoration:underline; text-decoration-color:#93c5fd; text-underline-offset:2px; }
      .blog-content a:hover { color:#1d4ed8; text-decoration-color:#2563eb; }
      .blog-content blockquote { border-left:4px solid #e94560; padding:1rem 1.25rem; margin:1.5rem 0; background:#fef2f2; border-radius:0 8px 8px 0; font-style:italic; color:#555; }
      .blog-content img { max-width:100%; height:auto; border-radius:8px; margin:1.5rem 0; }
      .blog-content strong { color:#1a1a2e; }
    </style>
    <div class="blog-content">
      ${content}
    </div>
  </div>

  <!-- CTA Section -->
  <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:12px;padding:2rem;margin:2.5rem 0;text-align:center">
    <h3 style="color:white;font-size:1.3em;margin:0 0 0.75rem;font-weight:700">Ready to Make Your Next Move?</h3>
    <p style="color:#a5b4fc;margin:0 0 1.25rem;font-size:0.95em">Whether you're buying, selling, or investing in South Florida real estate, our team is here to guide you.</p>
    <a href="https://www.reallistingagent.com" style="display:inline-block;background:#e94560;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95em;letter-spacing:0.3px">Connect With An Agent</a>
  </div>

  <!-- Footer -->
  <div style="border-top:2px solid #f0f0f0;padding-top:1.5rem;margin-top:2rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${logo}" alt="The Listing Team" style="height:28px;width:auto" />
      <div style="font-size:13px;color:#888">
        <div style="font-weight:600;color:#1a1a2e">The Listing Team at RESF</div>
        <div>South Florida Real Estate Experts</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;font-size:13px">
      <a href="https://www.reallistingagent.com/post" style="color:#2563eb;text-decoration:none;font-weight:500">More Articles</a>
      <span style="color:#ddd">|</span>
      <a href="https://www.reallistingagent.com/fort-lauderdale-homes-for-sale" style="color:#2563eb;text-decoration:none;font-weight:500">Browse Listings</a>
      <span style="color:#ddd">|</span>
      <a href="https://www.reallistingagent.com" style="color:#2563eb;text-decoration:none;font-weight:500">Visit Website</a>
    </div>
  </div>

</div>`;
}
__name(generateBlogBodyHtml, "generateBlogBodyHtml");
function generateBlogHtml(opts) {
  const { title, description, canonicalUrl, category, keywords, publishDate, content, imageUrl, imageAlt, author } = opts;
  const logo = "https://images.squarespace-cdn.com/content/v1/5b9ada8b2714e5f76f88a8a3/5731ebc1-6807-4d3e-af38-ec5e309856c4/RESF_Main+logo.png";
  const baseUrl = "https://www.reallistingagent.com/";
  const tagList = keywords.split(",").map((t) => t.trim()).filter(Boolean);
  const ogTags = tagList.slice(0, 6).map((t) => `  <meta property="article:tag" content="${t}" />`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary SEO -->
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta name="keywords" content="${keywords}" />
  <meta name="author" content="${author}" />
  <meta name="publisher" content="The Listing Team at RESF" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Indexing -->
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <meta name="googlebot" content="index, follow" />
  <meta name="bingbot" content="index, follow" />
  <meta name="DuckDuckBot" content="index, follow" />

  <!-- AEO + LLM Meta Tags -->
  <meta name="topic" content="${title}" />
  <meta name="subject" content="${category} - South Florida Real Estate" />
  <meta name="coverage" content="South Florida" />
  <meta name="target" content="homebuyers, sellers, real estate investors in South Florida" />
  <meta name="HandheldFriendly" content="True" />
  <meta name="MobileOptimized" content="width" />
  <meta name="abstract" content="${description}" />
  <meta name="classification" content="Real Estate / ${category}" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="The Listing Team at RESF" />
  <meta property="og:locale" content="en_US" />
${imageUrl ? `  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:alt" content="${imageAlt || title}" />` : ""}

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@ScottLehrRealty" />
  <meta name="twitter:creator" content="@ScottLehrRealty" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
${imageUrl ? `  <meta name="twitter:image" content="${imageUrl}" />` : ""}

  <!-- Article Meta -->
  <meta property="article:published_time" content="${publishDate}T08:00:00-05:00" />
  <meta property="article:modified_time" content="${publishDate}T08:00:00-05:00" />
  <meta property="article:section" content="${category}" />
  <meta property="article:author" content="${author}" />
${ogTags}

  <!-- Geo Meta -->
  <meta name="geo.region" content="US-FL" />
  <meta name="geo.placename" content="Fort Lauderdale" />
  <meta name="geo.position" content="26.1224;-80.1373" />
  <meta name="ICBM" content="26.1224, -80.1373" />

  <!-- JSON-LD Schema Graph -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "${baseUrl}#organization",
        "name": "The Listing Team at RESF",
        "url": "${baseUrl}",
        "logo": {
          "@type": "ImageObject",
          "url": "${logo}"
        },
        "sameAs": ["https://twitter.com/ScottLehrRealty"]
      },
      {
        "@type": "Person",
        "@id": "${baseUrl}#author",
        "name": "${author}",
        "url": "${baseUrl}",
        "jobTitle": "Real Estate Professional",
        "worksFor": { "@id": "${baseUrl}#organization" }
      },
      {
        "@type": "BlogPosting",
        "@id": "${canonicalUrl}",
        "headline": "${title}",
        "description": "${description}",
        "datePublished": "${publishDate}T08:00:00-05:00",
        "dateModified": "${publishDate}T08:00:00-05:00",
        "author": { "@id": "${baseUrl}#author" },
        "publisher": { "@id": "${baseUrl}#organization" },
        "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" },
${imageUrl ? `        "image": { "@type": "ImageObject", "url": "${imageUrl}" },` : ""}
        "articleSection": "${category}",
        "keywords": "${keywords}",
        "speakable": {
          "@type": "SpeakableSpecification",
          "cssSelector": [".article-intro", "h1"]
        }
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "${baseUrl}" },
          { "@type": "ListItem", "position": 2, "name": "Posts", "item": "${baseUrl}post" },
          { "@type": "ListItem", "position": 3, "name": "${category}", "item": "${canonicalUrl}" }
        ]
      }
    ]
  }
  <\/script>
</head>

<body>
  <article>
    <h1>${title}</h1>
${imageUrl ? `    <img src="${imageUrl}" alt="${imageAlt || title}" style="max-width:100%;height:auto;border-radius:8px;margin:1rem 0" />` : ""}
    ${content}
  </article>
</body>
</html>`;
}
__name(generateBlogHtml, "generateBlogHtml");
async function handleBulkSubmit(request, env, corsHeaders) {
  const body = await request.json();
  const { posts = [], ghlBusiness, platforms = [] } = body;
  if (!posts.length) return jsonResponse({ error: "No posts provided" }, corsHeaders, 400);
  if (posts.length > 90) return jsonResponse({ error: "Maximum 90 posts per batch (GHL CSV limit)" }, corsHeaders, 400);
  const results = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const content = post.content || post.postContent || "";
    const dateTime = post.scheduledDateTime || post.date || "";
    if (!content || !dateTime) {
      results.push({ index: i, success: false, error: "Missing content or date" });
      continue;
    }
    const hashtags = generateHashtagsTemplate(content);
    let imageUrl = "";
    if (post.imageUrl) {
      imageUrl = post.imageUrl;
    } else if (post.imageFile && post.imageFile.data && env.IMAGE_SERVER_URL && env.IMAGE_SERVER_USERNAME) {
      try {
        const seoName = seoRenameImage(post.imageFile.name || "image.jpg", content, i);
        const seoSlug = seoName.replace(/\.[^.]+$/, "");
        const base64Data = post.imageFile.data.split(",")[1];
        const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        const blob = new Blob([binaryData], { type: post.imageFile.type || "image/jpeg" });
        const formData = new FormData();
        formData.append("image", blob, seoName);
        formData.append("alt_title", content.substring(0, 100));
        formData.append("slug", seoSlug);
        const res = await fetch(`${env.IMAGE_SERVER_URL}${env.IMAGE_SERVER_UPLOAD || "/admin/api/images"}`, {
          method: "POST",
          body: formData,
          headers: { "Authorization": `Basic ${btoa(`${env.IMAGE_SERVER_USERNAME}:${env.IMAGE_SERVER_PASSWORD}`)}` }
        });
        const data = await res.json();
        imageUrl = data.url || `${env.IMAGE_SERVER_URL}/images/${data.slug || seoSlug}`;
      } catch (e) {
      }
    }
    const session = {
      sessionId: requestId,
      dedupeKey: `${content}_${dateTime}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      scheduledDateTime: dateTime,
      postContent: content,
      platforms: (post.platforms || platforms).join(", "),
      ghlBusiness: post.ghlBusiness || ghlBusiness || "",
      externalLink: post.externalLink || post.link || "",
      uploadedImages: imageUrl,
      generatedCaption: `${content}

${hashtags.join(" ")}`,
      generatedHashtags: hashtags.join(", "),
      ghlPostId: "",
      ghlStatus: "Queued",
      errors: ""
    };
    await env.SESSIONS.put(requestId, JSON.stringify(session));
    results.push({
      index: i,
      success: true,
      sessionId: requestId,
      scheduledDateTime: dateTime,
      hashtags,
      imageUrl,
      content: content.substring(0, 50) + "..."
    });
  }
  return jsonResponse({
    success: true,
    total: posts.length,
    processed: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results
  }, corsHeaders);
}
__name(handleBulkSubmit, "handleBulkSubmit");
async function handleAIWrite(request, env, corsHeaders) {
  const body = await request.json();
  const { topic, type = "blog", keywords = "", tone = "professional", length = "medium" } = body;
  if (!topic) return jsonResponse({ error: "Topic is required" }, corsHeaders, 400);
  const apiKey = env.ANTHROPIC_API_KEY || env.AI_API_KEY;
  if (apiKey && !apiKey.startsWith("none")) {
    try {
      const wordCount = length === "short" ? "300-500" : length === "long" ? "1000-1500" : "600-800";
      const prompt = type === "blog" ? `Write a ${tone} blog post about "${topic}" for a South Florida real estate company called "The Listing Team at RESF". Author: Scott Lehr.

Requirements:
- ${wordCount} words
- SEO optimized for: ${keywords || topic}
- Target audience: South Florida homebuyers, sellers, and investors
- Include H2 and H3 headings with proper HTML tags
- Write in HTML format with <h2>, <h3>, <p>, <ul>, <li> tags
- Include internal link placeholders to /fort-lauderdale-homes-for-sale and /post
- Professional, modern real estate tone
- Include actionable advice
- End with a call-to-action to connect with an agent

Return ONLY the HTML content (no doctype, head, or body tags). Start with the first <h2>.` : `Write ${length === "short" ? "2-3" : length === "long" ? "5-7" : "3-5"} social media post variations about "${topic}" for a South Florida real estate company "The Listing Team at RESF".

For each post include:
- Engaging caption (${tone} tone)
- Relevant hashtags (5-10)
- Call to action
- Optimized for: ${keywords || topic}

Format as JSON array: [{"content": "post text with hashtags", "platforms": ["Facebook","Instagram"]}]`;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4e3,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      if (type === "social") {
        try {
          const posts = JSON.parse(text);
          return jsonResponse({ success: true, type: "social", posts, topic }, corsHeaders);
        } catch {
          return jsonResponse({ success: true, type: "social", raw: text, topic }, corsHeaders);
        }
      }
      const metaDesc = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 160);
      const autoTags = generateTags(topic, text, "").join(", ");
      const slug2 = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
      return jsonResponse({
        success: true,
        type: "blog",
        content: text,
        topic,
        metaDescription: metaDesc,
        tags: autoTags,
        slug: slug2,
        title: topic.charAt(0).toUpperCase() + topic.slice(1)
      }, corsHeaders);
    } catch (e) {
      return jsonResponse({ error: `AI generation failed: ${e.message}` }, corsHeaders, 500);
    }
  }
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 80);
  const tags = generateTags(topic, topic, "").join(", ");
  if (type === "social") {
    const hashtags = generateHashtagsTemplate(topic);
    const posts = [
      { content: `${topic}

Connect with a RESF agent today.

${hashtags.join(" ")}`, platforms: ["Facebook", "Instagram"] },
      { content: `Did you know? ${topic}

Learn more at reallistingagent.com

${hashtags.join(" ")}`, platforms: ["Facebook", "LinkedIn"] },
      { content: `\u{1F3E1} ${topic}

The Listing Team at RESF is here to help.

${hashtags.join(" ")}`, platforms: ["Instagram"] }
    ];
    return jsonResponse({ success: true, type: "social", posts, topic, note: "Template-based. Set ANTHROPIC_API_KEY for AI-generated content." }, corsHeaders);
  }
  const content = `<h2>${topic}</h2>
<p>South Florida's real estate market continues to offer exciting opportunities for buyers, sellers, and investors. Understanding ${topic.toLowerCase()} is essential for making informed decisions in today's competitive landscape.</p>

<h3>What You Need to Know</h3>
<p>Whether you're a first-time buyer or a seasoned investor, ${topic.toLowerCase()} plays a crucial role in your real estate journey. The Listing Team at RESF is here to guide you through every step.</p>

<h3>Key Considerations</h3>
<ul>
<li>Market trends in Miami-Dade and Broward counties</li>
<li>Neighborhood insights and school ratings</li>
<li>Investment potential and ROI analysis</li>
<li>Financing options and pre-approval strategies</li>
</ul>

<h3>Take Action Today</h3>
<p>Don't wait to explore your options. Connect with <a href="https://www.reallistingagent.com">The Listing Team at RESF</a> for expert guidance on ${topic.toLowerCase()} in South Florida.</p>

<p><em>Note: Set ANTHROPIC_API_KEY for AI-generated, fully unique content.</em></p>`;
  return jsonResponse({
    success: true,
    type: "blog",
    content,
    topic,
    slug,
    metaDescription: `Learn about ${topic} in South Florida real estate. Expert insights from The Listing Team at RESF.`,
    tags,
    title: topic.charAt(0).toUpperCase() + topic.slice(1),
    note: "Template-based. Set ANTHROPIC_API_KEY for AI-generated content."
  }, corsHeaders);
}
__name(handleAIWrite, "handleAIWrite");
var HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TLT Social Post Importer</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"><\/script>
  <style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    const Upload = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    const X = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    const AlertCircle = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    const CheckCircle = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

    // Helper: get default datetime = now + 1 minute, formatted as YYYY-MM-DD HH:mm:ss
    function getDefaultDateTime() {
      const d = new Date(Date.now() + 60000);
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    // Helper: convert datetime-local value to YYYY-MM-DD HH:mm:ss
    function pickerToFormatted(val) {
      if (!val) return '';
      const d = new Date(val);
      if (isNaN(d)) return val;
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    // Helper: convert YYYY-MM-DD HH:mm:ss to datetime-local format
    function formattedToPicker(val) {
      if (!val) return '';
      return val.replace(' ', 'T').slice(0, 16);
    }

    // SEO rename on client side for display
    function seoFileName(originalName, content, idx) {
      const ext = (originalName || 'image.jpg').split('.').pop().toLowerCase();
      const words = content.toLowerCase().replace(/[^a-z0-9\\s]/g, '').split(/\\s+/)
        .filter(w => w.length > 2 && !['the','and','for','that','this','with','from'].includes(w)).slice(0, 5);
      const slug = words.length > 0 ? words.join('-') : 'social-post';
      return slug + '-' + (idx+1) + '.' + ext;
    }

    function SocialPostForm() {
      const [formData, setFormData] = useState({
        scheduledDateTime: getDefaultDateTime(),
        postContent: '', externalLink: '',
        platforms: [], ghlBusiness: '', ghlDomain: '',
        imageUrls: null, gifUrl: null, videoUrls: null,
      });
      const [previews, setPreviews] = useState({ imageUrls: null, gifUrl: null, videoUrls: null });
      const [errors, setErrors] = useState({});
      const [submittedData, setSubmittedData] = useState(null);
      const [dragActive, setDragActive] = useState({});
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [apiError, setApiError] = useState(null);
      const [sessionHistory, setSessionHistory] = useState([]);
      const [showHistory, setShowHistory] = useState(false);
      const [loadingSessions, setLoadingSessions] = useState(false);
      const [locations, setLocations] = useState([]);
      const [domainData, setDomainData] = useState([]);
      const [loadingDomains, setLoadingDomains] = useState(false);
      const [customDomainInput, setCustomDomainInput] = useState('');

      // Load GHL locations + domains on mount
      useEffect(() => {
        axios.get('/api/locations').then(res => {
          setLocations(res.data.locations || []);
          const tlt = (res.data.locations || []).find(l => l.brandKey === 'tlt');
          if (tlt && !formData.ghlBusiness) {
            setFormData(p => ({...p, ghlBusiness: tlt.locationId + '|' + tlt.name}));
          }
        }).catch(() => {});

        setLoadingDomains(true);
        axios.get('/api/domains').then(res => {
          setDomainData(res.data.domains || []);
        }).catch(() => {}).finally(() => setLoadingDomains(false));
      }, []);

      // Get domains for the currently selected location
      const selectedLocationId = formData.ghlBusiness ? formData.ghlBusiness.split('|')[0] : '';
      const selectedLocationDomains = domainData.find(d => d.locationId === selectedLocationId);
      const allDomains = domainData.flatMap(d => d.domains?.map(dm => ({...dm, locationName: d.name, locationId: d.locationId})) || []);
      const isCustomDomainSocial = formData.ghlDomain === '__custom__';

      // Social platforms: regular + video-only
      const socialPlatforms = ['Facebook', 'Instagram', 'LinkedIn', 'Twitter/X', 'Google Business Profile'];
      const videoPlatforms = ['YouTube', 'TikTok'];

      const resetForm = () => {
        setFormData({ scheduledDateTime: getDefaultDateTime(), postContent: '', externalLink: '', platforms: [], ghlBusiness: '', ghlDomain: '', imageUrls: null, gifUrl: null, videoUrls: null });
        setPreviews({ imageUrls: null, gifUrl: null, videoUrls: null });
        setErrors({});
      };

      const fetchSessions = async () => {
        setLoadingSessions(true);
        try { const res = await axios.get('/api/sessions'); setSessionHistory(res.data.sessions || []); } catch(e) {}
        finally { setLoadingSessions(false); }
      };
      const deleteSession = async (id) => {
        try { await axios.delete('/api/sessions/' + id); setSessionHistory(p => p.filter(s => s.sessionId !== id)); } catch(e) {}
      };

      const handleFileInput = (fieldName, file) => {
        if (!file) return;
        const validImage = ['image/jpeg','image/png','image/gif','image/webp'];
        const validVideo = ['video/mp4','video/quicktime','video/x-msvideo'];
        if (file.size > 50*1024*1024) { setErrors(p=>({...p,[fieldName]:'File exceeds 50MB'})); return; }
        if (fieldName === 'imageUrls' && !validImage.includes(file.type)) { setErrors(p=>({...p,[fieldName]:'Must be JPEG, PNG, GIF, or WebP'})); return; }
        if (fieldName === 'gifUrl' && file.type !== 'image/gif') { setErrors(p=>({...p,[fieldName]:'Must be GIF format'})); return; }
        if (fieldName === 'videoUrls' && !validVideo.includes(file.type)) { setErrors(p=>({...p,[fieldName]:'Must be MP4, MOV, or AVI'})); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          setFormData(p=>({...p,[fieldName]:{name:file.name,type:file.type,size:file.size,data:e.target.result}}));
          setPreviews(p=>({...p,[fieldName]:e.target.result}));
          setErrors(p=>({...p,[fieldName]:''}));
        };
        reader.readAsDataURL(file);
      };
      const handleDrag = (e,fn) => { e.preventDefault(); e.stopPropagation(); setDragActive(p=>({...p,[fn]:e.type==='dragenter'||e.type==='dragover'})); };
      const handleDrop = (e,fn) => { e.preventDefault(); e.stopPropagation(); setDragActive(p=>({...p,[fn]:false})); if(e.dataTransfer.files?.[0]) handleFileInput(fn,e.dataTransfer.files[0]); };
      const removeFile = (fn) => { setFormData(p=>({...p,[fn]:null})); setPreviews(p=>({...p,[fn]:null})); };

      const handlePlatformToggle = (platform) => {
        // Video-only platforms require a video file
        if (videoPlatforms.includes(platform) && !formData.videoUrls) {
          setErrors(p => ({...p, platforms: platform + ' requires a video upload'}));
          return;
        }
        setFormData(p=>({...p,platforms:p.platforms.includes(platform)?p.platforms.filter(x=>x!==platform):[...p.platforms,platform]}));
        setErrors(p=>({...p,platforms:''}));
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        const newErrors = {};
        if (!formData.postContent.trim()) newErrors.postContent = 'Post content is required';
        if (!formData.scheduledDateTime) newErrors.scheduledDateTime = 'Scheduled date/time is required';
        if (formData.platforms.length === 0) newErrors.platforms = 'Select at least one platform';
        if (formData.externalLink && !/^https?:\\/\\/.+/.test(formData.externalLink)) newErrors.externalLink = 'Enter a valid URL';
        // Video-only platforms need a video
        const hasVideo = !!formData.videoUrls;
        const selectedVideoOnly = formData.platforms.filter(p => videoPlatforms.includes(p));
        if (selectedVideoOnly.length > 0 && !hasVideo) newErrors.platforms = selectedVideoOnly.join(', ') + ' require a video upload';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

        setErrors({}); setIsSubmitting(true); setApiError(null);
        try {
          const payload = {
            postContent: formData.postContent, scheduledDateTime: formData.scheduledDateTime,
            platforms: formData.platforms, externalLink: formData.externalLink, ghlBusiness: formData.ghlBusiness,
            imageFiles: [formData.imageUrls, formData.gifUrl].filter(Boolean),
            videoFiles: [formData.videoUrls].filter(Boolean)
          };
          const response = await axios.post('/api/submit-post', payload);
          if (response.data.isDuplicate) { setApiError('Duplicate post: same content and time already exists.'); }
          else { setSubmittedData(response.data); resetForm(); }
        } catch (error) { setApiError(error.response?.data?.error || error.message || 'Failed to submit'); }
        finally { setIsSubmitting(false); }
      };

      const FileUploadArea = ({ fieldName, label, accept, description }) => {
        const file = formData[fieldName]; const preview = previews[fieldName]; const error = errors[fieldName];
        const seoName = file && formData.postContent ? seoFileName(file.name, formData.postContent, 0) : null;
        return (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{label} <span className="text-xs text-gray-500 font-normal ml-1">{description}</span></label>
            {!file ? (
              <div onDragEnter={e=>handleDrag(e,fieldName)} onDragLeave={e=>handleDrag(e,fieldName)} onDragOver={e=>handleDrag(e,fieldName)} onDrop={e=>handleDrop(e,fieldName)}
                className={'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition '+(dragActive[fieldName]?'border-blue-500 bg-blue-50':'border-gray-300 hover:border-gray-400')+(error?' border-red-500 bg-red-50':'')}>
                <input type="file" accept={accept} onChange={e=>handleFileInput(fieldName,e.target.files?.[0])} className="hidden" id={'input-'+fieldName}/>
                <label htmlFor={'input-'+fieldName} className="cursor-pointer">
                  <Upload className="mx-auto h-7 w-7 text-gray-400 mb-1"/>
                  <p className="text-sm text-gray-600">Drag & drop or click to select</p>
                  <p className="text-xs text-gray-500 mt-1">Max 50MB</p>
                </label>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                {fieldName==='imageUrls'&&preview&&<img src={preview} alt="Preview" className="max-h-28 mx-auto mb-2 rounded"/>}
                {fieldName==='gifUrl'&&preview&&<img src={preview} alt="GIF" className="max-h-28 mx-auto mb-2 rounded"/>}
                {fieldName==='videoUrls'&&preview&&<video src={preview} controls className="max-h-28 mx-auto mb-2 rounded"/>}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    {seoName && <p className="text-xs text-green-600">SEO name: {seoName}</p>}
                    <p className="text-xs text-gray-500">{(file.size/1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={()=>removeFile(fieldName)} className="text-red-500 hover:text-red-700"><X className="h-5 w-5"/></button>
                </div>
              </div>
            )}
            {error && <div className="flex items-center mt-2 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{error}</div>}
          </div>
        );
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
          {/* Brand Header */}
          <div className="bg-white/10 backdrop-blur border-b border-white/10">
            <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500 text-white font-black text-xl px-3 py-1 rounded">TLT</div>
                <div>
                  <h1 className="text-white font-bold text-lg leading-tight">The Listing Team</h1>
                  <p className="text-blue-200 text-xs">Social Post Importer</p>
                </div>
              </div>
              <nav className="flex gap-3">
                <span className="bg-blue-500/30 text-white text-sm px-3 py-1.5 rounded-lg font-medium border border-blue-400/30">Social Posts</span>
                <a href="/blog" className="text-blue-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Blog Submitter</a>
                <a href="/bulk" className="text-blue-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Bulk Upload</a>
                <a href="https://images.reallistingteam.com/admin" target="_blank" className="text-blue-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Image Server</a>
              </nav>
            </div>
          </div>

          <div className="max-w-2xl mx-auto p-6 pt-8">
            <div className="bg-white rounded-xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Create Social Post</h2>
              <p className="text-gray-500 text-sm mb-6">Schedule posts across platforms with auto-generated hashtags and SEO-optimized images</p>

              {apiError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"/>
                  <div className="flex-1">
                    <h4 className="font-semibold text-red-900">Error</h4>
                    <p className="text-red-700 mt-1 text-sm">{apiError}</p>
                    <button onClick={()=>setApiError(null)} className="mt-2 text-xs text-red-600 hover:text-red-700 underline">Dismiss</button>
                  </div>
                </div>
              )}

              {submittedData && (
                <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-4"><CheckCircle className="w-6 h-6 text-green-600"/><h3 className="text-lg font-semibold text-green-900">Post Submitted</h3></div>
                  {submittedData.data?.uploadedImages?.length > 0 && (
                    <div className="mb-3"><h4 className="font-semibold text-gray-900 mb-1 text-sm">Uploaded Images</h4>
                      <div className="flex gap-2 flex-wrap">{submittedData.data.uploadedImages.map((img,i)=>(
                        <div key={i} className="text-xs"><a href={img.uploadedUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{img.seoName||img.originalName}</a></div>
                      ))}</div>
                    </div>
                  )}
                  {submittedData.data?.generatedCaption && <div className="mb-3"><h4 className="font-semibold text-gray-900 mb-1 text-sm">Caption</h4><p className="text-gray-700 text-sm whitespace-pre-wrap">{submittedData.data.generatedCaption}</p></div>}
                  {submittedData.data?.generatedHashtags?.length > 0 && (
                    <div className="mb-3"><h4 className="font-semibold text-gray-900 mb-1 text-sm">Hashtags</h4>
                      <div className="flex flex-wrap gap-1">{submittedData.data.generatedHashtags.map((t,i)=><span key={i} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">{t}</span>)}</div>
                    </div>
                  )}
                  {submittedData.data?.ghlPost && <div className="p-2 bg-white rounded border border-gray-200 text-sm"><span className="font-semibold">GHL:</span> <span className="text-gray-600">{submittedData.data.ghlPost.success?'Scheduled ('+submittedData.data.ghlPost.ghl_post_id+')':submittedData.data.ghlPost.error}</span></div>}
                  <button onClick={()=>setSubmittedData(null)} className="mt-4 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition text-sm">Create Another Post</button>
                </div>
              )}

              {!submittedData && (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* DateTime Picker - defaults to now + 1 min */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date/Time <span className="text-red-500">*</span></label>
                    <input type="datetime-local" value={formattedToPicker(formData.scheduledDateTime)}
                      onChange={(e) => setFormData(p=>({...p, scheduledDateTime: pickerToFormatted(e.target.value)}))}
                      className={'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition '+(errors.scheduledDateTime?'border-red-500 focus:ring-red-500':'border-gray-300 focus:ring-blue-500')}/>
                    <p className="text-xs text-gray-400 mt-1">Auto-formatted: {formData.scheduledDateTime}</p>
                    {errors.scheduledDateTime && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.scheduledDateTime}</div>}
                  </div>

                  {/* Post Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Post Content <span className="text-red-500">*</span></label>
                    <textarea placeholder="Enter your post caption..." value={formData.postContent} rows={4}
                      onChange={(e)=>{setFormData(p=>({...p,postContent:e.target.value})); setErrors(p=>({...p,postContent:e.target.value?'':'Required'}));}}
                      className={'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition '+(errors.postContent?'border-red-500 focus:ring-red-500':'border-gray-300 focus:ring-blue-500')}/>
                    {errors.postContent && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.postContent}</div>}
                  </div>

                  {/* Platforms - Social */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Platforms <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {socialPlatforms.map(p=>(
                        <button key={p} type="button" onClick={()=>handlePlatformToggle(p)}
                          className={'px-3 py-1.5 rounded-lg border text-sm font-medium transition '+(formData.platforms.includes(p)?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-300 hover:border-gray-400')}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {/* Video-only platforms */}
                    <p className="text-xs text-gray-400 mt-2 mb-1">Video-only platforms (requires video upload):</p>
                    <div className="flex flex-wrap gap-2">
                      {videoPlatforms.map(p=>(
                        <button key={p} type="button" onClick={()=>handlePlatformToggle(p)}
                          className={'px-3 py-1.5 rounded-lg border text-sm font-medium transition '+(formData.platforms.includes(p)?'bg-purple-600 text-white border-purple-600':formData.videoUrls?'bg-white text-gray-700 border-gray-300 hover:border-gray-400':'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed')}>
                          {p}
                        </button>
                      ))}
                    </div>
                    {errors.platforms && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.platforms}</div>}
                  </div>

                  {/* GHL Business Location */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GHL Business Location <span className="text-red-500">*</span></label>
                    <select value={formData.ghlBusiness}
                      onChange={e=>setFormData(p=>({...p,ghlBusiness:e.target.value}))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                      <option value="">-- Select a location --</option>
                      {locations.map(loc => (
                        <option key={loc.locationId} value={loc.locationId + '|' + loc.name}>
                          {loc.name} ({loc.brandKey})
                        </option>
                      ))}
                    </select>
                    {formData.ghlBusiness && (
                      <p className="text-xs text-gray-400 mt-1">Location ID: {formData.ghlBusiness.split('|')[0]}</p>
                    )}
                  </div>

                  {/* Domain Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Domain <span className="text-gray-400 text-xs">(from GHL)</span></label>
                    {loadingDomains ? (
                      <p className="text-xs text-gray-400">Loading domains...</p>
                    ) : (
                      <select value={isCustomDomainSocial ? '__custom__' : formData.ghlDomain}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            setFormData(p => ({...p, ghlDomain: '__custom__'}));
                          } else {
                            setCustomDomainInput('');
                            setFormData(p => ({...p, ghlDomain: val, externalLink: val && val.startsWith('http') ? val : p.externalLink}));
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                        <option value="">-- Select a domain --</option>
                        {selectedLocationDomains && selectedLocationDomains.domains && selectedLocationDomains.domains.length > 0 && (
                          <optgroup label={'Selected: ' + (selectedLocationDomains.name || 'Location')}>
                            {selectedLocationDomains.domains.map(function(d,i) {
                              return <option key={'sel-'+i} value={d.url}>{d.url} ({d.type})</option>;
                            })}
                            {selectedLocationDomains.website && !selectedLocationDomains.domains.find(function(d){return d.url===selectedLocationDomains.website}) && (
                              <option value={selectedLocationDomains.website}>{selectedLocationDomains.website} (website)</option>
                            )}
                          </optgroup>
                        )}
                        <optgroup label="All Locations">
                          {domainData.filter(function(d){return d.domains && d.domains.length > 0 || d.website}).map(function(loc) {
                            var items = [];
                            if (loc.website) items.push(<option key={loc.locationId+'-w'} value={loc.website}>{loc.name}: {loc.website} (website)</option>);
                            if (loc.domains) loc.domains.forEach(function(d,i) {
                              if (d.url !== loc.website) items.push(<option key={loc.locationId+'-'+i} value={d.url}>{loc.name}: {d.url} ({d.type})</option>);
                            });
                            return items;
                          })}
                        </optgroup>
                        <optgroup label="---">
                          <option value="__custom__">Enter custom URL...</option>
                        </optgroup>
                      </select>
                    )}
                    {isCustomDomainSocial && (
                      <input
                        type="url"
                        value={customDomainInput}
                        onChange={e => {
                          setCustomDomainInput(e.target.value);
                          const val = e.target.value;
                          setFormData(p => ({...p, ghlDomain: val || '__custom__', externalLink: val && val.startsWith('http') ? val : p.externalLink}));
                        }}
                        placeholder="https://yourwebsite.com"
                        className="w-full mt-2 px-4 py-2 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* External Link */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">External Link <span className="text-gray-400 text-xs">(Optional)</span></label>
                    <input type="url" placeholder="https://example.com" value={formData.externalLink}
                      onChange={e=>{setFormData(p=>({...p,externalLink:e.target.value})); if(e.target.value&&!/^https?:\\/\\/.+/.test(e.target.value)) setErrors(p=>({...p,externalLink:'Invalid URL'})); else setErrors(p=>({...p,externalLink:''}));}}
                      className={'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition '+(errors.externalLink?'border-red-500 focus:ring-red-500':'border-gray-300 focus:ring-blue-500')}/>
                    {errors.externalLink && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.externalLink}</div>}
                  </div>

                  <FileUploadArea fieldName="imageUrls" label="Primary Image" accept="image/jpeg,image/png,image/gif,image/webp" description="(JPEG, PNG, GIF, WebP) - auto SEO renamed"/>
                  <FileUploadArea fieldName="gifUrl" label="Animated GIF" accept="image/gif" description="(GIF only)"/>
                  <FileUploadArea fieldName="videoUrls" label="Video" accept="video/mp4,video/quicktime,video/x-msvideo" description="(MP4, MOV, AVI) - required for YouTube/TikTok"/>

                  <button type="submit" disabled={isSubmitting}
                    className={'w-full font-bold py-3 px-4 rounded-lg transition text-white '+(isSubmitting?'bg-blue-400 cursor-not-allowed':'bg-blue-600 hover:bg-blue-700')}>
                    {isSubmitting ? 'Submitting...' : 'Submit Post'}
                  </button>
                </form>
              )}

              {/* Sessions Panel */}
              <div className="mt-8 border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">Post Sessions</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>{setShowHistory(!showHistory);if(!showHistory)fetchSessions();}}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition">
                      {showHistory?'Hide':'View History'}
                    </button>
                    <a href="/api/sessions/export/csv" download className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition">Export CSV</a>
                  </div>
                </div>
                {showHistory && (
                  <div>
                    {loadingSessions ? <p className="text-gray-500 text-sm">Loading...</p>
                     : sessionHistory.length===0 ? <p className="text-gray-500 text-sm">No sessions yet.</p>
                     : <div className="space-y-2 max-h-80 overflow-y-auto">
                        {sessionHistory.map(s=>(
                          <div key={s.sessionId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono text-gray-400">{s.sessionId.slice(0,20)}...</span>
                                  <span className="text-xs text-gray-500">{new Date(s.createdAt).toLocaleString()}</span>
                                </div>
                                <p className="text-sm font-medium text-gray-900 truncate">{s.postContent}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{s.scheduledDateTime}</span>
                                  {s.platforms&&s.platforms.split(', ').map((p,i)=><span key={i} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{p}</span>)}
                                </div>
                              </div>
                              <button type="button" onClick={()=>deleteSession(s.sessionId)} className="ml-2 text-red-400 hover:text-red-600"><X className="h-4 w-4"/></button>
                            </div>
                          </div>
                        ))}
                      </div>}
                    <button type="button" onClick={fetchSessions} className="mt-2 text-xs text-blue-600 hover:text-blue-700 underline">Refresh</button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center py-4 text-blue-200/50 text-xs">The Listing Team - Social Media Management Suite</div>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<SocialPostForm />);
  <\/script>
</body>
</html>`;
var BLOG_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TLT Blog Importer</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
  <script>if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';<\/script>
  <style>body{margin:0;font-family:system-ui,-apple-system,sans-serif} .html-preview{background:#1e1e1e;color:#d4d4d4;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow-y:auto;padding:16px;border-radius:8px}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useRef } = React;

    const Upload = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    const X = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    const AlertCircle = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    const CheckCircle = ({className}) => <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

    function BlogImporter() {
      const [form, setForm] = useState({
        title: '', slug: '', content: '', metaDescription: '',
        category: '', tags: '', author: 'Scott Lehr',
        publishDate: new Date().toISOString().slice(0,10),
        scheduledDate: '', platform: 'ghl', imageFile: null,
        ghlBusiness: '', ghlDomain: ''
      });
      const [imagePreview, setImagePreview] = useState(null);
      const [errors, setErrors] = useState({});
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [apiError, setApiError] = useState(null);
      const [result, setResult] = useState(null);
      const [blogs, setBlogs] = useState([]);
      const [showHistory, setShowHistory] = useState(false);
      const [copied, setCopied] = useState('');
      const [spinning, setSpinning] = useState(false);
      const [spinIntensity, setSpinIntensity] = useState('medium');
      const [spinVariations, setSpinVariations] = useState([]);
      const [spinCount, setSpinCount] = useState(1);
      const htmlRef = useRef(null);
      const [locations, setLocations] = useState([]);
      const [domainData, setDomainData] = useState([]);
      const [loadingDomains, setLoadingDomains] = useState(false);
      const [customDomainInput, setCustomDomainInput] = useState('');

      // Load GHL locations + domains on mount
      useEffect(() => {
        axios.get('/api/locations').then(res => {
          setLocations(res.data.locations || []);
          const tlt = (res.data.locations || []).find(l => l.brandKey === 'tlt');
          if (tlt && !form.ghlBusiness) {
            setForm(p => ({...p, ghlBusiness: tlt.locationId + '|' + tlt.name}));
          }
        }).catch(() => {});
        setLoadingDomains(true);
        axios.get('/api/domains').then(res => {
          setDomainData(res.data.domains || []);
        }).catch(() => {}).finally(() => setLoadingDomains(false));
      }, []);

      // Get domains for the currently selected location
      const selectedLocationId = form.ghlBusiness ? form.ghlBusiness.split('|')[0] : '';
      const selectedLocationDomains = domainData.find(d => d.locationId === selectedLocationId);
      const isCustomDomain = form.ghlDomain === '__custom__';

      // Determine URL prefix based on platform: GHL uses /post/, others use /blog/
      const urlPrefix = form.platform === 'ghl' ? '/post/' : '/blog/';

      const categories = ['Real Estate', 'Market Updates', 'Home Buying', 'Home Selling', 'Investment', 'Lifestyle', 'Community', 'Tips & Advice'];

      const autoSlug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 80);

      const handleImageUpload = (file) => {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setErrors(p => ({...p, image: 'Max 10MB'})); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
          setForm(p => ({...p, imageFile: { name: file.name, type: file.type, size: file.size, data: e.target.result }}));
          setImagePreview(e.target.result);
          setErrors(p => ({...p, image: ''}));
        };
        reader.readAsDataURL(file);
      };

      const fetchBlogs = async () => {
        try { const res = await axios.get('/api/blogs'); setBlogs(res.data.blogs || []); } catch(e) {}
      };

      const copyToClipboard = async (text, label) => {
        try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 2000); } catch(e) {}
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        const newErrors = {};
        if (!form.title.trim()) newErrors.title = 'Title is required';
        if (!form.content.trim()) newErrors.content = 'Blog content is required';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

        setErrors({}); setIsSubmitting(true); setApiError(null);
        try {
          const effectiveDomain = form.ghlDomain === '__custom__' ? (customDomainInput || '') : form.ghlDomain;
          const payload = { ...form, ghlDomain: effectiveDomain, slug: form.slug || autoSlug(form.title), urlPrefix: urlPrefix };
          const response = await axios.post('/api/submit-blog', payload);
          setResult(response.data);
        } catch (error) {
          setApiError(error.response?.data?.error || error.message);
        } finally { setIsSubmitting(false); }
      };

      const resetForm = () => {
        setForm(f => ({ title: '', slug: '', content: '', metaDescription: '', category: '', tags: '', author: 'Scott Lehr', publishDate: new Date().toISOString().slice(0,10), scheduledDate: '', platform: 'ghl', imageFile: null, ghlBusiness: f.ghlBusiness, ghlDomain: f.ghlDomain }));
        setImagePreview(null); setResult(null); setErrors({});
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-800">
          {/* Brand Header */}
          <div className="bg-white/10 backdrop-blur border-b border-white/10">
            <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500 text-white font-black text-xl px-3 py-1 rounded">TLT</div>
                <div>
                  <h1 className="text-white font-bold text-lg leading-tight">The Listing Team</h1>
                  <p className="text-emerald-200 text-xs">Blog Importer</p>
                </div>
              </div>
              <nav className="flex gap-3">
                <a href="/" className="text-emerald-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Social Posts</a>
                <span className="bg-emerald-500/30 text-white text-sm px-3 py-1.5 rounded-lg font-medium border border-emerald-400/30">Blog Submitter</span>
                <a href="/bulk" className="text-emerald-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Bulk Upload</a>
                <a href="https://images.reallistingteam.com/admin" target="_blank" className="text-emerald-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Image Server</a>
              </nav>
            </div>
          </div>

          <div className="max-w-4xl mx-auto p-6 pt-8">
            <div className="bg-white rounded-xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Blog Post Importer</h2>
              <p className="text-gray-500 text-sm mb-6">Create SEO-optimized posts and blogs for GHL, Squarespace, or WordPress with full Meta Stack v4</p>

              {apiError && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"/>
                  <div className="flex-1"><h4 className="font-semibold text-red-900">Error</h4><p className="text-red-700 mt-1 text-sm">{apiError}</p>
                    <button onClick={()=>setApiError(null)} className="mt-2 text-xs text-red-600 underline">Dismiss</button>
                  </div>
                </div>
              )}

              {result ? (
                <div>
                  <div className="mb-6 p-6 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-4"><CheckCircle className="w-6 h-6 text-green-600"/><h3 className="text-lg font-semibold text-green-900">{result.ghlResult?.success ? 'Published to GHL!' : 'Blog Created'}</h3></div>
                    <div className="space-y-2 text-sm">
                      <p><span className="font-semibold">Slug:</span> {result.slug}</p>
                      <p><span className="font-semibold">URL:</span> <a href={result.canonicalUrl} className="text-blue-600 hover:underline">{result.canonicalUrl}</a></p>
                      {result.imageUrl && <p><span className="font-semibold">Image:</span> <a href={result.imageUrl} target="_blank" className="text-blue-600 hover:underline">{result.imageUrl}</a></p>}
                      {result.excerpt && <p><span className="font-semibold">Excerpt:</span> {result.excerpt}</p>}
                      {result.tags && <p><span className="font-semibold">Tags:</span> {result.tags}</p>}
                      {result.internalLinks?.length > 0 && (
                        <div><span className="font-semibold">Internal Links Added:</span>
                          <ul className="list-disc list-inside mt-1">{result.internalLinks.map((l,i) => <li key={i} className="text-blue-600">{urlPrefix}{l}</li>)}</ul>
                        </div>
                      )}
                      {result.ghlResult && (
                        <div className={'p-2 rounded border mt-2 ' + (result.ghlResult.success ? 'bg-green-100 border-green-300' : 'bg-yellow-100 border-yellow-300')}>
                          <span className="font-semibold">GHL Push:</span> {result.ghlResult.success ? 'Published (ID: ' + result.ghlResult.postId + ')' : result.ghlResult.error}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <button onClick={()=>copyToClipboard(result.fullHtml, 'html')}
                      className={'px-4 py-3 rounded-lg font-medium transition text-sm ' + (copied==='html' ? 'bg-green-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')}>
                      {copied==='html' ? 'Copied!' : 'Copy Full HTML (Meta Stack)'}
                    </button>
                    <button onClick={()=>copyToClipboard(result.bodyHtml, 'bodyhtml')}
                      className={'px-4 py-3 rounded-lg font-medium transition text-sm ' + (copied==='bodyhtml' ? 'bg-green-600 text-white' : 'bg-teal-600 hover:bg-teal-700 text-white')}>
                      {copied==='bodyhtml' ? 'Copied!' : 'Copy GHL Body HTML'}
                    </button>
                    <a href={'/api/blogs/' + result.blogId + '/csv'} download
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition text-sm text-center">
                      Download This CSV
                    </a>
                    <button onClick={()=>{ const b = new Blob([result.fullHtml], {type:'text/html'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download=result.slug+'.html'; a.click(); URL.revokeObjectURL(u); }}
                      className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition text-sm">
                      Download HTML File
                    </button>
                  </div>

                  {/* HTML Preview */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900">Generated HTML (Meta Stack v4)</h4>
                      <button onClick={()=>copyToClipboard(result.fullHtml, 'html2')} className="text-xs text-blue-600 hover:underline">
                        {copied==='html2' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="html-preview" ref={htmlRef}>{result.fullHtml}</div>
                  </div>

                  {/* Visual Preview */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Visual Preview</h4>
                    <iframe srcDoc={result.fullHtml} className="w-full h-96 border border-gray-300 rounded-lg" sandbox="allow-same-origin" title="Blog Preview"/>
                  </div>

                  <button onClick={resetForm} className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition text-sm">Create Another Blog Post</button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Platform */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Platform</label>
                    <div className="flex gap-2">
                      {[{id:'ghl',label:'GHL (Post)'},{id:'squarespace',label:'Squarespace (Blog)'},{id:'wordpress',label:'WordPress (Blog)'}].map(p => (
                        <button key={p.id} type="button" onClick={()=>setForm(f=>({...f,platform:p.id}))}
                          className={'px-4 py-2 rounded-lg border text-sm font-medium transition ' + (form.platform===p.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400')}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* GHL Business Location */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GHL Business / Website <span className="text-red-500">*</span></label>
                    <select value={form.ghlBusiness}
                      onChange={e=>setForm(p=>({...p,ghlBusiness:e.target.value}))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition bg-white">
                      <option value="">-- Select a location --</option>
                      {locations.map(loc => (
                        <option key={loc.locationId} value={loc.locationId + '|' + loc.name}>
                          {loc.name} ({loc.brandKey})
                        </option>
                      ))}
                    </select>
                    {form.ghlBusiness && (
                      <p className="text-xs text-gray-400 mt-1">Location ID: {form.ghlBusiness.split('|')[0]}</p>
                    )}
                  </div>

                  {/* Domain Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Website Domain <span className="text-gray-400 text-xs">(from GHL)</span></label>
                    {loadingDomains ? (
                      <p className="text-xs text-gray-400">Loading domains...</p>
                    ) : (
                      <select value={isCustomDomain ? '__custom__' : form.ghlDomain}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '__custom__') {
                            setForm(p => ({...p, ghlDomain: '__custom__'}));
                          } else {
                            setCustomDomainInput('');
                            setForm(p => ({...p, ghlDomain: val}));
                          }
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition bg-white">
                        <option value="">-- Select a domain --</option>
                        {selectedLocationDomains && selectedLocationDomains.domains && selectedLocationDomains.domains.length > 0 && (
                          <optgroup label={'Selected: ' + (selectedLocationDomains.name || 'Location')}>
                            {selectedLocationDomains.domains.map(function(d,i) {
                              return <option key={'sel-'+i} value={d.url}>{d.url} ({d.type})</option>;
                            })}
                            {selectedLocationDomains.website && !selectedLocationDomains.domains.find(function(d){return d.url===selectedLocationDomains.website}) && (
                              <option value={selectedLocationDomains.website}>{selectedLocationDomains.website} (website)</option>
                            )}
                          </optgroup>
                        )}
                        <optgroup label="All Locations">
                          {domainData.filter(function(d){return d.domains && d.domains.length > 0 || d.website}).map(function(loc) {
                            var items = [];
                            if (loc.website) items.push(<option key={loc.locationId+'-w'} value={loc.website}>{loc.name}: {loc.website} (website)</option>);
                            if (loc.domains) loc.domains.forEach(function(d,i) {
                              if (d.url !== loc.website) items.push(<option key={loc.locationId+'-'+i} value={d.url}>{loc.name}: {d.url} ({d.type})</option>);
                            });
                            return items;
                          })}
                        </optgroup>
                        <optgroup label="---">
                          <option value="__custom__">Enter custom URL...</option>
                        </optgroup>
                      </select>
                    )}
                    {isCustomDomain && (
                      <input
                        type="url"
                        value={customDomainInput}
                        onChange={e => {
                          setCustomDomainInput(e.target.value);
                          setForm(p => ({...p, ghlDomain: e.target.value || '__custom__'}));
                        }}
                        placeholder="https://yourwebsite.com"
                        className="w-full mt-2 px-4 py-2 border border-emerald-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{form.platform==='ghl' ? 'Post' : 'Blog'} Title <span className="text-red-500">*</span></label>
                    <input type="text" value={form.title} onChange={e=>{setForm(f=>({...f, title:e.target.value, slug: autoSlug(e.target.value)})); setErrors(p=>({...p,title:''}));}}
                      placeholder="e.g., Top 10 Neighborhoods in Fort Lauderdale for 2026"
                      className={'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition ' + (errors.title ? 'border-red-500' : 'border-gray-300 focus:ring-emerald-500')} />
                    {errors.title && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.title}</div>}
                  </div>

                  {/* URL Slug */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug</label>
                    <div className="flex items-center">
                      <span className="text-gray-400 text-sm mr-1">{urlPrefix}</span>
                      <input type="text" value={form.slug} onChange={e=>setForm(f=>({...f, slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-')}))}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                    </div>
                    {form.ghlDomain && <p className="text-xs text-gray-400 mt-1">Full URL: {form.ghlDomain}{urlPrefix}{form.slug || autoSlug(form.title)}</p>}
                  </div>

                  {/* Meta Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description <span className="text-xs text-gray-400">(SEO - auto-generated)</span></label>
                    <div className="flex gap-2">
                      <textarea value={form.metaDescription} onChange={e=>setForm(f=>({...f,metaDescription:e.target.value}))} rows={2}
                        placeholder="Auto-generated from content, or type your own"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                      <button type="button" onClick={()=>{
                        if (!form.content && !form.title) return;
                        const plain = (form.content || '').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
                        const title = form.title || '';
                        // Build a compelling meta description
                        let desc = '';
                        if (plain.length > 20) {
                          // Find first complete sentence
                          const sentences = plain.split(/[.!?]+/).filter(s => s.trim().length > 20);
                          if (sentences.length > 0) {
                            desc = sentences[0].trim();
                            if (sentences.length > 1 && desc.length < 100) desc += '. ' + sentences[1].trim();
                          } else {
                            desc = plain;
                          }
                        }
                        if (!desc) desc = title;
                        // Trim to 155 chars at word boundary, add suffix
                        if (desc.length > 140) desc = desc.substring(0, 140).replace(/\\s\\w+$/, '');
                        desc = desc + ' | The Listing Team at RESF';
                        if (desc.length > 160) desc = desc.substring(0, 157) + '...';
                        setForm(f => ({...f, metaDescription: desc}));
                      }} className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition whitespace-nowrap self-start">Auto</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{form.metaDescription.length}/160 characters {form.metaDescription.length > 160 ? '\u26A0\uFE0F Too long' : form.metaDescription.length > 120 ? '\u2705 Good' : ''}</p>
                  </div>

                  {/* Category + Tags */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition bg-white">
                        <option value="">Select category</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tags <span className="text-xs text-gray-400">(auto-generated or manual)</span></label>
                      <div className="flex gap-2">
                        <input type="text" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))}
                          placeholder="Auto-generated on submit, or type your own"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                        <button type="button" onClick={async ()=>{
                          if (!form.content && !form.title) return;
                          try {
                            const res = await axios.post('/api/spin', { title: form.title, content: form.content, metaDescription: form.metaDescription, intensity: 'light', count: 0 });
                          } catch(e) {}
                          // Client-side tag generation from content
                          const text = (form.title + ' ' + form.content + ' ' + form.category).toLowerCase();
                          const tagMap = {'real estate':['real estate','realty','listing'],'home buying':['buy','buyer','purchase','mortgage'],'home selling':['sell','seller','staging'],'market update':['market','trend','forecast'],'investment':['invest','roi','rental'],'luxury homes':['luxury','estate','waterfront'],'South Florida':['miami','fort lauderdale','broward','palm beach','coral gables'],'mortgage':['mortgage','loan','rate','financing'],'tips':['tips','advice','guide','how to'],'RESF':['resf'],'The Listing Team':['listing team','tlt']};
                          const tags = new Set();
                          for (const [tag, kws] of Object.entries(tagMap)) { for (const k of kws) { if (text.includes(k)) { tags.add(tag); break; } } }
                          tags.add('South Florida'); tags.add('real estate');
                          setForm(f=>({...f, tags: [...tags].join(', ')}));
                        }} className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition whitespace-nowrap">Auto Tags</button>
                      </div>
                    </div>
                  </div>

                  {/* Author + Dates */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                      <input type="text" value={form.author} onChange={e=>setForm(f=>({...f,author:e.target.value}))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Publish Date</label>
                      <input type="date" value={form.publishDate} onChange={e=>setForm(f=>({...f,publishDate:e.target.value}))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date <span className="text-xs text-gray-400">(opt)</span></label>
                      <input type="date" value={form.scheduledDate} onChange={e=>setForm(f=>({...f,scheduledDate:e.target.value}))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition" />
                    </div>
                  </div>

                  {/* Featured Image */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Featured Image</label>
                    {!form.imageFile ? (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition">
                        <input type="file" accept="image/*" onChange={e=>handleImageUpload(e.target.files?.[0])} className="hidden" id="blog-image" />
                        <label htmlFor="blog-image" className="cursor-pointer">
                          <Upload className="mx-auto h-7 w-7 text-gray-400 mb-1"/>
                          <p className="text-sm text-gray-600">Upload featured image (auto-uploads to image server)</p>
                        </label>
                      </div>
                    ) : (
                      <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                        {imagePreview && <img src={imagePreview} alt="Preview" className="max-h-32 mx-auto mb-2 rounded"/>}
                        <div className="flex items-center justify-between">
                          <div><p className="text-sm font-medium">{form.imageFile.name}</p><p className="text-xs text-gray-500">{(form.imageFile.size/1024).toFixed(1)} KB</p></div>
                          <button type="button" onClick={()=>{setForm(f=>({...f,imageFile:null}));setImagePreview(null);}} className="text-red-500 hover:text-red-700"><X className="h-5 w-5"/></button>
                        </div>
                      </div>
                    )}
                    {errors.image && <p className="text-red-600 text-sm mt-1">{errors.image}</p>}
                  </div>

                  {/* AI Content Writer */}
                  <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-purple-900 text-sm">AI Content Writer</h4>
                      <span className="text-xs text-purple-600">Powered by Claude</span>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" id="ai-topic" placeholder="Enter a topic (e.g., 'Top 10 Neighborhoods in Fort Lauderdale')"
                        className="flex-1 px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"/>
                      <select id="ai-length" className="px-2 py-2 border border-purple-300 rounded-lg text-xs bg-white">
                        <option value="short">Short</option>
                        <option value="medium" selected>Medium</option>
                        <option value="long">Long</option>
                      </select>
                      <button type="button" onClick={async ()=>{
                        const topic = document.getElementById('ai-topic').value;
                        const length = document.getElementById('ai-length').value;
                        if (!topic) return;
                        setIsSubmitting(true); setApiError(null);
                        try {
                          const res = await axios.post('/api/ai-write', { topic, type: 'blog', keywords: form.tags, tone: 'professional', length });
                          if (res.data.success) {
                            setForm(f => ({...f,
                              content: res.data.content || f.content,
                              title: f.title || res.data.title || topic,
                              slug: f.slug || res.data.slug || '',
                              metaDescription: f.metaDescription || res.data.metaDescription || '',
                              tags: f.tags || res.data.tags || ''
                            }));
                            setErrors(p => ({...p, content: ''}));
                          } else { setApiError(res.data.error || res.data.note); }
                        } catch(e) { setApiError('AI writer failed: ' + (e.response?.data?.error || e.message)); }
                        finally { setIsSubmitting(false); }
                      }} disabled={isSubmitting}
                        className={'px-4 py-2 rounded-lg text-sm font-medium transition ' + (isSubmitting ? 'bg-purple-300 cursor-not-allowed text-purple-700' : 'bg-purple-600 hover:bg-purple-700 text-white')}>
                        {isSubmitting ? 'Writing...' : 'Generate'}
                      </button>
                    </div>
                  </div>

                  {/* Import from Document */}
                  <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-blue-900 text-sm">Import from Document</h4>
                      <span className="text-xs text-blue-600">.docx, .pdf, .txt</span>
                    </div>
                    <input type="file" accept=".docx,.pdf,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/plain"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        // Handle PDFs client-side with pdf.js for better extraction
                        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                          try {
                            const arrayBuffer = await file.arrayBuffer();
                            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                            const pages = [];
                            let firstLine = '';
                            for (let i = 1; i <= pdf.numPages; i++) {
                              const page = await pdf.getPage(i);
                              const textContent = await page.getTextContent();
                              const pageText = textContent.items.map(item => item.str).join(' ');
                              if (i === 1 && pageText.trim()) {
                                // First meaningful line becomes the title
                                const lines = pageText.split(/[.!?]/).filter(l => l.trim().length > 10);
                                firstLine = lines[0]?.trim().substring(0, 100) || pageText.trim().substring(0, 100);
                              }
                              // Group into paragraphs by detecting gaps
                              const lines = [];
                              let currentLine = '';
                              let lastY = null;
                              for (const item of textContent.items) {
                                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 12) {
                                  if (currentLine.trim()) lines.push(currentLine.trim());
                                  currentLine = '';
                                }
                                currentLine += item.str + ' ';
                                lastY = item.transform[5];
                              }
                              if (currentLine.trim()) lines.push(currentLine.trim());
                              // Convert lines to HTML paragraphs
                              const htmlLines = lines.map(l => {
                                if (l.length < 60 && l === l.toUpperCase()) return '<h2>' + l.charAt(0) + l.slice(1).toLowerCase() + '</h2>';
                                if (l.length < 80 && /^[A-Z]/.test(l) && !l.includes('.')) return '<h3>' + l + '</h3>';
                                return '<p>' + l + '</p>';
                              });
                              pages.push(htmlLines.join('\\n'));
                            }
                            const html = pages.join('\\n<hr style="margin:2rem 0;border:none;border-top:1px solid #eee">\\n');
                            setForm(f => {
                              const plain = html.replace(/<[^>]+>/g,' ').replace(/s+/g,' ').trim();
                              const autoDesc = !f.metaDescription ? (plain.split(/[.!?]+/).filter(s=>s.trim().length>20)[0]||plain).substring(0,140).trim() + ' | The Listing Team at RESF' : f.metaDescription;
                              return {...f, content: html, title: f.title || firstLine, slug: f.slug || firstLine?.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,80) || f.slug, metaDescription: autoDesc };
                            });
                            setErrors(p => ({...p, content: ''}));
                          } catch(err) { setApiError('PDF extraction failed: ' + err.message); }
                          e.target.value = '';
                          return;
                        }

                        // DOCX and TXT: send to server
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                          try {
                            const res = await axios.post('/api/extract-text', { fileData: ev.target.result, fileName: file.name, fileType: file.type });
                            if (res.data.success) {
                              setForm(f => {
                                const plain = (res.data.html||'').replace(/<[^>]+>/g,' ').replace(/s+/g,' ').trim();
                                const autoDesc = !f.metaDescription ? (plain.split(/[.!?]+/).filter(s=>s.trim().length>20)[0]||plain).substring(0,140).trim() + ' | The Listing Team at RESF' : f.metaDescription;
                                return {...f, content: res.data.html, title: f.title || res.data.title, slug: f.slug || res.data.title?.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,80) || f.slug, metaDescription: autoDesc };
                              });
                              setErrors(p => ({...p, content: ''}));
                            } else { setApiError(res.data.error); }
                          } catch(err) { setApiError('Failed to extract text: ' + (err.response?.data?.error || err.message)); }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer" />
                    <p className="text-xs text-blue-600 mt-1">Upload a Word doc, PDF, or text file to auto-fill the content below</p>
                  </div>

                  {/* Blog Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{form.platform==='ghl' ? 'Post' : 'Blog'} Content <span className="text-red-500">*</span> <span className="text-xs text-gray-400">(HTML or plain text)</span></label>
                    <textarea value={form.content} onChange={e=>{
                      const val = e.target.value;
                      setForm(f=>{
                        const updated = {...f, content: val};
                        // Auto-generate meta description if empty and content is substantial
                        if (!f.metaDescription && val.length > 100) {
                          const plain = val.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim();
                          const sentences = plain.split(/[.!?]+/).filter(s => s.trim().length > 20);
                          let desc = sentences.length > 0 ? sentences[0].trim() : plain.substring(0, 140);
                          if (desc.length > 140) desc = desc.substring(0, 140).replace(/\\s\\w+$/, '');
                          updated.metaDescription = desc + ' | The Listing Team at RESF';
                        }
                        return updated;
                      });
                      setErrors(p=>({...p,content:''}));
                    }}
                      rows={12} placeholder="Write your blog post content here, or import from a document above..."
                      className={'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 transition font-mono text-sm ' + (errors.content ? 'border-red-500' : 'border-gray-300 focus:ring-emerald-500')} />
                    {errors.content && <div className="flex items-center mt-1 text-red-600 text-sm"><AlertCircle className="h-4 w-4 mr-1"/>{errors.content}</div>}
                  </div>

                  {/* Spin Content Section */}
                  <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-orange-900 text-sm">Content Spinner</h4>
                      <div className="flex items-center gap-2">
                        <select value={spinIntensity} onChange={e=>setSpinIntensity(e.target.value)}
                          className="text-xs px-2 py-1 border border-orange-300 rounded bg-white">
                          <option value="light">Light</option>
                          <option value="medium">Medium</option>
                          <option value="heavy">Heavy</option>
                        </select>
                        <select value={spinCount} onChange={e=>setSpinCount(Number(e.target.value))}
                          className="text-xs px-2 py-1 border border-orange-300 rounded bg-white">
                          <option value={1}>1 variation</option>
                          <option value={2}>2 variations</option>
                          <option value={3}>3 variations</option>
                          <option value={5}>5 variations</option>
                        </select>
                        <button type="button" disabled={spinning || !form.content}
                          onClick={async ()=>{
                            if (!form.content) return;
                            setSpinning(true); setSpinVariations([]);
                            try {
                              const res = await axios.post('/api/spin', { title: form.title, content: form.content, metaDescription: form.metaDescription, intensity: spinIntensity, count: spinCount });
                              setSpinVariations(res.data.variations || []);
                            } catch(e) { setApiError('Spin failed: ' + (e.message || 'Unknown error')); }
                            finally { setSpinning(false); }
                          }}
                          className={'px-3 py-1.5 rounded text-xs font-medium transition ' + (spinning ? 'bg-orange-300 cursor-not-allowed text-orange-700' : 'bg-orange-500 hover:bg-orange-600 text-white')}>
                          {spinning ? 'Spinning...' : 'Spin Content'}
                        </button>
                      </div>
                    </div>
                    {!form.content && <p className="text-xs text-orange-600">Write content first, then spin it.</p>}
                    {spinVariations.length > 0 && (
                      <div className="space-y-3 mt-3">
                        {spinVariations.map((v, i) => (
                          <div key={i} className="bg-white border border-orange-200 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-orange-700">Variation {v.variation}</span>
                              <div className="flex gap-2">
                                <button type="button" onClick={()=>{setForm(f=>({...f, title: v.title || f.title, content: v.content, metaDescription: v.metaDescription || f.metaDescription})); setSpinVariations([]);}}
                                  className="text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded">Use This</button>
                                <button type="button" onClick={()=>copyToClipboard(v.content, 'spin-'+i)}
                                  className="text-xs text-blue-600 hover:underline">{copied===('spin-'+i) ? 'Copied!' : 'Copy'}</button>
                              </div>
                            </div>
                            {v.title && <p className="text-sm font-medium text-gray-900 mb-1">{v.title}</p>}
                            <div className="text-xs text-gray-700 max-h-32 overflow-y-auto whitespace-pre-wrap">{v.content.substring(0, 500)}{v.content.length > 500 ? '...' : ''}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button type="submit" disabled={isSubmitting}
                    className={'w-full font-bold py-3 px-4 rounded-lg transition text-white ' + (isSubmitting ? 'bg-emerald-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700')}>
                    {isSubmitting ? 'Generating...' : (form.platform==='ghl' ? 'Generate Post' : 'Generate Blog Post')}
                  </button>

                  {form.platform === 'ghl' && (
                    <button type="button" disabled={isSubmitting || !form.title || !form.content}
                      onClick={async ()=>{
                        if (!form.title || !form.content) return;
                        setIsSubmitting(true); setApiError(null);
                        try {
                          const payload = { ...form, slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,80), pushToGHL: true, urlPrefix: urlPrefix };
                          const response = await axios.post('/api/submit-blog', payload);
                          setResult(response.data);
                        } catch(e) { setApiError(e.response?.data?.error || e.message); }
                        finally { setIsSubmitting(false); }
                      }}
                      className={'w-full font-bold py-3 px-4 rounded-lg transition text-white mt-2 ' + (isSubmitting ? 'bg-orange-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600')}>
                      {isSubmitting ? 'Pushing to GHL...' : 'Generate & Push to GHL'}
                    </button>
                  )}
                </form>
              )}

              {/* Blog History */}
              <div className="mt-8 border-t border-gray-200 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900">Blog Posts</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>{setShowHistory(!showHistory);if(!showHistory)fetchBlogs();}}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition">
                      {showHistory ? 'Hide' : 'View History'}
                    </button>
                    <a href="/api/blogs/export/csv" download className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition">Export GHL CSV</a>
                  </div>
                </div>
                {showHistory && (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {blogs.length === 0 ? <p className="text-gray-500 text-sm">No blogs yet.</p> :
                      blogs.map(b => (
                        <div key={b.blogId} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{b.title}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">{b.publishDate}</span>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{b.platform === 'ghl' ? '/post/' : '/blog/'}{b.slug}</span>
                                {b.category && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{b.category}</span>}
                                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">{b.platform}</span>
                              </div>
                            </div>
                            <div className="flex gap-1 ml-2">
                              <button type="button" onClick={()=>copyToClipboard(b.fullHtml, b.blogId)} className="text-blue-500 hover:text-blue-700 text-xs underline">
                                {copied===b.blogId ? 'Copied!' : 'HTML'}
                              </button>
                              <a href={'/api/blogs/'+b.blogId+'/csv'} download className="text-emerald-500 hover:text-emerald-700 text-xs underline">CSV</a>
                              <button type="button" onClick={()=>{ axios.delete('/api/blogs/'+b.blogId); setBlogs(p=>p.filter(x=>x.blogId!==b.blogId)); }}
                                className="text-red-400 hover:text-red-600"><X className="h-4 w-4"/></button>
                            </div>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
            <div className="text-center py-4 text-emerald-200/50 text-xs">The Listing Team - Blog Management Suite</div>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<BlogImporter />);
  <\/script>
</body>
</html>`;
var BULK_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>TLT Bulk Post Uploader</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"><\/script>
  <style>body{margin:0;font-family:system-ui,-apple-system,sans-serif}</style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    function BulkUploader() {
      const [posts, setPosts] = useState([]);
      const [csvText, setCsvText] = useState('');
      const [aiTopic, setAiTopic] = useState('');
      const [aiCount, setAiCount] = useState(5);
      const [platforms, setPlatforms] = useState(['Facebook','Instagram']);
      const [ghlBusiness, setGhlBusiness] = useState('');
      const [locations, setLocations] = useState([]);
      const [isProcessing, setIsProcessing] = useState(false);
      const [isGenerating, setIsGenerating] = useState(false);
      const [results, setResults] = useState(null);
      const [error, setError] = useState('');

      const allPlatforms = ['Facebook','Instagram','LinkedIn','Twitter/X','Google Business Profile','YouTube','TikTok'];

      useEffect(() => {
        axios.get('/api/locations').then(r => {
          setLocations(r.data.locations || []);
          const tlt = (r.data.locations || []).find(l => l.brandKey === 'tlt');
          if (tlt) setGhlBusiness(tlt.locationId + '|' + tlt.name);
        }).catch(() => {});
      }, []);

      // Parse CSV/pasted text into posts array
      const parseInput = (text) => {
        const lines = text.trim().split('\\n').filter(l => l.trim());
        if (!lines.length) return;

        // Detect if it's CSV with headers
        const firstLine = lines[0].toLowerCase();
        const hasHeaders = firstLine.includes('content') || firstLine.includes('date') || firstLine.includes('caption');
        const startIdx = hasHeaders ? 1 : 0;

        const parsed = [];
        for (let i = startIdx; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Try CSV parsing
          const parts = line.match(/("([^"]|"")*"|[^,]*)(,("([^"]|"")*"|[^,]*))?/g) || [line];
          const clean = parts.map(p => p.replace(/^"|"$/g, '').replace(/""/g, '"').trim());

          if (clean.length >= 2) {
            // Assume: date, content, [link], [imageUrl]
            parsed.push({
              scheduledDateTime: clean[0] || '',
              content: clean[1] || '',
              externalLink: clean[2] || '',
              imageUrl: clean[3] || '',
              hashtags: ''
            });
          } else {
            // Single column = just content, auto-assign dates
            const now = new Date();
            now.setDate(now.getDate() + parsed.length);
            now.setHours(10, 0, 0);
            const pad = n => String(n).padStart(2,'0');
            const dt = now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' 10:00:00';
            parsed.push({ scheduledDateTime: dt, content: line, externalLink: '', imageUrl: '', hashtags: '' });
          }
        }
        setPosts(parsed);
      };

      // Auto-generate hashtags for all posts
      const generateAllHashtags = () => {
        setPosts(prev => prev.map(p => {
          const words = p.content.toLowerCase().split(/\\s+/).filter(w => w.length > 4).slice(0, 5);
          const tags = words.map(w => '#' + w.replace(/[^a-z0-9]/g, '')).concat(['#socialmedia','#marketing','#realestate','#southflorida']).slice(0, 10);
          return { ...p, hashtags: tags.join(' ') };
        }));
      };

      // AI generate social posts
      const aiGenerate = async () => {
        if (!aiTopic) return;
        setIsGenerating(true); setError('');
        try {
          const res = await axios.post('/api/ai-write', { topic: aiTopic, type: 'social', length: aiCount <= 3 ? 'short' : aiCount <= 5 ? 'medium' : 'long' });
          if (res.data.posts) {
            const now = new Date();
            const generated = res.data.posts.map((p, i) => {
              const d = new Date(now); d.setDate(d.getDate() + i); d.setHours(10, 0, 0);
              const pad = n => String(n).padStart(2,'0');
              const dt = d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' 10:00:00';
              return { scheduledDateTime: dt, content: p.content || p, externalLink: '', imageUrl: '', hashtags: '' };
            });
            setPosts(prev => [...prev, ...generated]);
          } else if (res.data.raw) {
            setPosts(prev => [...prev, { scheduledDateTime: '', content: res.data.raw, externalLink: '', imageUrl: '', hashtags: '' }]);
          }
        } catch(e) { setError('AI generation failed: ' + (e.response?.data?.error || e.message)); }
        finally { setIsGenerating(false); }
      };

      // Submit all posts
      const submitAll = async () => {
        if (!posts.length) return;
        setIsProcessing(true); setError(''); setResults(null);
        try {
          const payload = {
            posts: posts.map(p => ({
              postContent: p.content + (p.hashtags ? '\\n\\n' + p.hashtags : ''),
              scheduledDateTime: p.scheduledDateTime,
              externalLink: p.externalLink,
              imageUrl: p.imageUrl,
              platforms
            })),
            ghlBusiness, platforms
          };
          const res = await axios.post('/api/bulk-submit', payload);
          setResults(res.data);
        } catch(e) { setError('Bulk submit failed: ' + (e.response?.data?.error || e.message)); }
        finally { setIsProcessing(false); }
      };

      // Export as GHL CSV
      const exportCSV = () => {
        const headers = ['postAtSpecificTime (YYYY-MM-DD HH:mm:ss)','content','link (OGmetaUrl)','imageUrls','gifUrl','videoUrls'];
        const rows = posts.map(p => {
          const esc = v => { const s = String(v||''); return (s.includes(',')||s.includes('"')||s.includes('\\n')) ? '"'+s.replace(/"/g,'""')+'"' : s; };
          return [p.scheduledDateTime, p.content + (p.hashtags ? '\\n\\n' + p.hashtags : ''), p.externalLink, p.imageUrl, '', ''].map(esc).join(',');
        });
        const csv = [headers.join(','), ...rows].join('\\n');
        const blob = new Blob([csv], {type:'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'bulk-social-posts-' + new Date().toISOString().slice(0,10) + '.csv';
        a.click(); URL.revokeObjectURL(url);
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-orange-900 to-slate-800">
          <div className="bg-white/10 backdrop-blur border-b border-white/10">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500 text-white font-black text-xl px-3 py-1 rounded">TLT</div>
                <div><h1 className="text-white font-bold text-lg leading-tight">The Listing Team</h1><p className="text-orange-200 text-xs">Bulk Post Uploader</p></div>
              </div>
              <nav className="flex gap-3">
                <a href="/" className="text-orange-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Social Posts</a>
                <a href="/blog" className="text-orange-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Blog Submitter</a>
                <span className="bg-orange-500/30 text-white text-sm px-3 py-1.5 rounded-lg font-medium border border-orange-400/30">Bulk Upload</span>
                <a href="https://images.reallistingteam.com/admin" target="_blank" className="text-orange-200 hover:text-white text-sm px-3 py-1.5 rounded-lg font-medium hover:bg-white/10 transition">Image Server</a>
              </nav>
            </div>
          </div>

          <div className="max-w-5xl mx-auto p-6 pt-8">
            <div className="bg-white rounded-xl shadow-2xl p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Bulk Social Post Uploader</h2>
              <p className="text-gray-500 text-sm mb-6">Paste multiple posts, generate with AI, or upload CSV. Auto-generates hashtags. Exports GHL-ready CSV.</p>

              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error} <button onClick={()=>setError('')} className="ml-2 underline text-xs">Dismiss</button></div>}

              {/* AI Generator */}
              <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 mb-6">
                <h3 className="font-semibold text-purple-900 text-sm mb-2">AI Post Generator</h3>
                <div className="flex gap-2">
                  <input type="text" value={aiTopic} onChange={e=>setAiTopic(e.target.value)} placeholder="Topic: e.g., Spring home buying tips in South Florida"
                    className="flex-1 px-3 py-2 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"/>
                  <select value={aiCount} onChange={e=>setAiCount(Number(e.target.value))} className="px-2 py-2 border border-purple-300 rounded-lg text-xs bg-white">
                    <option value={3}>3 posts</option><option value={5}>5 posts</option><option value={7}>7 posts</option>
                  </select>
                  <button onClick={aiGenerate} disabled={isGenerating || !aiTopic}
                    className={'px-4 py-2 rounded-lg text-sm font-medium transition '+(isGenerating?'bg-purple-300 text-purple-700 cursor-not-allowed':'bg-purple-600 hover:bg-purple-700 text-white')}>
                    {isGenerating ? 'Generating...' : 'Generate Posts'}
                  </button>
                </div>
              </div>

              {/* Paste/CSV Input */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 text-sm mb-2">Paste Posts or CSV</h3>
                <textarea value={csvText} onChange={e=>setCsvText(e.target.value)} rows={5}
                  placeholder={"Paste one post per line, or CSV format:\\ndate, content, link, imageUrl\\n2026-04-01 10:00:00, Check out our new listings!, https://reallistingagent.com, https://images...\\n\\nOr just paste captions (dates auto-assigned):"}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 transition font-mono text-sm"/>
                <button onClick={()=>{parseInput(csvText); setCsvText('');}} disabled={!csvText.trim()}
                  className="mt-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50">
                  Add Posts
                </button>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Platforms</label>
                  <div className="flex flex-wrap gap-1">
                    {allPlatforms.map(p => (
                      <button key={p} type="button" onClick={()=>setPlatforms(prev=>prev.includes(p)?prev.filter(x=>x!==p):[...prev,p])}
                        className={'px-2 py-1 rounded border text-xs font-medium transition '+(platforms.includes(p)?'bg-orange-500 text-white border-orange-500':'bg-white text-gray-600 border-gray-300')}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GHL Location</label>
                  <select value={ghlBusiness} onChange={e=>setGhlBusiness(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    <option value="">Select location</option>
                    {locations.map(l => <option key={l.locationId} value={l.locationId+'|'+l.name}>{l.name} ({l.brandKey})</option>)}
                  </select>
                </div>
              </div>

              {/* Posts Table */}
              {posts.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{posts.length} Posts Queued</h3>
                    <div className="flex gap-2">
                      <button onClick={generateAllHashtags} className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition">Auto Hashtags</button>
                      <button onClick={()=>setPosts([])} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium transition">Clear All</button>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-12">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-40">Date/Time</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Content</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {posts.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{i+1}</td>
                            <td className="px-3 py-2">
                              <input type="text" value={p.scheduledDateTime} onChange={e=>{const np=[...posts]; np[i]={...np[i],scheduledDateTime:e.target.value}; setPosts(np);}}
                                className="w-full px-2 py-1 border border-gray-200 rounded text-xs"/>
                            </td>
                            <td className="px-3 py-2">
                              <div className="text-xs text-gray-900 truncate max-w-md">{p.content.substring(0,80)}...</div>
                              {p.hashtags && <div className="text-xs text-blue-500 truncate">{p.hashtags.substring(0,60)}</div>}
                            </td>
                            <td className="px-3 py-2">
                              <button onClick={()=>setPosts(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {posts.length > 0 && (
                <div className="flex gap-3">
                  <button onClick={exportCSV} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition">
                    Export GHL CSV ({posts.length} posts)
                  </button>
                  <button onClick={submitAll} disabled={isProcessing}
                    className={'flex-1 py-3 font-bold rounded-lg transition text-white '+(isProcessing?'bg-orange-400 cursor-not-allowed':'bg-orange-600 hover:bg-orange-700')}>
                    {isProcessing ? 'Processing...' : 'Submit All & Save (' + posts.length + ' posts)'}
                  </button>
                </div>
              )}

              {/* Results */}
              {results && (
                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-2">Bulk Upload Complete</h3>
                  <p className="text-sm text-green-700">Processed: {results.processed} | Failed: {results.failed} | Total: {results.total}</p>
                  <button onClick={()=>{setResults(null);setPosts([]);}} className="mt-2 text-sm text-green-600 underline">Clear & Start New Batch</button>
                </div>
              )}
            </div>
            <div className="text-center py-4 text-orange-200/50 text-xs">The Listing Team - Bulk Social Media Management</div>
          </div>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<BulkUploader />);
  <\/script>
</body>
</html>`;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
