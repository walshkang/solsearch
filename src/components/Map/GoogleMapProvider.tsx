import { useEffect, useState } from 'react'
import { APIProvider, Map, type MapCameraChangedEvent } from '@vis.gl/react-google-maps'
import DeckGLOverlay from './DeckGLOverlay'
import SunRaysOverlay from './SunRaysOverlay'
import { useAppStore } from '../../store/useAppStore'

export interface GoogleMapProviderProps {
  apiKey: string
}

function GestureHint() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(fadeTimer)
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        transition: 'opacity 0.6s ease',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
      }}
    >
      <div className="bg-zinc-900/80 text-zinc-200 text-xs rounded-full px-4 py-2 flex items-center gap-3 backdrop-blur-sm whitespace-nowrap">
        <span>Scroll to zoom</span>
        <span className="text-zinc-500">·</span>
        <span>Ctrl + drag to tilt</span>
        <span className="text-zinc-500">·</span>
        <span>Right-click drag to rotate 360°</span>
      </div>
    </div>
  )
}

export default function GoogleMapProvider({ apiKey }: GoogleMapProviderProps) {
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
          defaultCenter={{ lat: mapViewState.lat, lng: mapViewState.lng }}
          defaultZoom={mapViewState.zoom}
          defaultHeading={mapViewState.heading}
          defaultTilt={mapViewState.tilt}
          onCameraChanged={handleCameraChanged}
          // Required env var: VITE_GOOGLE_MAP_ID (must be a vector-enabled Map ID for tilt/rotation)
          mapId={import.meta.env.VITE_GOOGLE_MAP_ID ?? undefined}
          renderingType="VECTOR"
          mapTypeId="roadmap"
          gestureHandling="greedy"
          rotateControl
          tiltInteractionEnabled
          style={{ width: '100%', height: '100%' }}
        >
          <DeckGLOverlay />
        </Map>
        <SunRaysOverlay />
        <GestureHint />
      </div>
    </APIProvider>
  )
}
