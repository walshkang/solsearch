import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getSunPosition } from '../../utils/sunMath'

// Fixed angular offsets for each ray (radians from center direction).
// Non-random so rays don't flicker on re-draw.
const RAY_OFFSETS = [-0.30, -0.18, -0.09, -0.03, 0.04, 0.11, 0.21, 0.33, 0.08, -0.14]

export default function SunRaysOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentDate, timeOfDayMinutes, mapViewState } = useAppStore()

  const sunPos = getSunPosition(mapViewState.lat, mapViewState.lng, currentDate, timeOfDayMinutes)
  const altDeg = sunPos.altitude * 180 / Math.PI

  // Compass degrees of sun (0=N, 90=E) adjusted for map heading → screen direction
  const azDeg = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360
  const screenDeg = (azDeg - mapViewState.heading + 360) % 360

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    if (!sunPos.isAboveHorizon || altDeg < 2) return

    // Unit vector pointing FROM sun source TOWARD screen (screen-space, y-down)
    const sunRad = (screenDeg * Math.PI) / 180
    const ux = -Math.sin(sunRad) // toward screen x
    const uy = Math.cos(sunRad)  // toward screen y (y-down, so flip cos)

    const D = Math.hypot(W, H) * 1.6

    // Sun sits off-screen in the sun's azimuth direction
    const sx = W / 2 - ux * D
    const sy = H / 2 - uy * D

    // Intensity: builds quickly above horizon, softens past ~60° (high noon = less drama)
    const intensity = Math.min(1, altDeg / 12) * (1 - Math.max(0, (altDeg - 55) / 35) * 0.6)

    ctx.save()
    ctx.globalCompositeOperation = 'screen'

    for (const offset of RAY_OFFSETS) {
      // Rotate the toward-screen vector by offset angle
      const cosO = Math.cos(offset)
      const sinO = Math.sin(offset)
      const rux = ux * cosO - uy * sinO
      const ruy = ux * sinO + uy * cosO

      // Perpendicular to ray direction (for triangle width)
      const px = -ruy
      const py = rux

      const rayLen = D * 2.2
      const halfWidth = rayLen * (0.022 + Math.abs(offset) * 0.018)

      const ex = sx + rux * rayLen
      const ey = sy + ruy * rayLen

      // Radial gradient fades along the ray length
      const grad = ctx.createLinearGradient(sx, sy, ex, ey)
      grad.addColorStop(0,   `rgba(255,245,150, ${intensity * 0.00})`) // invisible at source
      grad.addColorStop(0.15, `rgba(255,245,150, ${intensity * 0.06})`) // brighten quickly
      grad.addColorStop(0.55, `rgba(255,238,130, ${intensity * 0.03})`)
      grad.addColorStop(1,   `rgba(255,235,120, 0)`)

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(ex + px * halfWidth, ey + py * halfWidth)
      ctx.lineTo(ex - px * halfWidth, ey - py * halfWidth)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }

    // Soft directional atmospheric glow — separate from the ray lines
    const glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, D * 1.1)
    glowGrad.addColorStop(0,   `rgba(255,230,100, 0)`)
    glowGrad.addColorStop(0.35, `rgba(255,230,100, ${intensity * 0.04})`)
    glowGrad.addColorStop(0.65, `rgba(255,215,70,  ${intensity * 0.02})`)
    glowGrad.addColorStop(1,   `rgba(255,210,60,  0)`)
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, W, H)

    ctx.restore()
  }, [screenDeg, altDeg, sunPos.isAboveHorizon])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 15, mixBlendMode: 'screen' }}
    />
  )
}
