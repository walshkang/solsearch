import { useEffect, useMemo } from 'react'
import { AmbientLight, LightingEffect, _SunLight as SunLight } from '@deck.gl/core'
import { MVTLayer } from '@deck.gl/geo-layers'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { useControl } from 'react-map-gl/maplibre'
import { useAppStore } from '../../store/useAppStore'
import { getSunLightConfig, getSunPosition } from '../../utils/sunMath'

type BuildingFeature = {
  properties: {
    render_height?: number
    height?: number
    levels?: number
  }
}

const BUILDING_MATERIAL = {
  ambient: 0.15,
  diffuse: 0.7,
  shininess: 24,
  specularColor: [80, 90, 100] as [number, number, number],
}

function useMapboxOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return overlay
}

export default function DeckGLOverlay() {
  const { currentDate, timeOfDayMinutes, mapViewState, layerToggles } = useAppStore()

  const sunPos = getSunPosition(mapViewState.lat, mapViewState.lng, currentDate, timeOfDayMinutes)
  const sunLightConfig = getSunLightConfig(sunPos, currentDate, timeOfDayMinutes)

  const lightingEffect = useMemo(() => {
    const ambientLight = new AmbientLight({
      color: [255, 255, 255],
      intensity: layerToggles.showShadows ? 0.5 : 1.0,
    })

    if (!layerToggles.showShadows) {
      return new LightingEffect({ ambientLight })
    }

    const sunLight = new SunLight({
      timestamp: sunLightConfig.timestamp,
      color: sunLightConfig.color,
      intensity: sunLightConfig.intensity,
      _shadow: true,
    })

    return new LightingEffect({ ambientLight, sunLight })
  }, [sunLightConfig.timestamp, sunLightConfig.intensity, sunLightConfig.color, layerToggles.showShadows])

  const layers = useMemo(() => {
    if (!layerToggles.showBuildings) return []

    return [
      new MVTLayer({
        id: 'osm-buildings-layer',
        data: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${import.meta.env.VITE_MAPTILER_KEY}`,
        maxZoom: 14,
        extruded: true,
        loadOptions: { mvt: { layers: ['building'] } },
        getElevation: (feature: BuildingFeature) =>
          feature.properties.render_height ??
          feature.properties.height ??
          (feature.properties.levels ? feature.properties.levels * 3.5 : 10),
        getFillColor: [74, 85, 104, 255],
        material: BUILDING_MATERIAL,
        pickable: false,
      }),
    ]
  }, [layerToggles.showBuildings])

  useMapboxOverlay({ interleaved: true, layers, effects: [lightingEffect] })

  return null
}
