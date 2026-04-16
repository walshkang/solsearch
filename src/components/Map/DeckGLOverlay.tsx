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
  }
}

// Higher ambient so the unlit faces of buildings stay readable.
// Reduced shininess — urban concrete isn't glossy.
const BUILDING_MATERIAL = {
  ambient: 0.5,
  diffuse: 0.6,
  shininess: 8,
  specularColor: [60, 70, 80] as [number, number, number],
}

// Multiply-blend ground plane: white = no change in sun, dark = shadow.
// depthCompare: 'always' avoids z-fighting against MapLibre's ground tiles.
// depthWriteEnabled: false so buildings still depth-test normally over it.
const GROUND_SHADOW_PARAMETERS = {
  blend: true,
  blendColorSrcFactor: 'dst' as const,   // multiply: output.rgb = src.rgb × map.rgb
  blendColorDstFactor: 'zero' as const,
  blendAlphaSrcFactor: 'one' as const,
  blendAlphaDstFactor: 'zero' as const,
  depthWriteEnabled: false,
  depthCompare: 'always' as const,
}

// diffuse: 5.0 is intentionally overdriven — GLSL clamps to [0,1].
// Sunlit ground:  ambientIntensity×0.5 + sunIntensity×sin(alt)×5.0  → clamps to 1.0 (white)
// Shadow ground:  ambientIntensity×0.5 ≈ 0.35  → multiply darkens map by ~65 %
const GROUND_MATERIAL = {
  ambient: 0.5,
  diffuse: 5.0,
  shininess: 0,
  specularColor: [0, 0, 0] as [number, number, number],
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
      intensity: layerToggles.showShadows ? 0.7 : 1.0,
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

  // Ground polygon: ~100 km box — large enough that the edge is always off-screen
  // at any practical zoom level (viewport width ≈ 0.08° at zoom 15; d=1.0 is 12× that)
  const groundPolygon = useMemo(() => {
    const { lat, lng } = mapViewState
    const d = 1.0
    return [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d]]
  }, [mapViewState.lat, mapViewState.lng])

  const layers = useMemo(() => {
    const next = []

    // White ground plane with multiply blend — visible only as shadow.
    // Must come before buildings so it renders at ground level first.
    if (layerToggles.showShadows) {
      next.push(
        new SolidPolygonLayer({
          id: 'ground-shadow',
          data: [{ polygon: groundPolygon }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          getPolygon: (d: { polygon: number[][] }) => d.polygon as any,
          getFillColor: [255, 255, 255, 255],
          extruded: false,
          material: GROUND_MATERIAL,
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
          getElevation: (feature: BuildingFeature) =>
            feature.properties.render_height ??
            feature.properties.height ??
            (feature.properties.levels ? feature.properties.levels * 3.5 : 10),
          getFillColor: [74, 85, 104, 255],
          material: BUILDING_MATERIAL,
          // Force material onto the SolidPolygonLayer sub-layer — MVTLayer composite
          // chain doesn't always propagate material reliably, causing inconsistent lighting.
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
