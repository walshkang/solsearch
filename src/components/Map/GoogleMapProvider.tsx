import { APIProvider, Map, type MapCameraChangedEvent } from '@vis.gl/react-google-maps'
import DeckGLOverlay from './DeckGLOverlay'
import SunRaysOverlay from './SunRaysOverlay'
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
    const { center, zoom, heading, tilt } = ev.detail
    setMapViewState({
      lat: center.lat,
      lng: center.lng,
      zoom,
      heading: heading ?? mapViewState.heading,
      tilt: tilt ?? mapViewState.tilt,
    })
  }

  return (
    <APIProvider apiKey={apiKey}>
      {/* Wrapper provides positioning context for the canvas overlay */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Map
          center={{ lat: mapViewState.lat, lng: mapViewState.lng }}
          zoom={mapViewState.zoom}
          heading={mapViewState.heading}
          tilt={mapViewState.tilt}
          onCameraChanged={handleCameraChanged}
          // Required env var: VITE_GOOGLE_MAP_ID (must be a vector-enabled Map ID for tilt/rotation)
          mapId={import.meta.env.VITE_GOOGLE_MAP_ID}
          mapTypeId="roadmap"
          gestureHandling="greedy"
          rotateControl
          tiltInteractionEnabled
          style={{ width: '100%', height: '100%' }}
        >
          <DeckGLOverlay />
        </Map>
        {/* Canvas sits above the map but below the UI sidebar */}
        <SunRaysOverlay />
      </div>
    </APIProvider>
  )
}
