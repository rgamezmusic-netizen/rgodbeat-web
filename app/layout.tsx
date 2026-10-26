import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "RGODBEAT 2.0 | Next-Gen Beat Store & Music Platform",
  description: "Plataforma oficial de beats, licencias y producción musical de RGODBEAT.",
  // The public site can offer the Studio PWA install prompt. The manifest's
  // start_url and scope still keep the installed app inside /studio.
  manifest: "/manifest.json",
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
    <html lang="es" className="dark">
      <body className="isolate min-h-screen bg-[#08080a] text-white antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
