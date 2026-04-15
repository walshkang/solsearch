import SunCalc from 'suncalc'

export interface SunPosition {
  azimuth: number
  altitude: number
  isAboveHorizon: boolean
}

export interface SunLightConfig {
  timestamp: number
  color: [number, number, number]
  intensity: number
}

function withMinutes(baseDate: Date, timeOfDayMinutes: number): Date {
  const date = new Date(baseDate)
  date.setHours(0, 0, 0, 0)
  date.setMinutes(timeOfDayMinutes)
  return date
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getSunPosition(
  lat: number,
  lng: number,
  currentDate: Date,
  timeOfDayMinutes: number,
): SunPosition {
  const date = withMinutes(currentDate, timeOfDayMinutes)
  const position = SunCalc.getPosition(date, lat, lng)

  return {
    azimuth: position.azimuth,
    altitude: position.altitude,
    isAboveHorizon: position.altitude > 0,
  }
}

export function getSunLightConfig(
  sunPos: SunPosition,
  currentDate: Date,
  timeOfDayMinutes: number,
): SunLightConfig {
  const timestamp = withMinutes(currentDate, timeOfDayMinutes).getTime()
  const normalizedAltitude = clamp((sunPos.altitude + Math.PI / 2) / Math.PI, 0, 1)
  const intensity = clamp(0.2 + normalizedAltitude * 1.8, 0.2, 2)

  return {
    timestamp,
    color: [255, 244, 214],
    intensity,
  }
}
