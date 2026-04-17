import { getBuildingElevation } from './DeckGLOverlay'

describe('getBuildingElevation', () => {
  test('uses render_height when present', () => {
    expect(getBuildingElevation({ properties: { render_height: 30 } as any })).toBe(30)
  })

  test('uses height when render_height absent', () => {
    expect(getBuildingElevation({ properties: { height: 20 } as any })).toBe(20)
  })

  test('uses levels when height absent', () => {
    expect(getBuildingElevation({ properties: { levels: 4 } as any })).toBe(14)
  })

  test('defaults to 10 when properties empty', () => {
    expect(getBuildingElevation({ properties: {} as any })).toBe(10)
  })

  test('handles null properties (regression)', () => {
    // This is the crash case before the fix; should return 10
    expect(getBuildingElevation({ properties: null as any })).toBe(10)
  })
})