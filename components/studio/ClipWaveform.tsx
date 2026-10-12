import React, { memo, useMemo } from 'react';
import { getBufferWaveform } from '@/lib/studio/audio/waveform';

// One SVG path per take, memoized across transport updates. Neither buttons,
// labels nor flex layout can shorten or offset the audio's time axis.
export const ClipWaveform = memo(function ClipWaveform({ buffer, width, locked = false }: {
  buffer: AudioBuffer; width: number; locked?: boolean;
}) {
  const points = Math.max(1, Math.min(16384, Math.ceil(width / 2)));
  const path = useMemo(() => {
    const peaks = getBufferWaveform(buffer, points);
    return peaks.map((peak, i) => {
      const x = (i + 0.5) / peaks.length * width;
      const height = peak * 15;
      return `M${x.toFixed(3)},${(16 - height).toFixed(3)}V${(16 + height).toFixed(3)}`;
    }).join('');
  }, [buffer, points, width]);
  return <svg aria-hidden="true" data-audio-waveform="true" viewBox={`0 0 ${width} 32`}
    preserveAspectRatio="none" className={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-8 pointer-events-none ${locked ? 'text-amber-400' : 'text-emerald-400'}`}>
    <path d={`M0,16H${width}`} stroke="currentColor" strokeOpacity="0.25" fill="none" />
    <path d={path} stroke="currentColor" strokeWidth={Math.min(1.5, width / points)} fill="none" />
  </svg>;
});
