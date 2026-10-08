"use client";

import { useMemo, useSyncExternalStore } from 'react';
import { detectDevice, type DeviceProfile } from '@/lib/browser/device';

const subscribe = () => () => {};
const serverSnapshot = () => null;
// A primitive snapshot stays stable between renders; detection is local only.
const browserSnapshot = () => JSON.stringify(detectDevice(navigator));

export function useDeviceProfile(): DeviceProfile | null {
  const snapshot = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return useMemo(() => snapshot ? JSON.parse(snapshot) as DeviceProfile : null, [snapshot]);
}
