import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Map, useMap, useMapsLibrary, MapEvent } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { GeoJsonLayer, LineLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { LightingEffect, AmbientLight, _SunLight as SunLight } from '@deck.gl/core';
import osmtogeojson from 'osmtogeojson';
import SunCalc from 'suncalc';
import * as turf from '@turf/turf';
import { format } from 'date-fns';
import { Search, Loader2, MapPin, Building } from 'lucide-react';

// --- DeckGL Overlay Component ---
function DeckGLOverlay({ layers, effects }: { layers: any[]; effects: any[] }) {
  const map = useMap();
  const overlay = useMemo(() => new GoogleMapsOverlay({ interleaved: false }), []);

  useEffect(() => {
    if (map) {
      overlay.setMap(map);
    }
    return () => overlay.setMap(null);
  }, [map, overlay]);

  useEffect(() => {
    overlay.setProps({ layers, effects });
  }, [layers, effects, overlay]);

  return null;
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
  const [date, setDate] = useState<Date>(new Date());
  const [timeOfDay, setTimeOfDay] = useState<number>(14); // Default to 2:00 PM
  const [geojsonData, setGeojsonData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(16);
  const [showLoadButton, setShowLoadButton] = useState(true);
  const [searchedLocation, setSearchedLocation] = useState<{lat: number, lng: number} | null>(null);
  const [highlightedFeatureId, setHighlightedFeatureId] = useState<string | null>(null);

  const currentTimestamp = useMemo(() => {
    const d = new Date(date);
    d.setHours(Math.floor(timeOfDay));
    d.setMinutes((timeOfDay % 1) * 60);
    return d.getTime();
  }, [date, timeOfDay]);

  // Dynamic color calculation based on sun position
  const sunColor = useMemo(() => {
    if (!bounds) return [255, 255, 255]; // Default white
    const center = bounds.getCenter();
    const lat = center.lat();
    const lng = center.lng();
    
    const times = SunCalc.getTimes(date, lat, lng);
    const toHours = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    
    // Fallbacks in case sun doesn't set/rise (extreme latitudes)
    const dawn = times.dawn ? toHours(times.dawn) : 5;
    const sunrise = times.sunrise ? toHours(times.sunrise) : 6;
    const goldenHourEnd = times.goldenHourEnd ? toHours(times.goldenHourEnd) : 8;
    const solarNoon = times.solarNoon ? toHours(times.solarNoon) : 12;
    const goldenHour = times.goldenHour ? toHours(times.goldenHour) : 16;
    const sunset = times.sunset ? toHours(times.sunset) : 18;
    const dusk = times.dusk ? toHours(times.dusk) : 19;

    const keyframes = [
      { time: 0, color: [15, 15, 30] },
      { time: dawn - 1, color: [15, 15, 30] },
      { time: dawn, color: [50, 40, 80] },
      { time: sunrise, color: [255, 100, 50] }, // Deep orange
      { time: goldenHourEnd, color: [255, 230, 180] },
      { time: solarNoon, color: [255, 255, 255] },
      { time: goldenHour, color: [255, 230, 180] },
      { time: sunset, color: [255, 100, 50] }, // Deep orange
      { time: dusk, color: [50, 40, 80] },
      { time: dusk + 1, color: [15, 15, 30] },
      { time: 24, color: [15, 15, 30] }
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
    return [
      Math.round(k1.color[0] + (k2.color[0] - k1.color[0]) * t),
      Math.round(k1.color[1] + (k2.color[1] - k1.color[1]) * t),
      Math.round(k1.color[2] + (k2.color[2] - k1.color[2]) * t)
    ];
  }, [date, timeOfDay, bounds]);

  const handlePlaceSelect = (location: google.maps.LatLng) => {
    if (map) {
      map.panTo(location);
      map.setZoom(18);
      map.setTilt(60);
      setSearchedLocation({ lat: location.lat(), lng: location.lng() });
    }
  };

  useEffect(() => {
    if (searchedLocation && geojsonData) {
      const pt = turf.point([searchedLocation.lng, searchedLocation.lat]);
      let foundId = null;
      for (const feature of geojsonData.features) {
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
  }, [searchedLocation, geojsonData]);

  const fetchOSMBuildings = async (bbox: number[]) => {
    const query = `
      [out:json][timeout:25];
      (
        way["building"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
        relation["building"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});
      );
      out body;
      >;
      out skel qt;
    `;
    const url = `https://overpass-api.de/api/interpreter`;
    const response = await fetch(url, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return osmtogeojson(data);
  };

  const handleMapIdle = (e: MapEvent) => {
    const currentMap = e.map;
    const currentZoom = currentMap.getZoom();
    const currentBounds = currentMap.getBounds();

    if (currentZoom) setZoom(currentZoom);
    if (currentBounds) {
      setBounds(currentBounds);
      setShowLoadButton(true);
    }
  };

  const handleLoadBuildings = async () => {
    if (!bounds) return;
    
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    
    // No padding, just the exact view to keep query small and fast
    const bbox = [
      sw.lng(),
      sw.lat(),
      ne.lng(),
      ne.lat()
    ];

    setLoading(true);
    setShowLoadButton(false);
    
    try {
      const data = await fetchOSMBuildings(bbox);
      setGeojsonData(data);
    } catch (err) {
      console.error('Failed to fetch OSM data:', err);
      setShowLoadButton(true); // Show again so they can retry
    } finally {
      setLoading(false);
    }
  };

  // --- Deck.gl Layers & Lighting ---
  const lightingEffect = useMemo(() => {
    const ambientLight = new AmbientLight({
      color: sunColor,
      intensity: 0.6
    });

    const sunLight = new SunLight({
      timestamp: currentTimestamp,
      color: sunColor,
      intensity: 2.5,
      _shadow: true
    });

    return new LightingEffect({ ambientLight, sunLight });
  }, [currentTimestamp, sunColor]);

  const layers = useMemo(() => {
    const baseLayers = [];

    // Ground Plane to catch shadows
    if (bounds) {
      const center = bounds.getCenter();
      const d = 0.02; // ~2km radius
      baseLayers.push(
        new PolygonLayer({
          id: 'ground-plane',
          data: [{
            polygon: [
              [center.lng() - d, center.lat() - d],
              [center.lng() + d, center.lat() - d],
              [center.lng() + d, center.lat() + d],
              [center.lng() - d, center.lat() + d]
            ]
          }],
          getPolygon: (d: any) => d.polygon,
          getFillColor: [255, 255, 255, 60], // Semi-transparent white to catch shadows without hiding streets
          shadowEnabled: true,
          pickable: false
        })
      );
    }

    if (geojsonData) {
      baseLayers.push(
        new GeoJsonLayer({
          id: 'buildings',
          data: geojsonData,
          extruded: true,
          getElevation: (f: any) => {
            if (f.properties.height) {
              const h = parseFloat(f.properties.height);
              if (!isNaN(h)) return h;
            }
            if (f.properties['building:levels']) {
              const l = parseFloat(f.properties['building:levels']);
              if (!isNaN(l)) return l * 3.5;
            }
            return 12; // Default height
          },
          getFillColor: (f: any) => {
            if (f.id === highlightedFeatureId) {
              return [59, 130, 246, 255]; // Bright blue for highlighted building
            }
            return [245, 245, 245, 255];
          },
          getLineColor: (f: any) => {
            if (f.id === highlightedFeatureId) {
              return [255, 255, 255, 255];
            }
            return [200, 200, 200, 255];
          },
          material: {
            ambient: 0.2,
            diffuse: 0.8,
            shininess: 32,
            specularColor: [255, 255, 255]
          },
          shadowEnabled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 200, 0, 100],
          updateTriggers: {
            getFillColor: [highlightedFeatureId],
            getLineColor: [highlightedFeatureId]
          }
        })
      );
    }

    if (searchedLocation) {
      // Add a glowing marker above the searched location
      baseLayers.push(
        new ScatterplotLayer({
          id: 'highlight-marker',
          data: [searchedLocation],
          getPosition: (d: any) => [d.lng, d.lat, 50], // Hover 50m above ground
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

    // Add Sun Rays Layer
    if (bounds) {
      const center = bounds.getCenter();
      const lat = center.lat();
      const lng = center.lng();
      const sunPos = SunCalc.getPosition(new Date(currentTimestamp), lat, lng);

      if (sunPos.altitude > 0) {
        const rayLength = 0.05; // degrees
        // azimuth in suncalc: 0 is south, moving clockwise
        const dx = -Math.sin(sunPos.azimuth) * rayLength;
        const dy = -Math.cos(sunPos.azimuth) * rayLength;
        const dz = Math.sin(sunPos.altitude) * 5000; // 5000 meters high

        const rays = [];
        const numRays = 15;
        for (let i = -numRays; i <= numRays; i++) {
          const spread = 0.001; 
          const perpX = -dy * i * spread;
          const perpY = dx * i * spread;

          rays.push({
            sourcePosition: [lng + dx + perpX, lat + dy + perpY, dz],
            targetPosition: [lng + perpX * 0.2, lat + perpY * 0.2, 0]
          });
        }

        baseLayers.push(
          new LineLayer({
            id: 'sun-rays',
            data: rays,
            getSourcePosition: (d: any) => d.sourcePosition,
            getTargetPosition: (d: any) => d.targetPosition,
            getColor: [...sunColor, 25] as [number, number, number, number],
            getWidth: 10,
            widthUnits: 'pixels'
          })
        );
      }
    }

    return baseLayers;
  }, [geojsonData, bounds, currentTimestamp, sunColor]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      {/* Search Bar */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] z-10">
        <div className="bg-white rounded-full shadow-lg flex items-center px-4 py-3 border border-gray-100">
          <Search className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" />
          <Autocomplete onPlaceSelect={handlePlaceSelect} />
        </div>
      </div>

      {/* Load Buildings Button */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        {zoom < 15 ? (
          <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md text-sm font-medium text-gray-600 border border-gray-200">
            Zoom in closer to load 3D buildings
          </div>
        ) : showLoadButton ? (
          <button
            onClick={handleLoadBuildings}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center text-sm font-medium transition-all disabled:opacity-80"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Building className="w-4 h-4 mr-2" />
            )}
            {loading ? 'Loading...' : 'Load Buildings in View'}
          </button>
        ) : null}
      </div>

      {/* UI Hint */}
      <div className="absolute top-36 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-black/50 backdrop-blur px-3 py-1.5 rounded-full text-xs font-medium text-white/90 shadow-lg">
          Hold <kbd className="bg-white/20 px-1.5 py-0.5 rounded mx-1">Shift</kbd> + Drag to rotate 3D view
        </div>
      </div>

      {/* Map */}
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: 40.7128, lng: -74.0060 }} // Default to NYC
        defaultZoom={16}
        defaultTilt={45}
        defaultHeading={0}
        disableDefaultUI={true}
        onIdle={handleMapIdle}
        renderingType="VECTOR"
      />

      {/* Deck.gl Overlay */}
      <DeckGLOverlay layers={layers} effects={[lightingEffect]} />

      {/* Control Panel */}
      <div className="absolute bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[500px] z-10">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl p-5 border border-white/20">
          <div className="flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-gray-800 flex items-center">
                <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                Sunlight Simulator
              </h3>
              <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                {format(currentTimestamp, 'MMM d, yyyy - h:mm a')}
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-5">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wider">Date</label>
                <input
                  type="date"
                  value={format(date, 'yyyy-MM-dd')}
                  onChange={(e) => setDate(new Date(e.target.value))}
                  className="w-full text-sm border-gray-200 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 py-2 px-3 bg-gray-50"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wider">Time of Day</label>
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="0.25"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-2 font-medium">
                  <span>Midnight</span>
                  <span>6 AM</span>
                  <span>Noon</span>
                  <span>6 PM</span>
                  <span>Midnight</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
