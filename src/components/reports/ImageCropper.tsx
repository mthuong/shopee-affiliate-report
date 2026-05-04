'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { cropFileToBase64, readFileAsCropped } from '@/lib/utils/crop-image'

const MIN_CROP_SIDE = 32

type Props = {
  file: File
  currentIndex: number
  totalCount: number
  onConfirm: (cropped: { base64: string; mimeType: string; blob: Blob }) => void
  onUseFullImage: (full: { base64: string; mimeType: string }) => void
  onClose: () => void
  onRemove: () => void
}

export function ImageCropper({
  file,
  currentIndex,
  totalCount,
  onConfirm,
  onUseFullImage,
  onClose,
  onRemove,
}: Props) {
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  })
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    imgRef.current = e.currentTarget
    const { naturalWidth, naturalHeight } = e.currentTarget
    setCompletedCrop({
      unit: 'px',
      x: 0,
      y: 0,
      width: naturalWidth,
      height: naturalHeight,
    })
  }

  async function handleConfirm() {
    if (busy) return
    const img = imgRef.current
    if (!img) return
    const px: PixelCrop = completedCrop ?? {
      unit: 'px',
      x: 0,
      y: 0,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }
    if (px.width < MIN_CROP_SIDE || px.height < MIN_CROP_SIDE) return
    setBusy(true)
    try {
      const result = await cropFileToBase64(file, px)
      onConfirm(result)
    } catch (err) {
      console.error('[ImageCropper] crop failed', err)
      setBusy(false)
    }
  }

  async function handleUseFullImage() {
    if (busy) return
    setBusy(true)
    try {
      const result = await readFileAsCropped(file)
      onUseFullImage(result)
    } catch (err) {
      console.error('[ImageCropper] read full image failed', err)
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-gray-950 border border-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">
            Crop image {currentIndex} of {totalCount} — drag to select the order area
          </h3>
          <button
            type="button"
            aria-label="Close cropper"
            onClick={onClose}
            disabled={busy}
            className="text-gray-400 hover:text-gray-200 disabled:opacity-40 px-2"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-auto bg-black/60 flex items-center justify-center p-4">
          <ReactCrop
            crop={crop}
            onChange={(_px, percent) => setCrop(percent)}
            onComplete={(px) => setCompletedCrop(px)}
            keepSelection
            minWidth={MIN_CROP_SIDE}
            minHeight={MIN_CROP_SIDE}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={objectUrl}
              alt="Image being cropped"
              onLoad={onImageLoad}
              style={{ maxHeight: '70vh', display: 'block' }}
            />
          </ReactCrop>
        </div>
        <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 px-3 py-1.5 rounded"
          >
            Remove
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUseFullImage}
              disabled={busy}
              className="text-xs text-gray-300 hover:text-gray-100 border border-gray-700 px-3 py-1.5 rounded disabled:opacity-40"
            >
              Use full image
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="text-xs text-white bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Confirm crop'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
