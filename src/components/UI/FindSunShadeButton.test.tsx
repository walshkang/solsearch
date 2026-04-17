import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import FindSunShadeButton from './FindSunShadeButton'

vi.mock('../../store/useAppStore')
vi.mock('../../hooks/useDiscover')

const mockUseAppStore = vi.mocked(await import('../../store/useAppStore')).default
const mockUseDiscover = vi.mocked(await import('../../hooks/useDiscover')).useDiscover

const BASE_MAP_VIEW = { lat: 40.7549, lng: -73.984, zoom: 15, heading: 0, tilt: 45 }

function setupStore({
  lat = BASE_MAP_VIEW.lat,
  lng = BASE_MAP_VIEW.lng,
  lastSearchCenter = null as { lat: number; lng: number } | null,
} = {}) {
  mockUseAppStore.mockImplementation((selector: any) =>
    selector({
      mapViewState: { ...BASE_MAP_VIEW, lat, lng },
      lastSearchCenter,
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseDiscover.mockReturnValue({ discover: vi.fn(), isDiscovering: false })
})

describe('FindSunShadeButton label', () => {
  it('shows "Searching…" when isDiscovering', () => {
    setupStore()
    mockUseDiscover.mockReturnValue({ discover: vi.fn(), isDiscovering: true })
    render(<FindSunShadeButton googleApiKey="" geminiApiKey="" />)
    expect(screen.getByRole('button')).toHaveTextContent('Searching…')
  })

  it('shows "Find sun & shade here" when map moved', () => {
    // Move >0.004 degrees from last search center
    setupStore({ lat: 40.7549, lng: -73.984, lastSearchCenter: { lat: 40.76, lng: -73.984 } })
    render(<FindSunShadeButton googleApiKey="" geminiApiKey="" />)
    expect(screen.getByRole('button')).toHaveTextContent('Find sun & shade here')
  })

  it('shows "Search again" when searched before but not moved', () => {
    setupStore({ lastSearchCenter: { lat: BASE_MAP_VIEW.lat, lng: BASE_MAP_VIEW.lng } })
    render(<FindSunShadeButton googleApiKey="" geminiApiKey="" />)
    expect(screen.getByRole('button')).toHaveTextContent('Search again')
  })

  it('shows "Find sun & shade" when never searched', () => {
    setupStore({ lastSearchCenter: null })
    render(<FindSunShadeButton googleApiKey="" geminiApiKey="" />)
    expect(screen.getByRole('button')).toHaveTextContent('Find sun & shade')
  })
})
