"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BROWSER_LABELS, detectDevice, type DeviceProfile } from '@/lib/browser/device';

const subscribe = () => () => {};
const serverSnapshot = () => null;
// A primitive snapshot stays stable between renders; detection is local only.
const browserSnapshot = () => JSON.stringify(detectDevice(navigator));

export function useDeviceProfile(): DeviceProfile | null {
  const snapshot = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const [brave, setBrave] = useState(false);
  useEffect(() => {
    let active = true;
    const browser = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
    try {
      void browser.brave?.isBrave?.().then(value => { if (active) setBrave(value === true); }).catch(() => {});
    } catch { /* Privacy settings may block the optional browser signal. */ }
    return () => { active = false; };
  }, []);
  return useMemo(() => {
    const device = snapshot ? JSON.parse(snapshot) as DeviceProfile : null;
    return device && brave && device.browser !== 'in-app'
      ? { ...device, browser: 'brave', label: `${device.label.split(' · ')[0]} · ${BROWSER_LABELS.brave}` } as DeviceProfile
      : device;
  }, [snapshot, brave]);
}
