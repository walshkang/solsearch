import { getSunLightConfig, getSunPosition } from './sunMath'

describe('withMinutes via getSunLightConfig (UTC correctness)', () => {
  const baseDate = new Date('2025-06-21T00:00:00Z') // explicit UTC midnight

  test('720 minutes -> 12:00 UTC', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 720)
    const d = new Date(cfg.timestamp)
    expect(d.getUTCHours()).toBe(12)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
  })

  test('90 minutes -> 01:30 UTC', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 90)
    const d = new Date(cfg.timestamp)
    expect(d.getUTCHours()).toBe(1)
    expect(d.getUTCMinutes()).toBe(30)
    expect(d.getUTCSeconds()).toBe(0)
  })

  test('1439 minutes -> 23:59 UTC', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 1439)
    const d = new Date(cfg.timestamp)
    expect(d.getUTCHours()).toBe(23)
    expect(d.getUTCMinutes()).toBe(59)
    expect(d.getUTCSeconds()).toBe(0)
  })
})

describe('getSunPosition behaviour', () => {
  test('Noon in NYC on 2025-06-21 is above horizon', () => {
    const baseDate = new Date('2025-06-21T00:00:00Z')
    const pos = getSunPosition(40.75, -73.98, baseDate, 720)
    expect(pos.isAboveHorizon).toBe(true)
  })
})
