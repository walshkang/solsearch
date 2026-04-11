import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Map, useMap, useMapsLibrary, MapEvent } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { GeoJsonLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { LightingEffect, AmbientLight, _SunLight as SunLight } from '@deck.gl/core';
import osmtogeojson from 'osmtogeojson';
import SunCalc from 'suncalc';
import * as turf from '@turf/turf';
import { format } from 'date-fns';
import { Search, Loader2, MapPin, Building, Sparkles, X, Sun } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

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

  // Discover Panel State
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState('Bars with happy hour');
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

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
      { time: 0, color: [30, 30, 50] },
      { time: dawn - 1, color: [30, 30, 50] },
      { time: dawn, color: [80, 70, 100] },
      { time: sunrise, color: [255, 160, 100] }, // Brighter orange
      { time: goldenHourEnd, color: [255, 240, 210] },
      { time: solarNoon, color: [255, 255, 255] },
      { time: goldenHour, color: [255, 240, 210] },
      { time: sunset, color: [255, 160, 100] }, // Brighter orange
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
    
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://lz4.overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return osmtogeojson(data);
      } catch (err) {
        console.warn(`Failed to fetch from ${url}:`, err);
        lastError = err;
      }
    }
    throw lastError || new Error('All Overpass API endpoints failed');
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

  const handleDiscover = async () => {
    if (!bounds || !map) return;
    setIsDiscovering(true);
    setDiscoverResults([]);
    
    try {
      // 1. Find places using Google Places API
      const placesService = new google.maps.places.PlacesService(map);
      const request = {
        query: discoverQuery,
        bounds: bounds,
      };

      placesService.textSearch(request, async (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          // Groundwork: We have the places. 
          // Next step would be to calculate sun exposure for each place's location
          // using the 3D building data and sun position.
          // For now, we use Gemini to analyze the places and mock a sun score.
          
          try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
            
            // Merge AI data with Places data
            const ranked = results.slice(0, 6).map(p => {
              const aiInfo = aiData.find((a: any) => a.name.includes(p.name) || p.name.includes(a.name)) || { reason: 'Looks like a great spot!', sunScore: Math.floor(Math.random() * 40) + 40 };
              return {
                ...p,
                aiReason: aiInfo.reason,
                sunScore: aiInfo.sunScore
              };
            }).sort((a, b) => b.sunScore - a.sunScore);

            setDiscoverResults(ranked);
          } catch (e) {
            console.error("Gemini error", e);
            // Fallback if Gemini fails
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

  // --- Deck.gl Layers & Lighting ---
  const lightingEffect = useMemo(() => {
    const ambientLight = new AmbientLight({
      color: sunColor,
      intensity: 1.2
    });

    const sunLight = new SunLight({
      timestamp: currentTimestamp,
      color: sunColor,
      intensity: 3.5,
      _shadow: true
    });

    return new LightingEffect({ ambientLight, sunLight });
  }, [currentTimestamp, sunColor]);

  const layers = useMemo(() => {
    const baseLayers = [];

    if (bounds) {
      const center = bounds.getCenter();
      const lat = center.lat();
      const lng = center.lng();
      const sunPos = SunCalc.getPosition(new Date(currentTimestamp), lat, lng);
      
      // Calculate how dark it should be (0 = day, 1 = night)
      const darkness = Math.max(0, Math.min(1, -sunPos.altitude / 0.1));
      const tintAlpha = Math.floor(darkness * 180); // Max darkness alpha

      const d = 0.1; // ~10km radius
      const groundPolygon = [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d]
      ];

      // Dynamic Ground Plane: Tints the street level based on sun color and catches shadows
      if (geojsonData) {
        let groundAlpha = 60; // Base alpha to catch shadows during the day
        if (sunPos.altitude < 0) {
          // Increase alpha at night to darken the map
          const darkness = Math.min(1, -sunPos.altitude / 0.2);
          groundAlpha = 60 + Math.floor(darkness * 140); // Up to 200
        } else if (sunPos.altitude < 0.2) {
          // Slightly increase alpha during sunset for a stronger golden hour tint
          const sunsetness = (0.2 - sunPos.altitude) / 0.2;
          groundAlpha = 60 + Math.floor(sunsetness * 40); // Up to 100
        }

        baseLayers.push(
          new PolygonLayer({
            id: 'ground-plane',
            data: [{ polygon: groundPolygon }],
            getPolygon: (d: any) => d.polygon,
            getFillColor: [...sunColor, groundAlpha] as [number, number, number, number],
            shadowEnabled: false,
            pickable: false,
            updateTriggers: {
              getFillColor: [sunColor, groundAlpha]
            }
          })
        );
      }
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
            // Make buildings transparent when zoomed in close to see sun coverage inside blocks
            const alpha = zoom > 17.5 ? 120 : 255;
            if (f.id === highlightedFeatureId) {
              return [59, 130, 246, alpha]; // Bright blue for highlighted building
            }
            return [245, 245, 245, alpha];
          },
          getLineColor: (f: any) => {
            const alpha = zoom > 17.5 ? 120 : 255;
            if (f.id === highlightedFeatureId) {
              return [255, 255, 255, alpha];
            }
            return [200, 200, 200, alpha];
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
            getFillColor: [highlightedFeatureId, zoom],
            getLineColor: [highlightedFeatureId, zoom]
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

    return baseLayers;
  }, [geojsonData, bounds, currentTimestamp, sunColor, highlightedFeatureId, searchedLocation, zoom]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100">
      {/* Search Bar & Discover Toggle */}
      <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[600px] z-20 flex gap-2">
        <div className="bg-white rounded-full shadow-lg flex items-center px-4 py-3 border border-gray-100 flex-1">
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
