import { create } from 'zustand'

export interface Place {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  sunScore?: number // 0–100, set after Gemini ranking
  photoUrl?: string
}

export interface MapViewState {
  lat: number
  lng: number
  zoom: number
}

export interface LayerToggles {
  showBuildings: boolean
  showShadows: boolean
}

interface AppState {
  // Simulation time
  currentDate: Date
  timeOfDayMinutes: number // 0 = midnight, 720 = noon, 1439 = 23:59

  // Map viewport
  mapViewState: MapViewState

  // Layer visibility
  layerToggles: LayerToggles

  // Discovered venues
  discoveredPlaces: Place[]
  isDiscovering: boolean

  // Actions
  setCurrentDate: (date: Date) => void
  setTimeOfDayMinutes: (minutes: number) => void
  setMapViewState: (vs: Partial<MapViewState>) => void
  toggleLayer: (key: keyof LayerToggles) => void
  setDiscoveredPlaces: (places: Place[]) => void
  setIsDiscovering: (loading: boolean) => void
}

// Parse URL params for initial values (if running in a browser)
const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

const parsedLat = urlParams.get('lat')
const parsedLng = urlParams.get('lng')
const parsedZoom = urlParams.get('zoom')
const parsedT = urlParams.get('t')

const latFromUrl = parsedLat ? Number(parsedLat) : undefined
const lngFromUrl = parsedLng ? Number(parsedLng) : undefined
const zoomFromUrl = parsedZoom ? Number(parsedZoom) : undefined
const tFromUrl = parsedT ? Number(parsedT) : undefined

// Defaults
const defaultDate = new Date()
defaultDate.setHours(0, 0, 0, 0) // zero the time portion

const defaultMapViewState: MapViewState = {
  lat: typeof latFromUrl === 'number' && !isNaN(latFromUrl) ? latFromUrl : 37.7749,
  lng: typeof lngFromUrl === 'number' && !isNaN(lngFromUrl) ? lngFromUrl : -122.4194,
  zoom: typeof zoomFromUrl === 'number' && !isNaN(zoomFromUrl) ? zoomFromUrl : 15,
}

const defaultTimeOfDay = typeof tFromUrl === 'number' && !isNaN(tFromUrl) ? tFromUrl : 720

export const useAppStore = create<AppState>((set: any, _get: any) => ({
  // state
  currentDate: defaultDate,
  timeOfDayMinutes: defaultTimeOfDay,

  mapViewState: defaultMapViewState,

  layerToggles: {
    showBuildings: true,
    showShadows: true,
  },

  discoveredPlaces: [],
  isDiscovering: false,

  // actions
  setCurrentDate: (date: Date) => set(() => ({ currentDate: date })),

  setTimeOfDayMinutes: (minutes: number) =>
    set(() => ({ timeOfDayMinutes: minutes })),

  setMapViewState: (vs: Partial<MapViewState>) =>
    set((state: AppState) => ({ mapViewState: { ...state.mapViewState, ...vs } })),

  toggleLayer: (key: keyof LayerToggles) =>
    set((state: AppState) => ({ layerToggles: { ...state.layerToggles, [key]: !state.layerToggles[key] } })),

  setDiscoveredPlaces: (places: Place[]) => set(() => ({ discoveredPlaces: places })),

  setIsDiscovering: (loading: boolean) => set(() => ({ isDiscovering: loading })),
}))

// URL sync subscriber (must live in this file)
useAppStore.subscribe((state) => {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams()
  params.set('lat', String(state.mapViewState.lat))
  params.set('lng', String(state.mapViewState.lng))
  params.set('zoom', String(state.mapViewState.zoom))
  params.set('t', String(state.timeOfDayMinutes))
  const newUrl = '?' + params.toString()
  // replace state without creating a history entry
  window.history.replaceState(null, '', newUrl)
})

export default useAppStore
