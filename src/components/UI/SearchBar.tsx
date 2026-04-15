import React, { useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { searchNearbyVenues } from '../../services/placesService'
import { rankVenuesBySunExposure } from '../../services/aiService'
import type { VenueRankingInput } from '../../services/aiService'

interface SearchBarProps {
  googleApiKey: string
  geminiApiKey: string
}

const SearchBar: React.FC<SearchBarProps> = ({ googleApiKey, geminiApiKey }) => {
  const [text, setText] = useState('')
  const mapViewState = useAppStore((s) => s.mapViewState)
  const isDiscovering = useAppStore((s) => s.isDiscovering)
  const setIsDiscovering = useAppStore((s) => s.setIsDiscovering)
  const setDiscoveredPlaces = useAppStore((s) => s.setDiscoveredPlaces)
  const timeOfDayMinutes = useAppStore((s) => s.timeOfDayMinutes)

  const handleDiscover = async () => {
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

      const places = raw.map((r) => {
        const match = ranked.find((rr) => rr.id === r.id || rr.id === r.name)
        return {
          id: r.id,
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          address: r.address,
          sunScore: match?.sunScore,
          photoUrl: r.photoReference ?? undefined,
        }
      })

      setDiscoveredPlaces(places)
    } catch (err) {
      console.error('Discover failed', err)
    } finally {
      setIsDiscovering(false)
    }
  }

  return (
    <div className="bg-gray-800 text-gray-100 rounded-lg p-3 w-full">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search (future filter)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-gray-700 rounded px-2 py-1 text-sm"
        />

        <button
          onClick={handleDiscover}
          disabled={isDiscovering}
          className="bg-yellow-500 disabled:opacity-60 text-black font-semibold rounded px-3 py-1 flex items-center"
        >
          {isDiscovering ? (
            <svg className="w-4 h-4 animate-spin mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
          ) : null}
          Discover
        </button>
      </div>
    </div>
  )
}

export default SearchBar

