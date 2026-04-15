import { useEffect, useMemo, useRef } from 'react'
import { AmbientLight, LightingEffect, _SunLight as SunLight } from '@deck.gl/core'
import { MVTLayer } from '@deck.gl/geo-layers'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { ScatterplotLayer } from '@deck.gl/layers'
import { useMap } from '@vis.gl/react-google-maps'
import { type MapViewState, useAppStore } from '../../store/useAppStore'
import { getSunLightConfig, getSunPosition } from '../../utils/sunMath'

type CenterPoint = Pick<MapViewState, 'lat' | 'lng'>
type BuildingFeature = {
  properties: {
    render_height?: number
    height?: number
  }
}

export default function DeckGLOverlay() {
  const map = useMap()
  const overlayRef = useRef<GoogleMapsOverlay | null>(null)

  const { currentDate, timeOfDayMinutes, mapViewState, layerToggles } = useAppStore()

  const sunPos = getSunPosition(mapViewState.lat, mapViewState.lng, currentDate, timeOfDayMinutes)
  const sunLightConfig = getSunLightConfig(sunPos, currentDate, timeOfDayMinutes)

  const lightingEffect = useMemo(() => {
    const ambientLight = new AmbientLight({
      color: [255, 255, 255],
      intensity: 0.3,
    })

    const sunLight = new SunLight({
      timestamp: sunLightConfig.timestamp,
      color: sunLightConfig.color,
      intensity: sunLightConfig.intensity,
    })

    return new LightingEffect({ ambientLight, sunLight })
  }, [sunLightConfig])

  const layers = useMemo(() => {
    const nextLayers = []

    if (layerToggles.showBuildings) {
      // Required env var: VITE_MAPTILER_KEY
      nextLayers.push(
        new MVTLayer({
          id: 'osm-buildings-layer',
          data: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${import.meta.env.VITE_MAPTILER_KEY}`,
          extruded: true,
          loadOptions: {
            mvt: {
              layers: ['building'],
            },
          },
          getElevation: (feature: BuildingFeature) => feature.properties.render_height ?? feature.properties.height ?? 10,
          getFillColor: [74, 85, 104, 200],
          pickable: false,
        }),
      )
    }

    if (layerToggles.showShadows && sunPos.isAboveHorizon) {
      const centerData: CenterPoint[] = [{ lng: mapViewState.lng, lat: mapViewState.lat }]
      nextLayers.push(
        new ScatterplotLayer({
          id: 'sun-indicator-layer',
          data: centerData,
          getPosition: (d) => [d.lng, d.lat],
          getRadius: 35,
          radiusUnits: 'meters',
          getFillColor: [255, 200, 0, 220],
          pickable: false,
        }),
      )
    }

    return nextLayers
  }, [layerToggles.showBuildings, layerToggles.showShadows, mapViewState.lat, mapViewState.lng, sunPos.isAboveHorizon])

  useEffect(() => {
    if (!map) return

    if (!overlayRef.current) {
      overlayRef.current = new GoogleMapsOverlay({ interleaved: true })
      overlayRef.current.setMap(map)
    }

    overlayRef.current.setProps({
      layers,
      effects: [lightingEffect],
    })
  }, [map, layers, lightingEffect])

  useEffect(() => {
    return () => {
      overlayRef.current?.setMap(null)
      overlayRef.current = null
    }
  }, [])

  return null
}
