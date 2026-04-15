import { useEffect, useMemo, useRef } from 'react'
import { AmbientLight, LightingEffect, _SunLight as SunLight } from '@deck.gl/core'
import { MVTLayer } from '@deck.gl/geo-layers'
import { GoogleMapsOverlay } from '@deck.gl/google-maps'
import { SolidPolygonLayer } from '@deck.gl/layers'
import { useMap } from '@vis.gl/react-google-maps'
import { useAppStore } from '../../store/useAppStore'
import { getSunLightConfig, getSunPosition } from '../../utils/sunMath'

type BuildingFeature = {
  properties: {
    render_height?: number
    height?: number
    levels?: number
  }
}

// Phong material for buildings — diffuse + specular gives depth to faces
const BUILDING_MATERIAL = {
  ambient: 0.15,
  diffuse: 0.7,
  shininess: 24,
  specularColor: [80, 90, 100] as [number, number, number],
}

// Ground responds to sun but low shininess — matte like concrete/asphalt
const GROUND_MATERIAL = {
  ambient: 0.25,
  diffuse: 0.75,
  shininess: 4,
  specularColor: [20, 20, 20] as [number, number, number],
}

export default function DeckGLOverlay() {
  const map = useMap()
  const overlayRef = useRef<GoogleMapsOverlay | null>(null)

  const { currentDate, timeOfDayMinutes, mapViewState, layerToggles } = useAppStore()

  const sunPos = getSunPosition(mapViewState.lat, mapViewState.lng, currentDate, timeOfDayMinutes)
  const sunLightConfig = getSunLightConfig(sunPos, currentDate, timeOfDayMinutes)

  const lightingEffect = useMemo(() => {
    // Ambient at 0.5 so night side of buildings isn't pitch black
    const ambientLight = new AmbientLight({
      color: [255, 255, 255],
      intensity: 0.5,
    })

    const sunLight = new SunLight({
      timestamp: sunLightConfig.timestamp,
      color: sunLightConfig.color,
      intensity: sunLightConfig.intensity,
    })

    return new LightingEffect({ ambientLight, sunLight })
  }, [sunLightConfig.timestamp, sunLightConfig.intensity, sunLightConfig.color])

  // Ground polygon: ~1.5 km box around current center
  const groundPolygon = useMemo(() => {
    const { lat, lng } = mapViewState
    const d = 0.015 // ~1.5 km
    return [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
    ]
  }, [mapViewState.lat, mapViewState.lng])

  const layers = useMemo(() => {
    const nextLayers = []

    // Ground plane — always visible so streets/plazas have a surface that responds to sun
    nextLayers.push(
      new SolidPolygonLayer({
        id: 'ground-plane',
        data: [{ polygon: groundPolygon }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getPolygon: (d: { polygon: number[][] }) => d.polygon as any,
        getFillColor: [45, 48, 52, 255], // dark urban asphalt
        extruded: false,
        material: GROUND_MATERIAL,
        pickable: false,
      }),
    )

    if (layerToggles.showBuildings) {
      nextLayers.push(
        new MVTLayer({
          id: 'osm-buildings-layer',
          // Required env var: VITE_MAPTILER_KEY
          data: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${import.meta.env.VITE_MAPTILER_KEY}`,
          // Cap tile fetching at zoom 14 (MapTiler v3 data limit); deck.gl overzooms above this
          maxZoom: 14,
          extruded: true,
          loadOptions: {
            mvt: {
              layers: ['building'],
            },
          },
          getElevation: (feature: BuildingFeature) =>
            feature.properties.render_height ??
            feature.properties.height ??
            (feature.properties.levels ? feature.properties.levels * 3.5 : 10),
          getFillColor: [74, 85, 104, 255],
          material: BUILDING_MATERIAL,
          pickable: false,
        }),
      )
    }

    return nextLayers
  }, [layerToggles.showBuildings, groundPolygon])

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
