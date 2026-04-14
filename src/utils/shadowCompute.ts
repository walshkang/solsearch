import * as turf from '@turf/turf';

export interface ShadowPoint {
  position: [number, number]; // [lng, lat]
  inSun: boolean;
}

function metersPerDegree(lat: number) {
  const latMeters = 111320;
  const lngMeters = 111320 * Math.cos((lat * Math.PI) / 180);
  return { latMeters, lngMeters };
}

function getBuildingHeight(feature: any): number {
  if (!feature?.properties) return 12;
  if (feature.properties.render_height) {
    const h = parseFloat(feature.properties.render_height);
    if (!isNaN(h)) return h;
  }
  if (feature.properties.height) {
    const h = parseFloat(feature.properties.height);
    if (!isNaN(h)) return h;
  }
  if (feature.properties['building:levels']) {
    const l = parseFloat(feature.properties['building:levels']);
    if (!isNaN(l)) return l * 3.5;
  }
  if (feature.properties.levels) {
    const l = parseFloat(feature.properties.levels);
    if (!isNaN(l)) return l * 3.5;
  }
  return 12;
}

// Pre-filter buildings to only those whose bbox intersects the ray corridor
function getBuildingsNearRay(
  features: any[],
  startLng: number,
  startLat: number,
  endLng: number,
  endLat: number,
  marginDeg: number = 0.001
): any[] {
  const minLng = Math.min(startLng, endLng) - marginDeg;
  const maxLng = Math.max(startLng, endLng) + marginDeg;
  const minLat = Math.min(startLat, endLat) - marginDeg;
  const maxLat = Math.max(startLat, endLat) + marginDeg;

  return features.filter(f => {
    if (!f.geometry) return false;
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') return false;
    try {
      const bbox = turf.bbox(f);
      // bbox = [minLng, minLat, maxLng, maxLat]
      return bbox[0] <= maxLng && bbox[2] >= minLng && bbox[1] <= maxLat && bbox[3] >= minLat;
    } catch {
      return true; // include if bbox fails
    }
  });
}

// Core single-point shadow test — returns true if the point is in shadow
function isPointInShadow(
  lat: number,
  lng: number,
  candidateFeatures: any[], // pre-filtered buildings
  maxRayDistance: number,
  bearing: number,
  tanAlt: number,
  latMeters: number,
  lngMeters: number
): boolean {
  const step = 2; // meters
  for (let s = step; s <= maxRayDistance; s += step) {
    const east = s * Math.sin(bearing);
    const north = s * Math.cos(bearing);
    const sampleLat = lat + north / latMeters;
    const sampleLng = lng + east / lngMeters;
    const pt = turf.point([sampleLng, sampleLat]);

    for (const feat of candidateFeatures) {
      try {
        if (turf.booleanPointInPolygon(pt, feat)) {
          const bh = getBuildingHeight(feat);
          if (bh / tanAlt >= s - 1e-6) return true;
        }
      } catch {
        // ignore geometry errors
      }
    }
  }
  return false;
}

export function computeShadowGrid(
  geojson: any,
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  spacingMetersInput: number,
  sunAltitude: number,
  sunAzimuth: number
): ShadowPoint[] {
  if (!geojson?.features || sunAltitude <= 0) return [];

  const tanAlt = Math.tan(sunAltitude);
  if (tanAlt <= 0) return [];

  const radiusMeters = radiusKm * 1000;
  let spacingMeters = Math.max(1, spacingMetersInput);

  // Cap at 800 points
  let estimated = Math.PI * (radiusMeters ** 2) / (spacingMeters ** 2);
  while (estimated > 800) {
    spacingMeters *= 1.25;
    estimated = Math.PI * (radiusMeters ** 2) / (spacingMeters ** 2);
  }

  const { latMeters, lngMeters } = metersPerDegree(centerLat);
  const bearing = sunAzimuth;

  // Compute max ray distance once
  let maxBuildingHeight = 0;
  for (const f of geojson.features) {
    const h = getBuildingHeight(f);
    if (h > maxBuildingHeight) maxBuildingHeight = h;
  }
  const maxRayDistance = maxBuildingHeight / tanAlt;

  const half = radiusMeters;
  const cols = Math.ceil((half * 2) / spacingMeters);
  const rows = Math.ceil((half * 2) / spacingMeters);
  const points: ShadowPoint[] = [];

  for (let i = 0; i <= cols; i++) {
    for (let j = 0; j <= rows; j++) {
      const dx = i * spacingMeters - half;
      const dy = j * spacingMeters - half;
      if (Math.sqrt(dx * dx + dy * dy) > radiusMeters) continue;

      const lat = centerLat + dy / latMeters;
      const lng = centerLng + dx / lngMeters;

      // Ray end point for bbox pre-filter
      const rayEndLat = lat + (maxRayDistance * Math.cos(bearing)) / latMeters;
      const rayEndLng = lng + (maxRayDistance * Math.sin(bearing)) / lngMeters;
      const nearby = getBuildingsNearRay(geojson.features, lng, lat, rayEndLng, rayEndLat);

      const inShadow = nearby.length > 0 && isPointInShadow(
        lat, lng, nearby, maxRayDistance, bearing, tanAlt, latMeters, lngMeters
      );

      points.push({ position: [lng, lat], inSun: !inShadow });
    }
  }

  return points;
}

export function getSunExposureScore(
  lat: number,
  lng: number,
  geojson: any,
  sunAltitude: number,
  sunAzimuth: number
): number {
  if (!geojson || sunAltitude <= 0) return 1;

  const tanAlt = Math.tan(sunAltitude);
  if (tanAlt <= 0) return 0;

  const { latMeters, lngMeters } = metersPerDegree(lat);
  const bearing = sunAzimuth;
  const spacing = 5; // meters

  // Compute maxBuildingHeight once for all 9 samples
  let maxBuildingHeight = 0;
  for (const f of geojson.features ?? []) {
    const h = getBuildingHeight(f);
    if (h > maxBuildingHeight) maxBuildingHeight = h;
  }
  const maxRayDistance = maxBuildingHeight / tanAlt;

  let inSunCount = 0;

  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      const sampleLat = lat + (iy * spacing) / latMeters;
      const sampleLng = lng + (ix * spacing) / lngMeters;

      const rayEndLat = sampleLat + (maxRayDistance * Math.cos(bearing)) / latMeters;
      const rayEndLng = sampleLng + (maxRayDistance * Math.sin(bearing)) / lngMeters;
      const nearby = getBuildingsNearRay(geojson.features, sampleLng, sampleLat, rayEndLng, rayEndLat);

      const inShadow = nearby.length > 0 && isPointInShadow(
        sampleLat, sampleLng, nearby, maxRayDistance, bearing, tanAlt, latMeters, lngMeters
      );

      if (!inShadow) inSunCount++;
    }
  }

  return inSunCount / 9;
}
