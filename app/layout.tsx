import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "RGodbeat",
  description: "Plataforma oficial de beats, licencias y producción musical de RGODBEAT.",
  // The public site can offer the Studio PWA install prompt. The manifest's
  // start_url and scope still keep the installed app inside /studio.
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/rg-app.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/icons/icon-192.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="dark"
      style={{ backgroundColor: "#08080a", color: "#ffffff", colorScheme: "dark" }}
    >
      <body
        className="isolate min-h-screen bg-[#08080a] text-white antialiased"
        style={{ backgroundColor: "#08080a", color: "#ffffff", margin: 0 }}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
