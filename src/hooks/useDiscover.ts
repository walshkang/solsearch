import useAppStore from '../store/useAppStore'
import { searchNearbyVenues } from '../services/placesService'
import { rankVenuesBySunExposure, type VenueRankingInput } from '../services/aiService'

export function useDiscover(googleApiKey: string, geminiApiKey: string) {
  const mapViewState = useAppStore((s) => s.mapViewState)
  const timeOfDayMinutes = useAppStore((s) => s.timeOfDayMinutes)
  const isDiscovering = useAppStore((s) => s.isDiscovering)
  const setIsDiscovering = useAppStore((s) => s.setIsDiscovering)
  const setDiscoveredPlaces = useAppStore((s) => s.setDiscoveredPlaces)
  const setLastSearchCenter = useAppStore((s) => s.setLastSearchCenter)

  const discover = async () => {
    setIsDiscovering(true)
    try {
      const { lat, lng } = mapViewState
      const raw = await searchNearbyVenues({ lat, lng }, googleApiKey)
      const currentHour = Math.floor(timeOfDayMinutes / 60)

      const rankingInput: VenueRankingInput[] = raw.map((r) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        types: r.types,
        lat: r.lat,
        lng: r.lng,
      }))

      const ranked = await rankVenuesBySunExposure(rankingInput, currentHour, geminiApiKey)
      const rankedById = new Map(ranked.map((rr) => [rr.id, rr]))

      const places = raw.map((r) => ({
        id: r.id,
        name: r.name,
        lat: r.lat,
        lng: r.lng,
        address: r.address,
        sunScore: rankedById.get(r.id)?.sunScore,
        photoUrl: r.photoReference ?? undefined,
      }))

      setDiscoveredPlaces(places)
      setLastSearchCenter({ lat, lng })
    } catch (err) {
      console.error('Discover failed', err)
    } finally {
      setIsDiscovering(false)
    }
  }

  return { discover, isDiscovering }
}
