import { useEffect, useState } from 'react'
import Map, { type ViewStateChangeEvent } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import DeckGLOverlay from './DeckGLOverlay'
import { useAppStore } from '../../store/useAppStore'

const MAP_STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`

function GestureHint() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(t)
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
        <span>Right-click drag to tilt &amp; rotate 360°</span>
      </div>
    </div>
  )
}

export default function MapLibreProvider() {
  const mapViewState = useAppStore((s) => s.mapViewState)
  const setMapViewState = useAppStore((s) => s.setMapViewState)

  const handleMove = (e: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, bearing, pitch } = e.viewState
    setMapViewState({ lat: latitude, lng: longitude, zoom, heading: bearing, tilt: pitch })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        initialViewState={{
          longitude: mapViewState.lng,
          latitude: mapViewState.lat,
          zoom: mapViewState.zoom,
          bearing: mapViewState.heading,
          pitch: mapViewState.tilt,
        }}
        onMove={handleMove}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
        antialias
        pitchWithRotate
        touchPitch
      >
        <DeckGLOverlay />
      </Map>
      <GestureHint />
    </div>
  )
}
