import React from 'react'
import useAppStore from '../../store/useAppStore'
import { useDiscover } from '../../hooks/useDiscover'

interface Props {
  googleApiKey: string
  geminiApiKey: string
}

// Returns true when the map center has moved >~400m from where we last searched.
function hasMoved(
  current: { lat: number; lng: number },
  last: { lat: number; lng: number } | null
): boolean {
  if (!last) return false
  const dlat = current.lat - last.lat
  const dlng = current.lng - last.lng
  return Math.sqrt(dlat * dlat + dlng * dlng) > 0.004 // ~400 m
}

const FindSunShadeButton: React.FC<Props> = ({ googleApiKey, geminiApiKey }) => {
  const mapViewState = useAppStore((s) => s.mapViewState)
  const lastSearchCenter = useAppStore((s) => s.lastSearchCenter)
  const { discover, isDiscovering } = useDiscover(googleApiKey, geminiApiKey)

  const moved = hasMoved(mapViewState, lastSearchCenter)
  const label = isDiscovering
    ? 'Searching…'
    : moved
    ? 'Find sun & shade here'
    : lastSearchCenter
    ? 'Find sun & shade'
    : 'Find sun & shade'

  return (
    <button
      onClick={discover}
      disabled={isDiscovering}
      className="flex items-center gap-2 bg-white text-zinc-900 font-semibold text-sm px-4 py-2 rounded-full shadow-lg hover:bg-zinc-100 disabled:opacity-60 transition-colors whitespace-nowrap"
    >
      {isDiscovering ? (
        <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        <span>☀</span>
      )}
      {label}
    </button>
  )
}

export default FindSunShadeButton
