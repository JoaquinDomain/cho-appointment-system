import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  // mysql2 loads auth plugins and optional deps with runtime require();
  // keep it out of the server bundle and let Node resolve it at runtime.
  serverExternalPackages: ["mysql2"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Browser talks only to same-origin /api (MySQL is server-side).
            // Script sources: our bundles, inline scripts Next.js emits, and
            // Cloudflare Turnstile (intentional anti-spam service). The old
            // vercel.live allowance was removed with the move to MITCS.
            // 'unsafe-eval' only in dev (React debug call stacks); drop
            // 'unsafe-inline' from script-src only together with a nonce
            // strategy (follow-up hardening).
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              [
                "script-src 'self' 'unsafe-inline'",
                process.env.NODE_ENV !== "production" ? "'unsafe-eval'" : "",
                "https://challenges.cloudflare.com",
              ]
                .filter(Boolean)
                .join(" "),
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://challenges.cloudflare.com",
              "frame-src 'self' https://challenges.cloudflare.com",
              "media-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-XSS-Protection", value: "0" },
        ],
      },
    ];
  },
};

// ---------------------------------------------------------------------------
// Build-mode guard.
// NEXT_PUBLIC_APP_MODE is inlined into the bundle at BUILD time and cannot be
// undone at runtime. A production build with 'admin' would ship a patient
// website that redirects / to /admin, so `next build` refuses to run with it.
// Scoped to PHASE_PRODUCTION_BUILD only: `next dev` (phase-development-server)
// keeps working for local admin-mode development, and `next start` serves an
// already-built artifact (phase-production-server), which the e2e suite relies
// on. The production site is single-mode: patients book at /, staff log in at
// /admin (footer link) — no separate production admin build exists.
// ---------------------------------------------------------------------------
export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_APP_MODE === "admin") {
    throw new Error(
      "Refusing to build: NEXT_PUBLIC_APP_MODE=admin would produce a production site " +
        "that redirects the patient homepage (/) to /admin. " +
        "The production site is a single patient + staff site — leave NEXT_PUBLIC_APP_MODE " +
        "UNSET when running `next build` (see .env.example). " +
        "For local admin-mode work use `next dev`, which is not affected by this guard."
    );
  }
  return nextConfig;
}
