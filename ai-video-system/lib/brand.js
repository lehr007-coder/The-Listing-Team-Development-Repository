// Central brand-configuration module.
//
// All visual + textual brand values flow through this single source.
// Every value falls back to a sensible default, so the worker boots and
// renders sane emails even before any BRAND_* secret is set. To
// rebrand (change logo / color / signature) you only need to set env
// vars — no code change.
//
// Env vars (all optional):
//   BRAND_NAME             — "The Listing Team"
//   BRAND_LOGO_URL         — https URL to a PNG/SVG logo, ~200x60
//   BRAND_PRIMARY_COLOR    — hex like "#ff6a00" (used for CTAs, accents)
//   BRAND_TEXT_COLOR       — body text color, default "#222222"
//   BRAND_BG_COLOR         — email background, default "#f6f6f6"
//   BRAND_WEBSITE_URL      — homepage, used in footer
//   BRAND_FOOTER_TEXT      — replaces the default copyright line
//   BRAND_UNSUBSCRIBE_URL  — if set, adds an Unsubscribe link in footer
//   BRAND_AGENT_SIGNATURE  — overrides per-contact agent name fallback

const DEFAULT_LOGO_URL =
  "https://reallistingteam.com/wp-content/uploads/2024/01/listing-team-logo.png";

export function getBrand(env) {
  const year = new Date().getFullYear();
  const name = env.BRAND_NAME || "The Listing Team";
  return {
    name,
    logoUrl:      env.BRAND_LOGO_URL || DEFAULT_LOGO_URL,
    primaryColor: env.BRAND_PRIMARY_COLOR || "#ff6a00",
    textColor:    env.BRAND_TEXT_COLOR || "#222222",
    bgColor:      env.BRAND_BG_COLOR || "#f6f6f6",
    websiteUrl:   env.BRAND_WEBSITE_URL || "https://reallistingteam.com",
    footerText:   env.BRAND_FOOTER_TEXT || `© ${year} ${name}. All rights reserved.`,
    unsubscribeUrl: env.BRAND_UNSUBSCRIBE_URL || "",
    agentSignature: env.BRAND_AGENT_SIGNATURE || "",
  };
}
