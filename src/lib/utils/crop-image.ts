export type PixelCrop = { x: number; y: number; width: number; height: number }

export function clampCrop(
  crop: PixelCrop,
  naturalWidth: number,
  naturalHeight: number,
): PixelCrop {
  const x = Math.max(0, Math.round(crop.x))
  const y = Math.max(0, Math.round(crop.y))
  const right = Math.min(naturalWidth, Math.round(crop.x + crop.width))
  const bottom = Math.min(naturalHeight, Math.round(crop.y + crop.height))
  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  }
}
