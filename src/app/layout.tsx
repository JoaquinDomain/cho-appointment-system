import type { Metadata } from "next";
import { Inter } from "next/font/google";
import HydrationPing from "@/components/HydrationPing";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CHO Laboratory Appointment System",
  description: "City Health Office Bacolod City - Laboratory Appointment Booking System",
};

// Inline load watchdog. It runs from the HTML itself, so it still works when
// a JS chunk fails to load (e.g. an intermittent 503) and hydration never
// starts. If HydrationPing has not reported a hydrated page within 10 seconds,
// it shows a small notice with a Refresh button instead of leaving the page
// looking fine but unresponsive. Allowed by the CSP's script-src 'unsafe-inline'.
const LOAD_WATCHDOG = `(function () {
  try {
    var t = setTimeout(function () {
      if (window.__choReady) return;
      if (document.getElementById('cho-load-notice')) return;
      var d = document.createElement('div');
      d.id = 'cho-load-notice';
      d.setAttribute('role', 'status');
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:16px;box-shadow:0 4px 12px rgba(15,23,42,0.15);font-family:ui-sans-serif,system-ui,sans-serif';
      var p = document.createElement('p');
      p.style.cssText = 'flex:1;min-width:12rem;margin:0;font-size:14px;line-height:1.5;color:#78350f';
      p.textContent = 'The page is taking longer than usual to finish loading, so the calendar and buttons stay inactive. Refreshing the page usually fixes this.';
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Refresh';
      b.style.cssText = 'padding:8px 16px;border:0;border-radius:12px;background:#d97706;color:#fff;font-size:14px;font-weight:600;cursor:pointer';
      b.addEventListener('click', function () { location.reload(); });
      d.appendChild(p);
      d.appendChild(b);
      document.body.appendChild(d);
    }, 10000);
    window.__choClearWatchdog = function () {
      clearTimeout(t);
      var e = document.getElementById('cho-load-notice');
      if (e && e.parentNode) e.parentNode.removeChild(e);
    };
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: LOAD_WATCHDOG }} />
        <HydrationPing />
        {children}
      </body>
    </html>
  );
}
