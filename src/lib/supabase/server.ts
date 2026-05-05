import { createClient } from "@supabase/supabase-js";
import type { Session } from "@/lib/auth/session";

// Service-role client. Forwards the session's user id and role as request
// headers so the Postgres RLS policies (current_user_id / current_user_role)
// can scope rows defensively even though we also filter in app code.
export function supabaseForSession(session: Session) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          "x-user-id": session.userId,
          "x-user-role": session.role,
        },
      },
    },
  );
}

// Unscoped admin client for the SSO route, which has to upsert the user
// before a session exists.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
