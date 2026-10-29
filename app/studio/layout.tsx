import type { Metadata, Viewport } from 'next';

// Installation belongs to Studio; the store/account keep their own web identity.
export const metadata: Metadata = {
  title: 'RGODBEAT Studio | Graba, mezcla y exporta',
  description: 'Graba voces, mezcla tus canciones y exporta tu música con RGodbeat Studio.',
  applicationName: 'RGodbeat',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RGodbeat',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
