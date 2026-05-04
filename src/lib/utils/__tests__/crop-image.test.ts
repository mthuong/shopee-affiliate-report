import { clampCrop } from '../crop-image'

describe('clampCrop', () => {
  it('returns the rect unchanged when fully inside bounds', () => {
    const result = clampCrop({ x: 10, y: 20, width: 100, height: 200 }, 500, 500)
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 })
  })

  it('clamps a negative origin to 0 and reduces size accordingly', () => {
    const result = clampCrop({ x: -10, y: -5, width: 100, height: 100 }, 500, 500)
    expect(result).toEqual({ x: 0, y: 0, width: 90, height: 95 })
  })

  it('clamps width and height that overflow the natural bounds', () => {
    const result = clampCrop({ x: 400, y: 400, width: 200, height: 200 }, 500, 500)
    expect(result).toEqual({ x: 400, y: 400, width: 100, height: 100 })
  })

  it('rounds fractional values to integers', () => {
    const result = clampCrop({ x: 10.7, y: 20.3, width: 100.6, height: 200.2 }, 500, 500)
    expect(result).toEqual({ x: 11, y: 20, width: 100, height: 201 })
  })

  it('returns zero-size rect when input is entirely outside bounds', () => {
    const result = clampCrop({ x: 600, y: 600, width: 100, height: 100 }, 500, 500)
    expect(result.width).toBe(0)
    expect(result.height).toBe(0)
  })
})
