import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Map, useMap, useMapsLibrary, MapEvent } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { MVTLayer } from '@deck.gl/geo-layers';
import { LightingEffect, AmbientLight, _SunLight as SunLight } from '@deck.gl/core';
import SunCalc from 'suncalc';
import * as turf from '@turf/turf';
import { format } from 'date-fns';
import { Search, Loader2, MapPin, Sparkles, X, Sun, Layers, Link } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import TimeOfDayController from './components/TimeOfDayController';
import SunTimeline from './components/SunTimeline';
import { computeShadowGrid, getSunExposureScore } from './utils/shadowCompute';

// --- URL state helpers ---
function parseUrlState() {
  const params = new URLSearchParams(window.location.search);
  const lat = params.get('lat');
  const lng = params.get('lng');
  const zoom = params.get('zoom');
  const dateStr = params.get('date');
  const timeStr = params.get('time');
  const out: any = {};
  if (lat !== null && lng !== null) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!isNaN(latNum) && latNum >= -90 && latNum <= 90 && !isNaN(lngNum) && lngNum >= -180 && lngNum <= 180) {
      out.lat = latNum;
      out.lng = lngNum;
    }
  }
  if (zoom !== null) {
    const z = parseFloat(zoom);
    if (!isNaN(z) && z >= 0 && z <= 22) out.zoom = z;
  }
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) out.date = d;
  }
  if (timeStr) {
    const t = parseInt(timeStr, 10);
    if (!isNaN(t) && t >= 0 && t <= 1439) out.minutes = t;
  }
  return out;
}

function formatUrl({lat,lng,zoom,date,minutes}: {lat:number,lng:number,zoom:number,date:Date,minutes:number}) {
  const u = new URL(window.location.href);
  u.search = '';
  u.searchParams.set('lat', lat.toFixed(6));
  u.searchParams.set('lng', lng.toFixed(6));
  u.searchParams.set('zoom', String(Math.round(zoom)));
  u.searchParams.set('date', format(date,'yyyy-MM-dd'));
  u.searchParams.set('time', String(Math.round(minutes)));
  return u.pathname + u.search;
}

// --- Places Autocomplete Component ---
function Autocomplete({ onPlaceSelect }: { onPlaceSelect: (location: google.maps.LatLng) => void }) {
  const [inputRef, setInputRef] = useState<HTMLInputElement | null>(null);
  const places = useMapsLibrary('places');
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef) return;
    const ac = new places.Autocomplete(inputRef, { fields: ['geometry', 'name', 'formatted_address'] });
    setAutocomplete(ac);
  }, [places, inputRef]);

  useEffect(() => {
    if (!autocomplete) return;
    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        onPlaceSelect(place.geometry.location);
      }
    });
    return () => {
      if (google && google.maps && google.maps.event) {
        google.maps.event.removeListener(listener);
      }
    };
  }, [autocomplete, onPlaceSelect]);

  return (
    <input
      ref={setInputRef}
      type="text"
      placeholder="Search for cafes, restaurants, parks..."
      className="w-full bg-transparent border-none focus:ring-0 text-gray-800 placeholder-gray-400 outline-none text-sm"
    />
  );
}

// --- Main Map Component ---
export default function MapComponent() {
  const map = useMap();

  const parsedParamsRef = useRef<{lat?:number,lng?:number,zoom?:number,minutes?:number,date?:Date} | null>(null);
  const [initialMinutes, setInitialMinutes] = useState<number | undefined>(undefined);

  // Parse URL on mount and seed date/time if present
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const parsed = parseUrlState();
    if (parsed.date) setDate(parsed.date);
    if (typeof parsed.minutes === 'number') setInitialMinutes(parsed.minutes);
    parsedParamsRef.current = parsed;
  }, []);

  // Apply parsed center/zoom when map becomes available
  useEffect(() => {
    if (!map || !parsedParamsRef.current) return;
    const p = parsedParamsRef.current;
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      try {
        map.panTo(new google.maps.LatLng(p.lat, p.lng));
      } catch (e) {
        map.panTo({ lat: p.lat, lng: p.lng });
      }
    }
    if (typeof p.zoom === 'number') {
      map.setZoom(p.zoom);
      setZoom(p.zoom);
    }
    parsedParamsRef.current = null;
  }, [map]);

  // Helper to update URL with current or provided overrides
  const updateUrl = ({date: dateOverride, minutes: minutesOverride, centerOverride, zoomOverride}: {date?: Date, minutes?: number, centerOverride?: {lat:number,lng:number}, zoomOverride?: number} = {}) => {
    if (typeof window === 'undefined') return;
    let latVal: number, lngVal: number, zoomVal: number;
    if (centerOverride) {
      latVal = centerOverride.lat; lngVal = centerOverride.lng;
    } else if (map) {
      const c = map.getCenter();
      latVal = c.lat();
      lngVal = c.lng();
    } else if (bounds) {
      const c = bounds.getCenter();
      latVal = c.lat(); lngVal = c.lng();
    } else {
      latVal = 40.7128; lngVal = -74.0060;
    }
    if (typeof zoomOverride === 'number') zoomVal = zoomOverride;
    else zoomVal = map ? (map.getZoom() || zoom) : zoom;
    const dateVal = dateOverride || date;
    const minutesVal = (typeof minutesOverride === 'number') ? minutesOverride : (typeof initialMinutes === 'number' ? initialMinutes : 12 * 60);
    const minutesFinal = Math.round(minutesVal);
    const newPath = formatUrl({lat: latVal, lng: lngVal, zoom: zoomVal, date: dateVal, minutes: minutesFinal});
    history.replaceState(null, '', newPath);
  };
  const [date, setDate] = useState<Date>(new Date());

  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(16);
  const tileGeojsonRef = useRef<any>(null);
  const [tileGeojsonVersion, setTileGeojsonVersion] = useState(0);
  const [searchedLocation, setSearchedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [highlightedFeatureId, setHighlightedFeatureId] = useState<string | null>(null);
  const [timelineLocation, setTimelineLocation] = useState<{lat:number,lng:number} | null>(null);
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(typeof initialMinutes === 'number' ? initialMinutes : 12 * 60);

  useEffect(() => {
    if (typeof initialMinutes === 'number') setCurrentTimeMinutes(initialMinutes);
  }, [initialMinutes]);

  // Layer toggles
  const [showBuildings, setShowBuildings] = useState(true);
  const [showFloor, setShowFloor] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [isLayersOpen, setIsLayersOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Discover Panel State
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('Bars with happy hour');
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  // Mobile control panel open state (controlled via React instead of peer checkbox)
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handlePlaceSelect = (location: google.maps.LatLng) => {
    if (map) {
      map.panTo(location);
      map.setZoom(18);
      map.setTilt(60);
      setSearchedLocation({ lat: location.lat(), lng: location.lng() });
    }
  };

  useEffect(() => {
    const geojson = tileGeojsonRef.current;
    if (searchedLocation && geojson) {
      const pt = turf.point([searchedLocation.lng, searchedLocation.lat]);
      let foundId = null;
      for (const feature of geojson.features) {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          if (turf.booleanPointInPolygon(pt, feature)) {
            foundId = feature.id;
            break;
          }
        }
      }
      setHighlightedFeatureId(foundId);
    } else {
      setHighlightedFeatureId(null);
    }
  }, [searchedLocation, tileGeojsonVersion]);



  const handleMapIdle = (e: MapEvent) => {
    const currentMap = e.map;
    const currentZoom = currentMap.getZoom();
    const currentBounds = currentMap.getBounds();

    if (currentZoom) setZoom(currentZoom);
    if (currentBounds) {
      setBounds(currentBounds);
    }

    // Update URL with new center/zoom (preserve date and last committed minutes)
    try {
      updateUrl();
    } catch (e) {
      // noop
    }
  };

  const handleDiscover = async () => {
    if (!bounds || !map) return;
    setIsDiscovering(true);
    setDiscoverResults([]);
    
    try {
      const placesService = new google.maps.places.PlacesService(map);
      const request = {
        query: discoverQuery,
        bounds: bounds,
      };

      placesService.textSearch(request, async (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          try {
            const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
            const placesList = results.slice(0, 6).map(p => p.name).join(', ');
            
            const prompt = `I am looking for "${discoverQuery}". Here are some places I found in this area: ${placesList}. 
            Based on general knowledge, which of these are most likely to have good happy hours and outdoor seating/patios? 
            Return a JSON array of objects with 'name', 'reason', and a mock 'sunScore' (0-100) representing how sunny their patio likely is.`;

            const response = await ai.models.generateContent({
              model: 'gemini-2.5-pro',
              contents: prompt,
              config: {
                responseMimeType: "application/json",
              }
            });
            
            const aiData = JSON.parse(response.text || '[]');
            
            const ranked = results.slice(0, 6).map(p => {
              const aiInfo = aiData.find((a: any) => a.name.includes(p.name) || p.name.includes(a.name)) || { reason: 'Looks like a great spot!', sunScore: Math.floor(Math.random() * 40) + 40 };

              let computedSunScore = aiInfo.sunScore;
              try {
                const loc = p.geometry?.location;
                const lat = typeof loc?.lat === 'function' ? loc.lat() : loc?.lat;
                const lng = typeof loc?.lng === 'function' ? loc.lng() : loc?.lng;

                const currentMinutes = stateRef.current.currentMinutes ?? (12 * 60);
                const d2 = new Date(stateRef.current.date);
                d2.setHours(Math.floor(currentMinutes / 60));
                d2.setMinutes(currentMinutes % 60);

                const tileGeojson = stateRef.current.geojsonData;
                if (tileGeojson && typeof lat === 'number' && typeof lng === 'number') {
                  const sunP = SunCalc.getPosition(d2, lat, lng);
                  const exposure = getSunExposureScore(lat, lng, tileGeojson, sunP.altitude, sunP.azimuth);
                  computedSunScore = Math.round(exposure * 100);
                }
              } catch (e) {
                // fallback to ai-provided score
              }

              return {
                ...p,
                aiReason: aiInfo.reason,
                sunScore: computedSunScore
              };
            }).sort((a, b) => b.sunScore - a.sunScore);

            setDiscoverResults(ranked);
          } catch (e) {
            console.error("Gemini error", e);
            setDiscoverResults(results.slice(0, 6).map(p => ({...p, sunScore: Math.floor(Math.random() * 100), aiReason: 'Great place!'})));
          }
        }
        setIsDiscovering(false);
      });

    } catch (err) {
      console.error(err);
      setIsDiscovering(false);
    }
  };

  // 1. Create Overlay Ref
  const overlayRef = useRef<GoogleMapsOverlay | null>(null);
  if (!overlayRef.current) {
    overlayRef.current = new GoogleMapsOverlay({ interleaved: false });
  }

  // 2. Attach overlay to map
  useEffect(() => {
    if (map && overlayRef.current) {
      overlayRef.current.setMap(map);
    }
    return () => {
      if (overlayRef.current) overlayRef.current.setMap(null);
    };
  }, [map]);

  // 3. Memoize buildings layer (MVT tiles from MapTiler)
  const buildingsLayer = useMemo(() => {
    const maptilerKey = (import.meta as any).env.VITE_MAPTILER_API_KEY;
    if (!maptilerKey) return null;

    return new MVTLayer({
      id: 'buildings',
      data: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${maptilerKey}`,
      minZoom: 14,
      maxZoom: 16,
      extruded: true,
      getElevation: (f: any) => {
        const p = f?.properties || {};
        if (p.render_height) {
          const v = parseFloat(p.render_height);
          if (!isNaN(v)) return v;
        }
        if (p.levels) {
          const v = parseFloat(p.levels);
          if (!isNaN(v)) return v * 3.5;
        }
        return 12;
      },
      getFillColor: (f: any) => {
        const alpha = zoom > 16.5 ? 90 : 200;
        return f.id === highlightedFeatureId ? [59, 130, 246, alpha + 40] : [245, 245, 245, alpha];
      },
      getLineColor: (f: any) => {
        const alpha = zoom > 16.5 ? 60 : 120;
        return f.id === highlightedFeatureId ? [255, 255, 255, alpha + 55] : [200, 200, 200, alpha];
      },
      // Only render the 'building' layer from the tile layers
      layers: ['building'],
      material: { ambient: 0.1, diffuse: 1.0, shininess: 32, specularColor: [255,255,255] },
      shadowEnabled: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 200, 0, 100],
      onViewportLoad: (tiles: any[]) => {
        const features: any[] = [];
        for (const tile of tiles) {
          const data = (tile as any).data;
          if (!data) continue;
          if (data.features) features.push(...data.features);
        }
        tileGeojsonRef.current = { type: 'FeatureCollection', features };
        setTileGeojsonVersion(v => v + 1);
      },
      updateTriggers: {
        getFillColor: [highlightedFeatureId, zoom],
        getLineColor: [highlightedFeatureId, zoom],
      }
    });
  }, [highlightedFeatureId, zoom]);

  // Shadow grid cache ref
  const shadowCacheRef = useRef<{
    alt: number; az: number; lat: number; lng: number;
    pts: ReturnType<typeof computeShadowGrid>;
  } | null>(null);

  // Worker & request state
  const shadowWorkerRef = useRef<Worker | null>(null);
  const shadowPendingRef = useRef(false);
  const lastShadowRequestRef = useRef<{ alt: number; az: number; lat: number; lng: number; } | null>(null);
  const lastTimeOfDayRef = useRef<number | null>(null);

  // 4. State Ref for imperative loop
  const stateRef = useRef({
    date, bounds, buildingsLayer, searchedLocation, geojsonData: tileGeojsonRef.current, currentMinutes: 12 * 60,
    showBuildings: true, showFloor: true, showShadows: true,
  });
  useEffect(() => {
    stateRef.current = { date, bounds, buildingsLayer, searchedLocation, geojsonData: tileGeojsonRef.current, currentMinutes: stateRef.current.currentMinutes ?? 12 * 60, showBuildings, showFloor, showShadows };
  }, [date, bounds, buildingsLayer, searchedLocation, tileGeojsonVersion, showBuildings, showFloor, showShadows]);

  // Invalidate shadow cache when buildings or date change
  useEffect(() => { shadowCacheRef.current = null; }, [tileGeojsonVersion, date]);


  // 5. Render function (bypasses React render cycle)
  const renderDeckGL = useCallback((timeOfDay: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Update currentMinutes for imperative consumers (minutes since midnight)
    stateRef.current.currentMinutes = Math.round(timeOfDay * 60);
    const { date, bounds, buildingsLayer, searchedLocation, geojsonData, showBuildings, showFloor, showShadows } = stateRef.current;

    const d = new Date(date);
    d.setHours(Math.floor(timeOfDay));
    d.setMinutes((timeOfDay % 1) * 60);
    const renderTimestamp = d.getTime();

    let sunColor = [255, 255, 255];
    if (bounds) {
      const center = bounds.getCenter();
      const lat = center.lat();
      const lng = center.lng();
      
      const times = SunCalc.getTimes(date, lat, lng);
      const toHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      
      const dawn = times.dawn ? toHours(times.dawn) : 5;
      const sunrise = times.sunrise ? toHours(times.sunrise) : 6;
      const goldenHourEnd = times.goldenHourEnd ? toHours(times.goldenHourEnd) : 8;
      const solarNoon = times.solarNoon ? toHours(times.solarNoon) : 12;
      const goldenHour = times.goldenHour ? toHours(times.goldenHour) : 16;
      const sunset = times.sunset ? toHours(times.sunset) : 18;
      const dusk = times.dusk ? toHours(times.dusk) : 19;

      const keyframes = [
        { time: 0, color: [30, 30, 50] },
        { time: dawn - 1, color: [30, 30, 50] },
        { time: dawn, color: [80, 70, 100] },
        { time: sunrise, color: [255, 160, 100] },
        { time: goldenHourEnd, color: [255, 240, 210] },
        { time: solarNoon, color: [255, 255, 255] },
        { time: goldenHour, color: [255, 240, 210] },
        { time: sunset, color: [255, 160, 100] },
        { time: dusk, color: [80, 70, 100] },
        { time: dusk + 1, color: [30, 30, 50] },
        { time: 24, color: [30, 30, 50] }
      ].sort((a, b) => a.time - b.time);

      let k1 = keyframes[0];
      let k2 = keyframes[keyframes.length - 1];
      for (let i = 0; i < keyframes.length - 1; i++) {
        if (timeOfDay >= keyframes[i].time && timeOfDay <= keyframes[i + 1].time) {
          k1 = keyframes[i];
          k2 = keyframes[i + 1];
          break;
        }
      }
      const t = (timeOfDay - k1.time) / (k2.time - k1.time || 1);
      sunColor = [
        Math.round(k1.color[0] + (k2.color[0] - k1.color[0]) * t),
        Math.round(k1.color[1] + (k2.color[1] - k1.color[1]) * t),
        Math.round(k1.color[2] + (k2.color[2] - k1.color[2]) * t)
      ];
    }

    const ambientLight = new AmbientLight({
      id: 'ambient',
      color: sunColor as [number, number, number],
      intensity: 0.5
    });

    const sunLight = new SunLight({
      id: 'sunlight',
      timestamp: renderTimestamp,
      color: sunColor as [number, number, number],
      intensity: 4.5,
      _shadow: true
    });

    const lightingEffect = new LightingEffect({ ambientLight, sunLight });

    const baseLayers = [];
    let shadowLayer: any = null;

    if (bounds) {
      const center = bounds.getCenter();
      const lat = center.lat();
      const lng = center.lng();
      const sunPos = SunCalc.getPosition(new Date(renderTimestamp), lat, lng);
      
      const darkness = Math.max(0, Math.min(1, -sunPos.altitude / 0.1));
      const tintAlpha = Math.floor(darkness * 180);

      const d = 0.1;
      const groundPolygon = [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d]
      ];

      if (showFloor && tintAlpha > 0) {
        baseLayers.push(
          new PolygonLayer({
            id: 'night-tint',
            data: [{ polygon: groundPolygon }],
            getPolygon: (d: any) => d.polygon,
            getFillColor: [10, 15, 30, tintAlpha],
            pickable: false,
            shadowEnabled: false
          })
        );
      }

      let groundAlpha = 60;
      if (sunPos.altitude > 0 && sunPos.altitude < 0.2) {
        const sunsetness = (0.2 - sunPos.altitude) / 0.2;
        groundAlpha = 60 + Math.floor(sunsetness * 40);
      }

      if (showFloor) baseLayers.push(
        new PolygonLayer({
          id: 'ground-plane',
          data: [{ polygon: groundPolygon }],
          getPolygon: (d: any) => d.polygon,
          getFillColor: [...sunColor, groundAlpha] as [number, number, number, number],
          material: {
            ambient: 2.0,
            diffuse: 0.2,
            shininess: 0,
            specularColor: [0, 0, 0]
          },
          shadowEnabled: true,
          pickable: false
        })
      );

      // Shadow overlay — 80m radius, 12m spacing (~140 pts), cached between frames
      if (showShadows && sunPos.altitude > 0 && stateRef.current.geojsonData) {
        try {
          const THRESHOLD = 0.02; // ~1° ≈ 4 min of sun movement
          const cache = shadowCacheRef.current;
          const needsRecompute = !cache
            || Math.abs(cache.alt - sunPos.altitude) > THRESHOLD
            || Math.abs(cache.az - sunPos.azimuth) > THRESHOLD
            || Math.abs(cache.lat - lat) > 0.001
            || Math.abs(cache.lng - lng) > 0.001;

          const worker = shadowWorkerRef.current;

          if (needsRecompute) {
            // If a worker exists and no computation is pending, post a job.
            if (worker && !shadowPendingRef.current) {
              shadowPendingRef.current = true;
              lastTimeOfDayRef.current = timeOfDay;
              lastShadowRequestRef.current = { alt: sunPos.altitude, az: sunPos.azimuth, lat, lng };
              try {
                worker.postMessage({
                  geojson: stateRef.current.geojsonData,
                  lat,
                  lng,
                  radiusKm: 0.08,
                  spacingMeters: 12,
                  sunAltitude: sunPos.altitude,
                  sunAzimuth: sunPos.azimuth
                });
              } catch (e) {
                console.warn('Failed to post to shadow worker', e);
                shadowPendingRef.current = false;
              }
            }
          }

          // Render using cached points while a recompute is pending
          const shadowPoints = shadowCacheRef.current?.pts ?? [];
          if (shadowPoints.length > 0) {
            shadowLayer = new ScatterplotLayer({
              id: 'shadow-overlay',
              data: shadowPoints,
              getPosition: (d: any) => d.position,
              getFillColor: (d: any) => d.inSun ? [255, 220, 50, 50] : [30, 30, 80, 60],
              getRadius: 6,
              radiusUnits: 'meters',
              pickable: false,
              shadowEnabled: false,
            });
          }
        } catch (e) {
          console.warn('Shadow overlay failed', e);
          shadowPendingRef.current = false;
        }
      }
    }

    if (shadowLayer) {
      baseLayers.push(shadowLayer);
    }

    if (showBuildings && buildingsLayer) {
      baseLayers.push(buildingsLayer);
    }

    if (searchedLocation) {
      baseLayers.push(
        new ScatterplotLayer({
          id: 'highlight-marker',
          data: [searchedLocation],
          getPosition: (d: any) => [d.lng, d.lat, 50],
          getFillColor: [59, 130, 246, 200],
          getRadius: 10,
          radiusMinPixels: 6,
          radiusMaxPixels: 20,
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 2,
          shadowEnabled: false
        })
      );
    }

    overlay.setProps({ layers: baseLayers, effects: [lightingEffect] });
  }, []);

  // Initialize shadow worker after renderDeckGL is defined
  useEffect(() => {
    try {
      const w = new Worker(new URL('./workers/shadowWorker.ts', import.meta.url), { type: 'module' });
      shadowWorkerRef.current = w;
      w.onmessage = (ev: MessageEvent) => {
        const data = ev.data;
        if (data && data.pts) {
          const params = lastShadowRequestRef.current;
          shadowCacheRef.current = {
            alt: params?.alt ?? 0,
            az: params?.az ?? 0,
            lat: params?.lat ?? 0,
            lng: params?.lng ?? 0,
            pts: data.pts
          };
        } else if (data && data.error) {
          console.warn('shadowWorker error:', data.error);
        }
        shadowPendingRef.current = false;
        const last = lastTimeOfDayRef.current;
        if (last !== null) {
          // Trigger a single re-render to pick up fresh shadows
          renderDeckGL(last);
        }
      };
      w.onerror = (err) => {
        console.warn('shadowWorker onerror', err);
        shadowPendingRef.current = false;
      };
    } catch (e) {
      console.warn('Failed to create shadow worker', e);
    }

    return () => {
      if (shadowWorkerRef.current) {
        shadowWorkerRef.current.terminate();
        shadowWorkerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      {/* Search Bar & Discover Toggle */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[600px] z-20 flex gap-2">
        <div className="bg-white rounded-full shadow-lg flex items-center px-4 py-3 border border-gray-100 flex-1 min-w-[180px]">
          <Search className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
          <Autocomplete onPlaceSelect={handlePlaceSelect} />
        </div>
        <button
          onClick={() => setIsDiscoverOpen(!isDiscoverOpen)}
          className="bg-white rounded-full shadow-lg px-4 py-3 border border-gray-100 flex items-center gap-2 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
        >
          <Sparkles className="w-5 h-5 text-amber-500" />
          <span className="hidden sm:inline">Discover Sunny Spots</span>
        </button>
        {/* Layers toggle */}
        <div className="relative">
          <button
            onClick={() => setIsLayersOpen(v => !v)}
            className={`bg-white rounded-full shadow-lg px-4 py-3 border transition-colors text-sm font-medium flex items-center gap-2 ${isLayersOpen ? 'border-blue-300 text-blue-600' : 'border-gray-100 text-gray-700 hover:bg-gray-50'}`}
          >
            <Layers className="w-5 h-5" />
            <span className="hidden sm:inline">Layers</span>
          </button>
          {isLayersOpen && (
            <div className="absolute right-0 top-14 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 w-48 z-30 flex flex-col gap-3">
              {([
                { label: 'Buildings', value: showBuildings, set: setShowBuildings },
                { label: 'Ground / Floor', value: showFloor, set: setShowFloor },
                { label: 'Sol Search', value: showShadows, set: setShowShadows },
              ] as const).map(({ label, value, set }) => (
                <label key={label} className="flex items-center justify-between cursor-pointer select-none">
                  <span className="text-sm text-gray-700 font-medium">{label}</span>
                  <button
                    role="switch"
                    aria-checked={value}
                    onClick={() => set(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-blue-500' : 'bg-gray-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </label>
              ))}

              <div className="pt-1">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                >
                  <Link className="w-4 h-4" />
                  <span>{copied ? 'Copied!' : 'Copy link'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Discover Sidebar */}
      {isDiscoverOpen && (
        <div className="absolute top-20 right-4 w-80 max-h-[calc(100vh-160px)] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 z-20 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              Sunlight Rankings
            </h3>
            <button onClick={() => setIsDiscoverOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-4 flex flex-col gap-3 overflow-y-auto">
            <p className="text-xs text-gray-500 leading-relaxed">
              Find places and rank them by estimated sun exposure and Gemini reviews.
            </p>
            
            <div className="flex gap-2">
              <input 
                type="text" 
                value={discoverQuery}
                onChange={(e) => setDiscoverQuery(e.target.value)}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. Bars with happy hour"
              />
              <button 
                onClick={handleDiscover}
                disabled={isDiscovering || !bounds}
                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isDiscovering ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Rank'}
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-3">
              {discoverResults.map((place, i) => (
                <div 
                  key={i} 
                  className="bg-gray-50 rounded-xl p-3 border border-gray-100 cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => {
                    if (place.geometry?.location) {
                      handlePlaceSelect(place.geometry.location);
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-medium text-sm text-gray-900 pr-2">{place.name}</h4>
                    <div className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold shrink-0">
                      <Sun className="w-3 h-3" />
                      {place.sunScore}
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{place.aiReason}</p>
                </div>
              ))}
              {discoverResults.length === 0 && !isDiscovering && (
                <div className="text-center text-sm text-gray-400 py-8">
                  Search to find sunny spots in your current view.
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* UI Hint */}
      <div className="hidden md:block absolute top-36 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-black/50 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium text-white/90 shadow-lg">
          Hold <kbd className="bg-white/20 px-1.5 py-0.5 rounded mx-1">Shift</kbd> + Drag (or use 2-finger twist) to rotate 3D view
        </div>
      </div>

      {/* Map */}
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: 40.7128, lng: -74.0060 }} // Default to NYC
        defaultZoom={16}
        defaultTilt={45}
        defaultHeading={0}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={true}
        gestureHandling="greedy"
        tiltInteractionEnabled={true}
        headingInteractionEnabled={true}
        onIdle={handleMapIdle}
        onClick={(e: any) => {
          const ll = e?.detail?.latLng;
          if (ll) {
            try {
              setTimelineLocation({ lat: ll.lat(), lng: ll.lng() });
            } catch {
              setTimelineLocation({ lat: ll.lat, lng: ll.lng });
            }
          }
        }}
        renderingType="VECTOR"
      />

      {/* Deck.gl Overlay is now managed imperatively via overlayRef */}

      {/* Mobile Control Panel (collapsible via React state) */}
      <div className="md:hidden absolute bottom-6 left-4 right-4 z-10 flex justify-center">
        <div className="w-full max-w-xl">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 overflow-hidden">
            <button type="button" onClick={() => setIsPanelOpen(v => !v)} aria-expanded={isPanelOpen} className="flex items-center justify-center p-2 cursor-grab">
              <div className="w-10 h-1.5 bg-gray-300 rounded-full"></div>
            </button>
            <div className={isPanelOpen ? 'transition-all duration-200 max-h-[40vh] overflow-auto' : 'transition-all duration-200 max-h-20 overflow-hidden'}>
              <div className="p-4">
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800 flex items-center">
                      <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                      Sunlight Simulator
                    </h3>
                    <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                      {format(date, 'MMM d, yyyy')}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wider">Date</label>
                      <input
                        type="date"
                        value={format(date, 'yyyy-MM-dd')}
                        onChange={(e) => { const newDate = new Date(e.target.value); setDate(newDate); updateUrl({ date: newDate }); }}
                        className="w-full text-sm border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 py-2 px-3 bg-gray-50"
                      />
                    </div>
                    <div className="max-h-[28vh] overflow-auto">
                      <TimeOfDayController
                        date={date}
                        lat={bounds ? bounds.getCenter().lat() : 40.7128}
                        lng={bounds ? bounds.getCenter().lng() : -74.0060}
                        onRenderFrame={renderDeckGL}
                        initialMinutes={initialMinutes}
                        onCommitMinutes={(m) => { updateUrl({ minutes: m }); setCurrentTimeMinutes(m); }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="hidden md:block absolute bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[500px] z-10">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-5 border border-white/20">
          <div className="flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                Sunlight Simulator
              </h3>
              <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                {format(date, 'MMM d, yyyy')}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-5">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={format(date, 'yyyy-MM-dd')}
                  onChange={(e) => { const newDate = new Date(e.target.value); setDate(newDate); updateUrl({ date: newDate }); }}
                  className="w-full text-sm border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 py-2 px-3 bg-gray-50"
                />
              </div>
              <div className="flex-1">
                <TimeOfDayController
                  date={date}
                  lat={bounds ? bounds.getCenter().lat() : 40.7128}
                  lng={bounds ? bounds.getCenter().lng() : -74.0060}
                  onRenderFrame={renderDeckGL}
                  initialMinutes={initialMinutes}
                  onCommitMinutes={(m) => { updateUrl({ minutes: m }); setCurrentTimeMinutes(m); }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {timelineLocation && (
        <SunTimeline
          lat={timelineLocation.lat}
          lng={timelineLocation.lng}
          date={date}
          currentTimeMinutes={currentTimeMinutes}
          onClose={() => setTimelineLocation(null)}
          getSunExposureScore={(lat, lng, alt, az) =>
            getSunExposureScore(lat, lng, stateRef.current.geojsonData, alt, az)
          }
        />
      )}

    </div>
  );
}
