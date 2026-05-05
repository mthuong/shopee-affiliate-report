import { clampCrop, scaleDisplayCropToNatural } from '../crop-image'

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

describe('scaleDisplayCropToNatural', () => {
  // react-image-crop's onComplete returns coordinates in DISPLAYED pixel
  // space (the rendered <img>'s on-screen size). The canvas crop runs in
  // NATURAL pixel space (the source image's intrinsic size). Without this
  // conversion, cropping a full-screen mobile screenshot through a 70vh
  // modal yields a tiny rectangle from the top-left of the natural image.

  it('returns the input unchanged when display equals natural', () => {
    const result = scaleDisplayCropToNatural(
      { x: 10, y: 20, width: 100, height: 200 },
      { width: 500, height: 500 },
      { width: 500, height: 500 },
    )
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 200 })
  })

  it('scales every coordinate when natural is 2x display', () => {
    const result = scaleDisplayCropToNatural(
      { x: 50, y: 25, width: 100, height: 100 },
      { width: 400, height: 300 },
      { width: 800, height: 600 },
    )
    expect(result).toEqual({ x: 100, y: 50, width: 200, height: 200 })
  })

  it('scales x/width by display→natural width ratio and y/height by height ratio', () => {
    const result = scaleDisplayCropToNatural(
      { x: 10, y: 10, width: 50, height: 50 },
      { width: 200, height: 100 },
      { width: 800, height: 200 },
    )
    expect(result).toEqual({ x: 40, y: 20, width: 200, height: 100 })
  })

  it('returns the input unchanged when display dimensions are 0 (no layout yet)', () => {
    const result = scaleDisplayCropToNatural(
      { x: 5, y: 5, width: 50, height: 50 },
      { width: 0, height: 0 },
      { width: 800, height: 600 },
    )
    expect(result).toEqual({ x: 5, y: 5, width: 50, height: 50 })
  })
})
