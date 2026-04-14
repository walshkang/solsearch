import React, { useMemo, useRef, useEffect } from 'react';
import SunCalc from 'suncalc';
import { format } from 'date-fns';
import { X } from 'lucide-react';

interface SunTimelineProps {
  lat: number;
  lng: number;
  date: Date;
  currentTimeMinutes: number; // 0..1439
  onClose: () => void;
  getSunExposureScore?: (lat: number, lng: number, sunAlt: number, sunAz: number) => number;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatTime(minutes: number) {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${pad(hh)}:${pad(mm)}`;
}

export default function SunTimeline({ lat, lng, date, currentTimeMinutes, onClose, getSunExposureScore }: SunTimelineProps) {
  const scoreRef = useRef(getSunExposureScore);
  useEffect(() => { scoreRef.current = getSunExposureScore; }, [getSunExposureScore]);

  const samples = useMemo(() => {
    const out: { minutes: number; score: number; alt: number; az: number }[] = [];
    for (let i = 0; i < 48; i++) {
      const minutes = i * 30;
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setMinutes(minutes);
      const pos = SunCalc.getPosition(d, lat, lng);
      const alt = pos.altitude; // radians
      const az = pos.azimuth;
      let score = 0;
      if (scoreRef.current) score = scoreRef.current(lat, lng, alt, az);
      else score = alt > 0 ? 1 : 0;
      // clamp
      if (isNaN(score) || score < 0) score = 0;
      if (score > 1) score = 1;
      out.push({ minutes, score, alt, az });
    }
    return out;
  }, [lat, lng, date]);

  // chart sizing
  const width = 256;
  const height = 88;
  const pad = 6;
  const innerH = height - pad * 2;

  const xFor = (minutes: number) => (minutes / 1440) * width;
  const yFor = (score: number) => pad + (1 - score) * innerH;

  // full area path (background slate)
  const areaPath = (() => {
    let d = '';
    samples.forEach((s, i) => {
      const x = xFor(s.minutes);
      const y = yFor(s.score);
      d += `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
    });
    // close to baseline
    const lastX = xFor(samples[samples.length - 1].minutes);
    const firstX = xFor(samples[0].minutes);
    d += `L ${lastX.toFixed(2)} ${ (pad + innerH).toFixed(2) } L ${firstX.toFixed(2)} ${(pad + innerH).toFixed(2)} Z`;
    return d;
  })();

  // amber segments for score>0.5
  const sunnySegments = (() => {
    const segs: string[] = [];
    let start: number | null = null;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const isSunny = s.score > 0.5;
      if (isSunny && start === null) start = i;
      if ((!isSunny || i === samples.length - 1) && start !== null) {
        const end = (!isSunny) ? i - 1 : i;
        // build path from start..end
        let d = '';
        for (let j = start; j <= end; j++) {
          const x = xFor(samples[j].minutes);
          const y = yFor(samples[j].score);
          d += `${j === start ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)} `;
        }
        const endX = xFor(samples[end].minutes);
        const startX = xFor(samples[start].minutes);
        d += `L ${endX.toFixed(2)} ${(pad + innerH).toFixed(2)} L ${startX.toFixed(2)} ${(pad + innerH).toFixed(2)} Z`;
        segs.push(d);
        start = null;
      }
    }
    return segs;
  })();

  // best window: longest contiguous run where score>0.5
  const bestWindow = (() => {
    let bestStart = -1, bestEnd = -1, curStart = -1;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].score > 0.5) {
        if (curStart === -1) curStart = i;
      } else {
        if (curStart !== -1) {
          if (i - 1 - curStart > bestEnd - bestStart) { bestStart = curStart; bestEnd = i - 1; }
          curStart = -1;
        }
      }
    }
    if (curStart !== -1) {
      if (samples.length - 1 - curStart > bestEnd - bestStart) { bestStart = curStart; bestEnd = samples.length - 1; }
    }
    if (bestStart === -1) return null;
    const startMinutes = samples[bestStart].minutes;
    const endMinutes = samples[bestEnd].minutes + 30; // inclusive end
    const durationHours = ((endMinutes - startMinutes) / 60);
    return { startMinutes, endMinutes, durationHours };
  })();

  const cursorX = xFor(currentTimeMinutes);

  return (
    <div className="absolute top-20 left-4 w-72 z-20">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl p-3 border border-white/20 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-800">{lat.toFixed(2)}, {lng.toFixed(2)}</div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="mt-3">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
            <defs>
              <linearGradient id="areaFade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.2" />
              </linearGradient>
            </defs>

            {/* background area (slate) */}
            <path d={areaPath} fill="#cbd5e1" stroke="none" />

            {/* amber sunny segments */}
            {sunnySegments.map((d, idx) => (
              <path key={idx} d={d} fill="#f59e0b" stroke="none" />
            ))}

            {/* sparkline stroke */}
            <path
              d={samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(s.minutes).toFixed(2)} ${yFor(s.score).toFixed(2)}`).join(' ')}
              fill="none"
              stroke="#374151"
              strokeWidth={1.5}
            />

            {/* cursor */}
            <line x1={cursorX} x2={cursorX} y1={pad} y2={pad + innerH} stroke="#ef4444" strokeWidth={1} strokeDasharray="2 2" />

            {/* current time label */}
            <text x={Math.max(4, Math.min(width - 40, cursorX + 4))} y={12} fontSize={10} fill="#111827">{formatTime(currentTimeMinutes)}</text>
          </svg>
        </div>

        <div className="mt-3 text-sm text-gray-700">
          {bestWindow ? (
            <div className="font-medium">
              Best sun: {formatTime(bestWindow.startMinutes)} – {formatTime(bestWindow.endMinutes)} ({bestWindow.durationHours.toFixed(1)} hrs)
            </div>
          ) : (
            <div className="text-gray-500">No direct sun today</div>
          )}
        </div>
      </div>
    </div>
  );
}
