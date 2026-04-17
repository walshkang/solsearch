import { getSunLightConfig, getSunPosition } from './sunMath'

describe('withMinutes (local time)', () => {
  const baseDate = new Date('2025-06-21')

  test('720 minutes -> local 12:00:00', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 720)
    const d = new Date(cfg.timestamp)
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  test('90 minutes -> local 01:30:00', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 90)
    const d = new Date(cfg.timestamp)
    expect(d.getHours()).toBe(1)
    expect(d.getMinutes()).toBe(30)
    expect(d.getSeconds()).toBe(0)
  })

  test('1439 minutes -> local 23:59:00', () => {
    const cfg = getSunLightConfig({ altitude: 0 }, baseDate, 1439)
    const d = new Date(cfg.timestamp)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
    expect(d.getSeconds()).toBe(0)
  })
})

describe('getSunPosition', () => {
  test('noon in NYC on 2025-06-21 is above horizon', () => {
    const baseDate = new Date('2025-06-21')
    const pos = getSunPosition(40.75, -73.98, baseDate, 720)
    expect(pos.isAboveHorizon).toBe(true)
  })

  test('noon is brighter than 4pm (intensity decreases as sun lowers)', () => {
    const baseDate = new Date('2025-06-21')
    const noon = getSunPosition(40.75, -73.98, baseDate, 720)
    const afternoon = getSunPosition(40.75, -73.98, baseDate, 960) // 4pm
    const noonCfg = getSunLightConfig(noon, baseDate, 720)
    const afternoonCfg = getSunLightConfig(afternoon, baseDate, 960)
    expect(noonCfg.intensity).toBeGreaterThan(afternoonCfg.intensity)
  })
})
