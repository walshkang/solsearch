import { vi, describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock modules before importing the hook
vi.mock('../services/placesService', () => ({
  searchNearbyVenues: vi.fn(),
}))
vi.mock('../services/aiService', () => ({
  rankVenuesBySunExposure: vi.fn(),
}))
vi.mock('../store/useAppStore', () => ({
  default: vi.fn(),
}))

import { searchNearbyVenues } from '../services/placesService'
import { rankVenuesBySunExposure } from '../services/aiService'
import useAppStore from '../store/useAppStore'
import { useDiscover } from './useDiscover'

describe('useDiscover smoke integration', () => {
  const mockSetDiscoveredPlaces = vi.fn()
  const mockSetIsDiscovering = vi.fn((val: boolean) => {
    // optional: side-effect if needed
  })
  const mockSetLastSearchCenter = vi.fn()

  const mockMapViewState = { lat: 10, lng: 20 }
  const mockTimeOfDayMinutes = 720 // noon

  const mockState = {
    mapViewState: mockMapViewState,
    timeOfDayMinutes: mockTimeOfDayMinutes,
    discoveredPlaces: [],
    isDiscovering: false,
    lastSearchCenter: null,
    setDiscoveredPlaces: mockSetDiscoveredPlaces,
    setIsDiscovering: mockSetIsDiscovering,
    setLastSearchCenter: mockSetLastSearchCenter,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as unknown as vi.Mock).mockImplementation((selector: any) => selector(mockState))
  })

  it('calls setDiscoveredPlaces with merged results and toggles isDiscovering', async () => {
    const raw = [
      { id: 'v1', name: 'One', address: 'A', types: [], lat: 1, lng: 2, photoReference: 'p1' },
      { id: 'v2', name: 'Two', address: 'B', types: [], lat: 3, lng: 4 },
    ]
    ;(searchNearbyVenues as unknown as vi.Mock).mockResolvedValue(raw)

    const ranked = [
      { id: 'v1', sunScore: 80 },
      { id: 'v2', sunScore: 30 },
    ]
    ;(rankVenuesBySunExposure as unknown as vi.Mock).mockResolvedValue(ranked)

    const { result } = renderHook(() => useDiscover('GKEY', 'GEM'))

    await act(async () => {
      await result.current.discover()
    })

    // setDiscoveredPlaces called with combined result containing sunScore
    expect(mockSetDiscoveredPlaces).toHaveBeenCalled()
    const calledArg = mockSetDiscoveredPlaces.mock.calls[0][0]
    expect(Array.isArray(calledArg)).toBe(true)
    expect(calledArg).toHaveLength(2)
    expect(calledArg.find((p: any) => p.id === 'v1')?.sunScore).toBe(80)
    expect(calledArg.find((p: any) => p.id === 'v2')?.sunScore).toBe(30)

    // isDiscovering toggles via setter: true then false
    expect(mockSetIsDiscovering).toHaveBeenCalled()
    expect(mockSetIsDiscovering.mock.calls[0][0]).toBe(true)
    expect(mockSetIsDiscovering.mock.calls[mockSetIsDiscovering.mock.calls.length - 1][0]).toBe(false)
  })

  it('ensures setIsDiscovering(false) is called when searchNearbyVenues throws', async () => {
    ;(searchNearbyVenues as unknown as vi.Mock).mockRejectedValue(new Error('boom'))
    ;(rankVenuesBySunExposure as unknown as vi.Mock).mockResolvedValue([])

    const { result } = renderHook(() => useDiscover('GKEY', 'GEM'))

    await act(async () => {
      await result.current.discover()
    })

    // setIsDiscovering should have been called with false in the finally block
    expect(mockSetIsDiscovering).toHaveBeenCalled()
    expect(mockSetIsDiscovering.mock.calls[mockSetIsDiscovering.mock.calls.length - 1][0]).toBe(false)
  })
})
