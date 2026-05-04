'use client'

import { useRef, useState } from 'react'

type Props = {
  onFilesSelected: (files: File[]) => void
  pendingCount: number
}

export function ImageUploader({ onFilesSelected, pendingCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (images.length > 0) onFilesSelected(images)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragging ? 'border-orange-400 bg-orange-400/5' : 'border-gray-700 hover:border-gray-500'}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
      <p className="text-gray-400 text-sm">
        {pendingCount > 0 ? `📎 ${pendingCount} image${pendingCount > 1 ? 's' : ''} selected — drop more or click to add` : '📎 Drop screenshots here or click to select'}
      </p>
      <p className="text-gray-600 text-xs mt-1">Supports JPG, PNG</p>
    </div>
  )
}
