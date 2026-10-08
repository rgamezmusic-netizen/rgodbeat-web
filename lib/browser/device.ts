export type DeviceOS = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';
export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'samsung' | 'in-app' | 'unknown';

export interface BrowserSignals {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: { platform?: string; brands?: { brand: string; version: string }[] };
}

export interface DeviceProfile {
  os: DeviceOS;
  browser: BrowserName;
  mobile: boolean;
  label: string;
}

// Only use ordinary browser signals for navigation/install instructions.
// Audio, recording and storage continue to select their actual supported APIs.
export function detectDevice(signals: BrowserSignals): DeviceProfile {
  const ua = signals.userAgent ?? '';
  const platform = signals.userAgentData?.platform || signals.platform || '';
  const ipad = /iPad/i.test(ua) || ((/Mac/i.test(platform) || /Macintosh/i.test(ua)) && (signals.maxTouchPoints ?? 0) > 1);
  const os: DeviceOS = ipad || /iPhone|iPod/i.test(ua) ? 'ios'
    : /Android/i.test(platform + ua) ? 'android'
    : /Windows|Win32|Win64/i.test(platform + ua) ? 'windows'
    : /Mac/i.test(platform + ua) ? 'macos'
    : /Linux/i.test(platform + ua) ? 'linux' : 'unknown';
  const brands = signals.userAgentData?.brands?.map(item => item.brand).join(' ') ?? '';
  const browser: BrowserName = /FBAN|FBAV|Instagram|; wv\)|WebView/i.test(ua) ? 'in-app'
    : /Edg(?:e|A|iOS)?\//i.test(ua) || /Microsoft Edge/i.test(brands) ? 'edge'
    : /OPR\/|OPiOS\/|Opera/i.test(ua + brands) ? 'opera'
    : /SamsungBrowser\//i.test(ua) ? 'samsung'
    : /Firefox\/|FxiOS\//i.test(ua) ? 'firefox'
    : /Chrome\/|CriOS\//i.test(ua) || /Google Chrome/i.test(brands) ? 'chrome'
    : /Safari\//i.test(ua) ? 'safari' : 'unknown';
  const osLabel = { ios: ipad ? 'iPad' : 'iPhone', android: 'Android', macos: 'Mac', windows: 'Windows', linux: 'Linux', unknown: 'Dispositivo' }[os];
  const browserLabel = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari', opera: 'Opera', samsung: 'Samsung Internet', 'in-app': 'Navegador integrado', unknown: 'Navegador' }[browser];
  return { os, browser, mobile: os === 'ios' || os === 'android', label: `${osLabel} · ${browserLabel}` };
}
