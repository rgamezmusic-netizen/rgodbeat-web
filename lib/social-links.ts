import type { DeviceProfile } from '@/lib/browser/device';

export const SOCIAL_URLS = {
  instagram: 'https://www.instagram.com/rgodbeat/',
  youtube: 'https://www.youtube.com/@RGodbeat',
  discord: 'https://discord.gg/WfDG6q2aW',
  tiktok: 'https://www.tiktok.com/@rgodbeat',
  spotify: 'https://open.spotify.com/intl-es/artist/5alBtZYlDSCtuCx31K7c3n',
  soundcloud: 'https://soundcloud.com/rafael-gamez-443960876',
} as const;

export type SocialService = keyof typeof SOCIAL_URLS;

export function socialDestination(service: SocialService, device: DeviceProfile | null) {
  const webUrl = SOCIAL_URLS[service];
  const appService = service === 'instagram' || service === 'youtube';
  if (!appService || !device?.mobile) return { href: webUrl, target: '_blank' as const };
  // iOS and other Android browsers use the service's ordinary HTTPS App Link.
  // Android Chrome supports explicit Intents with a browser fallback if absent.
  if (device.os === 'android' && device.browser === 'chrome') {
    const packageName = service === 'youtube' ? 'com.google.android.youtube' : 'com.instagram.android';
    return { href: `intent://${webUrl.slice('https://'.length)}#Intent;scheme=https;package=${packageName};S.browser_fallback_url=${encodeURIComponent(webUrl)};end`, target: '_self' as const };
  }
  return { href: webUrl, target: '_self' as const };
}
