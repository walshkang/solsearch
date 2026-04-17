import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchNearbyVenues } from './placesService';

function makeFetchResponse(places: any[]) {
  return {
    ok: true,
    json: async () => ({ places }),
  };
}

describe('searchNearbyVenues - coordinate filtering', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    // restore original fetch
    globalThis.fetch = originalFetch;
    vi.resetAllMocks();
  });

  it('returns a venue with valid coordinates', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFetchResponse([
      {
        id: '1',
        displayName: 'Good Place',
        location: { lat: 12.34, lng: 56.78 },
        formattedAddress: '123 Road',
        types: ['restaurant'],
      },
    ])));

    const res = await searchNearbyVenues({ lat: 0, lng: 0 }, 'API_KEY');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('1');
    expect(res[0].lat).toBeCloseTo(12.34);
    expect(res[0].lng).toBeCloseTo(56.78);
  });

  it('excludes a venue with missing location (null)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFetchResponse([
      {
        id: '2',
        displayName: 'No Location',
        location: null,
      },
    ])));

    const res = await searchNearbyVenues({ lat: 0, lng: 0 }, 'API_KEY');
    expect(res.length).toBe(0);
  });

  it('excludes a venue with non-numeric lat', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFetchResponse([
      {
        id: '3',
        displayName: 'Bad Lat',
        location: { lat: 'not-a-number', lng: 'also-bad' },
      },
    ])));

    const res = await searchNearbyVenues({ lat: 0, lng: 0 }, 'API_KEY');
    expect(res.length).toBe(0);
  });

  it('returns only valid venues when mixed valid and invalid present', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(makeFetchResponse([
      {
        id: '1',
        displayName: 'Good Place',
        location: { lat: 12.34, lng: 56.78 },
      },
      {
        id: '2',
        displayName: 'No Location',
        location: null,
      },
    ])));

    const res = await searchNearbyVenues({ lat: 0, lng: 0 }, 'API_KEY');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('1');
  });
});
