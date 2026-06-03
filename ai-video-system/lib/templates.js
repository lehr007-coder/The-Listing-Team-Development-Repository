// Email + SMS template engine.
//
// Replaces the previous "agent generates raw HTML on every render" flow
// with server-rendered shells that the agent only fills with copy.
// Saves LLM tokens, enforces brand consistency, and lets you change
// branding via BRAND_* env vars without touching the agent prompt.
//
// Shape:
//   • One unified email shell handles all video_types
//   • Per-video-type overrides (subject prefix, preheader, default CTA,
//     SMS hook) live in VIDEO_TYPE_TEMPLATES below
//   • Both the agent's freshly-generated copy AND any per-type defaults
//     fall through to a generic default if not specified
//
// The agent's new output schema is the smaller:
//   { sms_copy, email_subject, email_body_copy, cta_text, conversation_note }
// — no HTML generation.

import { getBrand } from "./brand.js";

// Per-video-type defaults. The agent's output overrides any of these when
// it returns non-empty values; this map is purely a fallback + adds the
// per-type "campaign feel" (subject prefix, preheader copy, default CTA).
export const VIDEO_TYPE_TEMPLATES = {
  seller_valuation: {
    subjectPrefix: "Your home value update",
    preheader: "Real-time market analysis based on your home",
    ctaDefault: "See my full estimate",
    smsPrefix: "🏡 ",
  },
  fsbo_outreach: {
    subjectPrefix: "Quick thought on selling your home",
    preheader: "30 seconds — one idea that could change your numbers",
    ctaDefault: "Watch the 30-sec video",
    smsPrefix: "👋 ",
  },
  expired_listing: {
    subjectPrefix: "About your listing",
    preheader: "A fresh strategy if you're still planning to sell",
    ctaDefault: "See my plan",
    smsPrefix: "🏠 ",
  },
  buyer_activity: {
    subjectPrefix: "About the homes you've been looking at",
    preheader: "Saw what you favorited — quick thought",
    ctaDefault: "Watch the video",
    smsPrefix: "🔑 ",
  },
  new_listing_match: {
    subjectPrefix: "New listing — matches what you're looking for",
    preheader: "Just hit the market — wanted to send before the rush",
    ctaDefault: "See the listing",
    smsPrefix: "🆕 ",
  },
  market_update: {
    subjectPrefix: "Your monthly market update",
    preheader: "30-sec recap of what's happening in your neighborhood",
    ctaDefault: "Watch the update",
    smsPrefix: "📈 ",
  },
  open_house_invite: {
    subjectPrefix: "Open house invitation",
    preheader: "Hosting this weekend — wanted to personally invite you",
    ctaDefault: "RSVP / Get details",
    smsPrefix: "🚪 ",
  },
  showing_request: {
    subjectPrefix: "Your showing request",
    preheader: "Confirming and a quick note",
    ctaDefault: "Confirm the showing",
    smsPrefix: "📅 ",
  },
  appointment_reminder: {
    subjectPrefix: "Looking forward to our chat",
    preheader: "Quick personal note before we meet",
    ctaDefault: "Add to calendar",
    smsPrefix: "🗓️ ",
  },
  mortgage_update: {
    subjectPrefix: "Mortgage rates moved",
    preheader: "What it could mean for what you're shopping",
    ctaDefault: "Talk it through",
    smsPrefix: "💰 ",
  },
  lead_nurture: {
    subjectPrefix: "Something useful for you",
    preheader: "30-sec personal video — no pitch",
    ctaDefault: "Watch the video",
    smsPrefix: "👋 ",
  },
  priority_lead: {
    subjectPrefix: "Top of my list",
    preheader: "Personal video — you're a priority this week",
    ctaDefault: "Reply or schedule a call",
    smsPrefix: "⭐ ",
  },
  default: {
    subjectPrefix: "A quick video for you",
    preheader: "Personalized from The Listing Team",
    ctaDefault: "Watch your video",
    smsPrefix: "",
  },
};

function templateFor(videoType) {
  return VIDEO_TYPE_TEMPLATES[videoType] || VIDEO_TYPE_TEMPLATES.default;
}

// Render the email subject. If the agent supplied one, prefer it.
// Otherwise build from the per-type prefix and contact name.
export function renderEmailSubject({ videoType, agentSubject, firstName }) {
  if (agentSubject && agentSubject.trim()) return agentSubject.trim();
  const t = templateFor(videoType);
  return firstName ? `${t.subjectPrefix}, ${firstName}` : t.subjectPrefix;
}

// Render the full email HTML. Body copy comes from the agent; everything
// else (chrome, branding, CTA button, footer) is template-owned.
//
// Required vars:
//   firstName, hostedUrl, gifUrl, bodyCopy, ctaText, ctaUrl
//   videoType (used for preheader fallback)
//   env (for brand resolution)
export function renderEmailHtml({ env, videoType, firstName, hostedUrl, gifUrl,
                                  bodyCopy, ctaText, ctaUrl, preheader }) {
  const brand = getBrand(env);
  const t = templateFor(videoType);
  const previewText = preheader || t.preheader;
  const cta = ctaText || t.ctaDefault;
  const link = ctaUrl || hostedUrl;
  const greetName = firstName || "there";

  const unsubscribe = brand.unsubscribeUrl
    ? `<a href="${brand.unsubscribeUrl}" style="color:#888;text-decoration:underline">Unsubscribe</a> · `
    : "";

  const gifBlock = gifUrl
    ? `<a href="${hostedUrl}" style="display:block;text-decoration:none;position:relative">
         <div style="position:relative;display:inline-block;width:100%;max-width:540px">
           <img src="${gifUrl}" alt="Watch your video"
                style="display:block;width:100%;max-width:540px;height:auto;border:0;border-radius:14px;margin:0 auto;box-shadow:0 6px 24px rgba(0,0,0,0.18)">
           <!--[if !mso]><!-->
           <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:72px;height:72px;background:rgba(255,106,0,0.95);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,0.35);pointer-events:none">
             <div style="width:0;height:0;border-left:22px solid #fff;border-top:14px solid transparent;border-bottom:14px solid transparent;margin-left:6px"></div>
           </div>
           <!--<![endif]-->
         </div>
       </a>`
    : `<a href="${hostedUrl}" style="display:inline-block;padding:14px 24px;background:${brand.primaryColor};color:#fff;text-decoration:none;border-radius:10px;font-weight:600">▶ Watch your video</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(t.subjectPrefix)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${brand.textColor}">
<!-- preheader (hidden inbox preview) -->
<div style="display:none;font-size:1px;color:${brand.bgColor};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(previewText)}</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background:${brand.bgColor}">
  <tr><td align="center" style="padding:24px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">

      <!-- header -->
      <tr><td align="center" style="padding:28px 24px 14px">
        <a href="${brand.websiteUrl}" style="text-decoration:none">
          <img src="${brand.logoUrl}" alt="${escapeHtml(brand.name)}" style="height:72px;max-height:72px;width:auto;border:0">
        </a>
      </td></tr>

      <!-- hero (clickable GIF) -->
      <tr><td align="center" style="padding:8px 24px 4px">${gifBlock}</td></tr>

      <!-- greeting + body -->
      <tr><td style="padding:20px 28px 8px;font-size:16px;line-height:1.55">
        <p style="margin:0 0 12px">Hi ${escapeHtml(greetName)},</p>
        <p style="margin:0 0 12px">${escapeHtml(bodyCopy || "I just put together a quick personal video for you — click above to watch.")}</p>
      </td></tr>

      <!-- CTA button -->
      <tr><td align="center" style="padding:8px 24px 24px">
        <a href="${link}" style="display:inline-block;padding:14px 28px;background:${brand.primaryColor};color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">${escapeHtml(cta)}</a>
      </td></tr>

      <!-- footer -->
      <tr><td align="center" style="padding:16px 24px 22px;border-top:1px solid #eee;font-size:12px;color:#888;line-height:1.6">
        <div>${escapeHtml(brand.footerText)}</div>
        <div style="margin-top:6px">${unsubscribe}<a href="${brand.websiteUrl}" style="color:#888;text-decoration:underline">${escapeHtml(brand.name)}</a></div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Render the SMS body. Agent-supplied copy wins; otherwise build from
// type-default + hosted URL. Final length capped at 320 chars.
export function renderSmsBody({ videoType, agentSmsCopy, firstName, hostedUrl }) {
  if (agentSmsCopy && agentSmsCopy.includes("{{HOSTED_URL}}")) {
    // Agent already structured the message with our placeholder —
    // delivery.js#applyTemplateVars will substitute. Just enforce length.
    return truncate(agentSmsCopy, 320);
  }
  const t = templateFor(videoType);
  const name = firstName ? `${firstName}, ` : "";
  if (agentSmsCopy && agentSmsCopy.trim()) {
    // Agent gave us body copy but no URL token — append our link.
    return truncate(`${t.smsPrefix}${name}${agentSmsCopy.trim()} ${hostedUrl}`, 320);
  }
  // Final fallback — pure template
  return truncate(`${t.smsPrefix}${name}made you a quick 30-sec video — ${hostedUrl}`, 320);
}

function truncate(s, max) {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
