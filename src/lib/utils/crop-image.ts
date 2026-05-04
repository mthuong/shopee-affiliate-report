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

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function pickOutputMime(sourceMime: string): string {
  return ALLOWED_MIME_TYPES.has(sourceMime) ? sourceMime : 'image/jpeg'
}

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, sx, sy, sw, sh) => {
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh)
      },
      close: () => bitmap.close(),
    }
  }
  // Fallback: HTMLImageElement via object URL
  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to load image for cropping'))
    img.src = url
  })
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    draw: (ctx, sx, sy, sw, sh) => {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    },
    close: () => URL.revokeObjectURL(url),
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mime, quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      mime,
      quality,
    )
  })
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function cropFileToBase64(
  file: File,
  rawCrop: PixelCrop,
): Promise<{ base64: string; mimeType: string; blob: Blob }> {
  const bitmap = await loadBitmap(file)
  try {
    const crop = clampCrop(rawCrop, bitmap.width, bitmap.height)
    if (crop.width === 0 || crop.height === 0) {
      throw new Error('Crop area is empty after clamping')
    }
    const useOffscreen = typeof OffscreenCanvas !== 'undefined'
    const canvas: HTMLCanvasElement | OffscreenCanvas = useOffscreen
      ? new OffscreenCanvas(crop.width, crop.height)
      : Object.assign(document.createElement('canvas'), {
          width: crop.width,
          height: crop.height,
        })
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null
    if (!ctx) throw new Error('Failed to acquire 2D canvas context')
    bitmap.draw(ctx, crop.x, crop.y, crop.width, crop.height)
    const mimeType = pickOutputMime(file.type)
    const blob = await canvasToBlob(canvas, mimeType, 0.92)
    const base64 = await blobToBase64(blob)
    return { base64, mimeType, blob }
  } finally {
    bitmap.close()
  }
}

export async function readFileAsCropped(file: File): Promise<{ base64: string; mimeType: string }> {
  // "Use full image" path: read original bytes without canvas re-encoding.
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { base64: btoa(binary), mimeType: file.type || 'image/jpeg' }
}
