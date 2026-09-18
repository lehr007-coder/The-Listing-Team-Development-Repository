// GENERATED DEPLOYMENT MIRROR. Canonical: lehr007-coder/Listing-Team-Development-Repository/marketing-superpowers/runtime/src/registry.js
export const projects = [
  { id: 'listinghq', name: 'ListingHQ', domain: 'operations', status: 'active', repository: 'lehr007-coder/listinghq', writePolicy: 'project_gate', keywords: ['listinghq', 'marketplace', 'listing dashboard'] },
  { id: 'condo_intel', name: 'Condo Intel', domain: 'real_estate_data', status: 'production_verified_2026_09_01', repository: 'lehr007-coder/condo-intel-v2', writePolicy: 'strict_project_gate', keywords: ['condo', 'hoa', 'association', 'approval', 'condo intel'] },
  { id: 'transaction_os', name: 'Transaction OS', domain: 'transactions', status: 'production_partial_sync_verified_2026_09_01', repository: 'lehr007-coder/the-listing-team-transaction-os', writePolicy: 'strict_project_gate', keywords: ['transaction', 'contract', 'escrow', 'inspection', 'closing', 'deadline', 'title', 'commission'] },
  { id: 'ylopo_intelligence', name: 'Ylopo Intelligence', domain: 'lead_intelligence', status: 'active_family', repository: 'lehr007-coder/ylopo-marketplace', writePolicy: 'bounded_write', keywords: ['ylopo', 'lead intent', 'lead intelligence', 'lead score'] },
  { id: 'marketing_superpowers', name: 'Marketing Superpowers', domain: 'marketing', status: 'active', repository: 'lehr007-coder/Listing-Team-Development-Repository', writePolicy: 'approval_before_publish', keywords: ['marketing', 'campaign', 'blog', 'email', 'social', 'seo', 'landing page', 'video script'] }
];
export const capabilities = [
  { id: 'github', domain: 'engineering', provider: 'mcp_workers_github', keywords: ['github', 'repo', 'repository', 'pull request', 'issue', 'code'] },
  { id: 'crm', domain: 'crm', provider: 'mcp_workers_fub_ghl', keywords: ['crm', 'ghl', 'gohighlevel', 'fub', 'follow up boss', 'contact', 'sms', 'email', 'appointment', 'opportunity'] },
  { id: 'ylopo', domain: 'lead_intelligence', provider: 'mcp_workers_ylopo', keywords: ['ylopo', 'lead activity', 'lead score'] },
  { id: 'squarespace', domain: 'website', provider: 'mcp_workers_squarespace', keywords: ['squarespace', 'website', 'blog', 'page', 'publish'] },
  { id: 'idx', domain: 'real_estate_data', provider: 'idx_mcp_bridge', keywords: ['idx', 'listing search', 'valuation', 'cma', 'mls'] },
  { id: 'cloudflare_ops', domain: 'infrastructure', provider: 'tlt_cloudflare_ops_read', keywords: ['cloudflare', 'worker inventory', 'workers inventory', 'pages projects', 'kv namespaces', 'r2 buckets', 'queues', 'd1 databases', 'zones', 'infrastructure inventory', 'operational inventory'] },
  { id: 'seo_edge', domain: 'seo', provider: 'cloudflare_seo_proxy', keywords: ['seo', 'schema', 'json-ld', 'canonical', 'meta tags', 'aeo', 'geo'] },
  { id: 'images', domain: 'media', provider: 'tlt_image_server', keywords: ['image', 'hero', 'asset', 'photo'] },
  { id: 'social', domain: 'social', provider: 'social_post_importer_ghl', keywords: ['social', 'instagram', 'facebook', 'linkedin', 'hashtags', 'schedule'] },
  { id: 'voice_ai', domain: 'voice_ai', provider: 'voice_ai_suite', keywords: ['voice', 'caller', 'call score', 'mortgage estimate', 'daily brief'] }
];
export const policies = { neverDeleteAutomatically:true, neverArchiveAutomatically:true, projectBeforeCapability:true, preferCanonicalExistingSystems:true, humanApprovalBeforePublication:true, humanApprovalBeforeDestructiveAction:true, strictWriteProjects:['condo_intel','transaction_os'], blockedRuntimeStatuses:['marked_for_retirement','historical_only','scaffold_only'] };
