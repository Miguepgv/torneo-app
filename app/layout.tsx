import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { PwaRegister } from "@/components/PwaRegister";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: "Maraton Cofrade 2026",
  description: "App del torneo con Supabase y Next.js",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Maraton Cofrade",
  },
  icons: {
    icon: [
      { url: "/pwa-icon-192", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icon-512", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script
          id="localhost-sw-reset"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  try {
    var host = window.location.hostname;
    var isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!isLocal || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) { return r.unregister(); }));
    }).then(function () {
      if (!("caches" in window)) return;
      return caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      });
    }).finally(function () {
      var key = "__sw_reset_once__";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    });
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-100">
        <PwaRegister />
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
