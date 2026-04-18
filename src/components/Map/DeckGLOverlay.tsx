import { useMemo } from 'react'
import { AmbientLight, LightingEffect, _SunLight as SunLight } from '@deck.gl/core'
import { MVTLayer } from '@deck.gl/geo-layers'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { SolidPolygonLayer } from '@deck.gl/layers'
import { useControl } from 'react-map-gl/maplibre'
import { useAppStore } from '../../store/useAppStore'
import { getSunLightConfig, getSunPosition } from '../../utils/sunMath'

type BuildingFeature = {
  properties: {
    render_height?: number
    height?: number
    levels?: number
  } | null
}

export function getBuildingElevation(feature: BuildingFeature): number {
  const p = feature.properties
  if (!p) return 10
  return p.render_height ?? p.height ?? (p.levels ? p.levels * 3.5 : 10)
}

// Building material — high ambient keeps faces away from sun visible.
const BUILDING_MATERIAL = {
  ambient: 0.65,
  diffuse: 0.5,
  shininess: 8,
  specularColor: [60, 70, 80] as [number, number, number],
}

// We use a high diffuse multiplier to ensure lit areas clamp to white,
// while ambient: 0.35 ensures shadowed areas are distinctly darkened.
const GROUND_SHADOW_MATERIAL = {
  ambient: 0.35,
  diffuse: 3.0,
  shininess: 0,
  specularColor: [0, 0, 0] as [number, number, number],
}

// Multiply-blend: output.rgb = src.rgb × dst.rgb (map tiles).
// White src → no change. Gray src → darkens map.
// depthCompare 'always': ground plane always draws (it's an overlay).
// depthWriteEnabled false: doesn't block buildings from rendering on top.
const GROUND_SHADOW_PARAMETERS = {
  blend: true,
  blendColorSrcFactor: 'dst' as const,
  blendColorDstFactor: 'zero' as const,
  blendAlphaSrcFactor: 'one' as const,
  blendAlphaDstFactor: 'zero' as const,
  depthWriteEnabled: false,
  depthCompare: 'always' as const,
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
      intensity: layerToggles.showShadows ? 1.0 : 2.0,
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

    const effect = new LightingEffect({ ambientLight, sunLight })

    return effect
  }, [sunLightConfig.timestamp, sunLightConfig.intensity, sunLightConfig.color, layerToggles.showShadows])

  // Ground polygon: large box centered on viewport — edges always off-screen.
  const groundPolygon = useMemo(() => {
    const { lat, lng } = mapViewState
    const d = 1.0
    return [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d]]
  }, [mapViewState.lat, mapViewState.lng])

  const layers = useMemo(() => {
    const next = []

    // Multiply-blended white ground plane — acts as the shadow receiver.
    // Lit fragments → white → multiply = no visible change to map.
    // Shadowed fragments → gray → multiply = map darkened proportionally.
    if (layerToggles.showShadows) {
      next.push(
        new SolidPolygonLayer({
          id: 'ground-shadow',
          data: [{ polygon: groundPolygon }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPolygon: (d: { polygon: number[][] }) => d.polygon as any,
          getFillColor: [255, 255, 255, 255],
          extruded: true,
          getElevation: 0,
          getPolygonOffset: () => [0, 100],
          material: GROUND_SHADOW_MATERIAL,
          parameters: GROUND_SHADOW_PARAMETERS,
          pickable: false,
        }),
      )
    }

    if (layerToggles.showBuildings) {
      next.push(
        new MVTLayer({
          id: 'osm-buildings-layer',
          data: `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${import.meta.env.VITE_MAPTILER_KEY}`,
          maxZoom: 14,
          extruded: true,
          loadOptions: { mvt: { layers: ['building'] } },
          getElevation: (feature: BuildingFeature) => getBuildingElevation(feature),
          getFillColor: [190, 185, 175, 255],
          material: BUILDING_MATERIAL,
          _subLayerProps: {
            'polygons-fill': { material: BUILDING_MATERIAL },
          },
          pickable: false,
        }),
      )
    }

    return next
  }, [layerToggles.showBuildings, layerToggles.showShadows, groundPolygon])

  useMapboxOverlay({ interleaved: true, layers, effects: [lightingEffect] })

  return null
}
