export type DeviceOS = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'chromeos' | 'unknown';
export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'opera' | 'samsung' | 'brave' | 'vivaldi' | 'in-app' | 'unknown';

export const OS_LABELS: Record<DeviceOS, string> = { ios: 'iPhone / iPad', android: 'Android', macos: 'Mac', windows: 'Windows', linux: 'Linux', chromeos: 'ChromeOS', unknown: 'Dispositivo' };
export const BROWSER_LABELS: Record<BrowserName, string> = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari', opera: 'Opera', samsung: 'Samsung Internet', brave: 'Brave', vivaldi: 'Vivaldi', 'in-app': 'Navegador integrado', unknown: 'Navegador' };

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
    : /CrOS|Chrome OS/i.test(platform + ua) ? 'chromeos'
    : /Linux/i.test(platform + ua) ? 'linux' : 'unknown';
  const brands = signals.userAgentData?.brands?.map(item => item.brand).join(' ') ?? '';
  const browser: BrowserName = /FBAN|FBAV|Instagram|Musical\.ly|BytedanceWebview|TikTok|Snapchat|Line\/|MicroMessenger|; wv\)|WebView/i.test(ua) ? 'in-app'
    : /Edg(?:e|A|iOS)?\//i.test(ua) || /Microsoft Edge/i.test(brands) ? 'edge'
    : /OPR\/|OPiOS\/|OPT\/|Opera/i.test(ua + brands) ? 'opera'
    : /SamsungBrowser\//i.test(ua) ? 'samsung'
    : /Vivaldi/i.test(ua + brands) ? 'vivaldi'
    : /Brave/i.test(ua + brands) ? 'brave'
    : /Firefox\/|FxiOS\//i.test(ua) ? 'firefox'
    : /Chrome\/|CriOS\//i.test(ua) || /Google Chrome/i.test(brands) ? 'chrome'
    : /Safari\//i.test(ua) ? 'safari' : 'unknown';
  const osLabel = os === 'ios' ? ipad ? 'iPad' : 'iPhone' : OS_LABELS[os];
  return { os, browser, mobile: os === 'ios' || os === 'android', label: `${osLabel} · ${BROWSER_LABELS[browser]}` };
}
