import { APIProvider, Map, type MapCameraChangedEvent } from '@vis.gl/react-google-maps'
import DeckGLOverlay from './DeckGLOverlay'
import { useAppStore } from '../../store/useAppStore'

export interface GoogleMapProviderProps {
  apiKey: string
  mapsApiKey: string
}

export default function GoogleMapProvider({ apiKey, mapsApiKey }: GoogleMapProviderProps) {
  void mapsApiKey
  const mapViewState = useAppStore((s) => s.mapViewState)
  const setMapViewState = useAppStore((s) => s.setMapViewState)

  const handleCameraChanged = (ev: MapCameraChangedEvent) => {
    const { center, zoom } = ev.detail
    setMapViewState({
      lat: center.lat,
      lng: center.lng,
      zoom,
    })
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        center={{ lat: mapViewState.lat, lng: mapViewState.lng }}
        zoom={mapViewState.zoom}
        onCameraChanged={handleCameraChanged}
        // Required env var: VITE_GOOGLE_MAP_ID
        mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
        mapTypeId="roadmap"
        style={{ width: '100%', height: '100%' }}
      >
        <DeckGLOverlay />
      </Map>
    </APIProvider>
  )
}
