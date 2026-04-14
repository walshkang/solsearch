import React, { useState, useRef, useEffect, useCallback } from 'react';
import SunCalc from 'suncalc';
import { SunLight, LightingEffect, AmbientLight } from '@deck.gl/core';

interface TimeOfDayControllerProps {
  deckRef: React.RefObject<any>; // Reference to GoogleMapsOverlay or Deck instance
  date: Date;
  lat: number;
  lng: number;
}

export default function TimeOfDayController({ deckRef, date, lat, lng }: TimeOfDayControllerProps) {
  // UI State: Store time in minutes (0 to 1440) for the slider.
  // This state ONLY updates the UI label and slider position while dragging.
  const [displayMinutes, setDisplayMinutes] = useState(12 * 60); // Default to Noon

  // Refs for the imperative animation loop
  const currentMinutesRef = useRef(12 * 60);
  const targetMinutesRef = useRef(12 * 60);
  const frameRef = useRef<number | null>(null);

  // Calculate solar times dynamically based on the provided date and location
  const times = SunCalc.getTimes(date, lat, lng);
  
  const getMinutes = (d: Date) => {
    if (isNaN(d.getTime())) return 12 * 60; // Fallback if invalid
    return d.getHours() * 60 + d.getMinutes();
  };
  
  const smartTimes = [
    { label: 'Sunrise', minutes: getMinutes(times.sunrise) },
    { label: 'Noon', minutes: getMinutes(times.solarNoon) },
    { label: 'Golden Hour', minutes: getMinutes(times.goldenHour) },
    { label: 'Sunset', minutes: getMinutes(times.sunset) }
  ];

  // Helper to format minutes to HH:MM
  const formatTime = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  // Imperative function to push lighting updates directly to Deck.gl
  const renderDeckGL = useCallback((minutes: number) => {
    if (!deckRef.current) return;

    const d = new Date(date);
    d.setHours(Math.floor(minutes / 60));
    d.setMinutes(minutes % 60);
    const timestamp = d.getTime();

    const ambientLight = new AmbientLight({
      color: [255, 255, 255],
      intensity: 0.5
    });

    const sunLight = new SunLight({
      timestamp,
      color: [255, 255, 255],
      intensity: 4.5,
      _shadow: true
    });

    const lightingEffect = new LightingEffect({ ambientLight, sunLight });

    // Push directly to Deck.gl without triggering a React re-render
    deckRef.current.setProps({ effects: [lightingEffect] });
  }, [date, deckRef]);

  // The requestAnimationFrame lerp loop
  const startAnimation = useCallback(() => {
    if (frameRef.current !== null) return; // Prevent multiple loops

    const loop = () => {
      const diff = targetMinutesRef.current - currentMinutesRef.current;
      
      // Epsilon check: Are we close enough to stop?
      if (Math.abs(diff) > 0.01) {
        // 1. Calculate next lerp step (10% closer to target each frame)
        currentMinutesRef.current += diff * 0.1;
        
        // 2. Push to Deck.gl
        renderDeckGL(currentMinutesRef.current);
        
        // 3. Keep animating
        frameRef.current = requestAnimationFrame(loop);
      } else {
        // Target reached! Snap to exact target and stop the loop to save CPU/GPU.
        currentMinutesRef.current = targetMinutesRef.current;
        renderDeckGL(currentMinutesRef.current);
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(loop);
  }, [renderDeckGL]);

  // Cleanup the animation frame on component unmount
  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  // --- Event Handlers ---

  // While dragging: Only update the local UI state (fast, no 3D updates)
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayMinutes(parseFloat(e.target.value));
  };

  // On commit (mouse up): Set target and start animation loop
  const handleSliderCommit = () => {
    targetMinutesRef.current = displayMinutes;
    startAnimation();
  };

  // On smart button click: Update UI, set target, and start animation loop
  const handleSmartTimeClick = (minutes: number) => {
    setDisplayMinutes(minutes);
    targetMinutesRef.current = minutes;
    startAnimation();
  };

  return (
    <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-gray-100 flex flex-col gap-4 w-full max-w-md">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-700">Time of Day</span>
        <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
          {formatTime(displayMinutes)}
        </span>
      </div>

      <div className="flex gap-2">
        {smartTimes.map(st => (
          <button
            key={st.label}
            onClick={() => handleSmartTimeClick(st.minutes)}
            className="flex-1 text-xs py-1.5 px-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors font-medium"
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <input
          type="range"
          min="0"
          max="1440"
          step="1"
          value={displayMinutes}
          onChange={handleSliderChange}
          onMouseUp={handleSliderCommit}
          onTouchEnd={handleSliderCommit}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium px-1">
          <span>12 AM</span>
          <span>6 AM</span>
          <span>12 PM</span>
          <span>6 PM</span>
          <span>12 AM</span>
        </div>
      </div>
    </div>
  );
}
