"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";

/**
 * OAuth returns can land on the Site URL (homepage) instead of /app when the
 * redirect allowlist misses. The hash still carries the session tokens, so
 * consume them here and forward the signed-in user into the app.
 */
export default function AuthHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!window.location.hash.includes("access_token=")) return;
    const sb = supabase(); // detectSessionInUrl consumes the hash on init
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      if (session) {
        data.subscription.unsubscribe();
        router.replace("/app");
      }
    });
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/app");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return null;
}
