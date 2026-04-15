export interface PlacesSearchParams {
  lat: number;
  lng: number;
  radiusMeters?: number; // default 500
  types?: string[]; // default ['restaurant', 'bar', 'cafe', 'park']
}

export interface RawPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  types: string[];
  rating?: number;
  photoReference?: string | null;
}

export async function searchNearbyVenues(
  params: PlacesSearchParams,
  apiKey: string
): Promise<RawPlace[]> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  const body = {
    includedTypes: params.types ?? ['restaurant', 'bar', 'cafe', 'park'],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: params.lat, longitude: params.lng },
        radius: params.radiusMeters ?? 500,
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress,places.types,places.rating,places.photos',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Places API error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  if (!data || !Array.isArray(data.places)) {
    throw new Error('Places API: unexpected response format');
  }

  const mapped: RawPlace[] = data.places.map((p: any) => {
    const id = p.id ?? p.placeId ?? (p.name ? String(p.name) : '');
    const name = p.displayName ?? p.name ?? '';
    const lat = Number(p.location?.lat ?? p.location?.latitude ?? p.location?.latLng?.latitude ?? NaN);
    const lng = Number(p.location?.lng ?? p.location?.longitude ?? p.location?.latLng?.longitude ?? NaN);
    const address = p.formattedAddress ?? p.formatted_address ?? '';
    const types = Array.isArray(p.types) ? p.types.map(String) : [];
    const rating = typeof p.rating === 'number' ? p.rating : undefined;
    const photoReference = Array.isArray(p.photos) && p.photos.length > 0 ? (p.photos[0]?.photoReference ?? p.photos[0]?.photo_reference ?? null) : null;

    return {
      id: String(id),
      name: String(name),
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
      address: String(address),
      types,
      rating,
      photoReference,
    };
  });

  return mapped;
}
