import type { NextConfig } from "next";

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
            // Kept compatible with Next.js inline scripts + Vercel Live.
            // unsafe-eval removed; drop 'unsafe-inline' from script-src
            // only together with a nonce strategy (follow-up hardening).
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://vercel.live https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://vercel.live https://challenges.cloudflare.com",
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

export default nextConfig;
