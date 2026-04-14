import { computeShadowGrid } from '../utils/shadowCompute';

export {};

self.onmessage = (ev: MessageEvent) => {
  const data = ev.data || {};
  const { geojson, lat, lng, radiusKm, spacingMeters, sunAltitude, sunAzimuth } = data;
  try {
    // computeShadowGrid is synchronous and CPU-bound; run and post result
    const pts = computeShadowGrid(geojson, lat, lng, radiusKm, spacingMeters, sunAltitude, sunAzimuth);
    // Post serializable result
    (self as any).postMessage({ pts });
  } catch (err: any) {
    (self as any).postMessage({ error: err?.message || String(err) });
  }
};
