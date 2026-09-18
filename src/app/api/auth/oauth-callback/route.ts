// Clean-path alias for the OAuth callback (marketplace rejects redirect
// URIs containing restricted platform names). Same handler, safe URL.
export { GET } from "../ghl-oauth/callback/route";
export const runtime = "nodejs";
