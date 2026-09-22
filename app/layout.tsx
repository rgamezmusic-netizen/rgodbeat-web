import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "RGODBEAT 2.0 | Next-Gen Beat Store & Music Platform",
  description: "Plataforma oficial de beats, licencias y producción musical de RGODBEAT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-[#08080a] text-white antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
