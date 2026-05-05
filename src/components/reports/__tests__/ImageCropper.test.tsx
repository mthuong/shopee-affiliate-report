import { StrictMode } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImageCropper } from '../ImageCropper'

// Mock react-image-crop so it doesn't try to lay out an image in jsdom.
// We render a placeholder in place of the real cropper UI.
jest.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="rxc-mock">{children}</div>
  ),
  centerCrop: (c: unknown) => c,
  makeAspectCrop: (c: unknown) => c,
}))

// Mock the canvas-using helpers so confirm doesn't depend on canvas APIs;
// pass through the pure helpers (clampCrop, scaleDisplayCropToNatural).
jest.mock('@/lib/utils/crop-image', () => {
  const actual = jest.requireActual('@/lib/utils/crop-image')
  return {
    __esModule: true,
    ...actual,
    cropFileToBase64: jest.fn(async () => ({
      base64: 'CROPPED_BASE64',
      mimeType: 'image/jpeg',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
    })),
    readFileAsCropped: jest.fn(async () => ({
      base64: 'FULL_BASE64',
      mimeType: 'image/jpeg',
    })),
  }
})

function makeFile(): File {
  return new File(['fake'], 'shot.png', { type: 'image/png' })
}

// jsdom does not implement URL.createObjectURL/revokeObjectURL; stub them.
beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:mock'),
    })
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    })
  }
})

describe('ImageCropper', () => {
  it('keeps the displayed image URL alive under StrictMode', () => {
    // StrictMode runs effect setup → cleanup → setup again on initial mount.
    // If URL creation lives in render/useMemo, the cleanup revokes the URL
    // that the DOM still references → broken image, alt text shows.
    // This test fails on the broken pattern and passes after the URL
    // lifecycle is moved into a single useEffect.
    const liveUrls = new Set<string>()
    let counter = 0
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => {
        const url = `blob:mock-${counter++}`
        liveUrls.add(url)
        return url
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn((url: string) => {
        liveUrls.delete(url)
      }),
    })
    try {
      render(
        <StrictMode>
          <ImageCropper
            file={makeFile()}
            currentIndex={1}
            totalCount={1}
            onConfirm={jest.fn()}
            onUseFullImage={jest.fn()}
            onClose={jest.fn()}
            onRemove={jest.fn()}
          />
        </StrictMode>
      )
      const img = screen.getByAltText(/Image being cropped/i) as HTMLImageElement
      const src = img.getAttribute('src')
      expect(src).toBeTruthy()
      expect(liveUrls.has(src!)).toBe(true)
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: origCreate })
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: origRevoke })
    }
  })

  it('renders header with current/total count', () => {
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={3}
        totalCount={7}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    expect(screen.getByText(/Crop image 3 of 7/i)).toBeInTheDocument()
  })

  it('calls onConfirm with cropped bytes and blob when "Confirm crop" is clicked', async () => {
    const onConfirm = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={onConfirm}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    // jsdom may not fire onLoad for the <img> with a stubbed object URL,
    // so trigger it explicitly to set imgRef.current before confirming.
    // jsdom reports naturalWidth/Height AND width/height as 0; stub all four
    // (display dims gate the MIN_CROP_SIDE check; natural dims feed the
    // display→natural scale conversion).
    const img = screen.getByAltText(/Image being cropped/i) as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 600 })
    Object.defineProperty(img, 'width', { configurable: true, value: 400 })
    Object.defineProperty(img, 'height', { configurable: true, value: 300 })
    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /confirm crop/i }))
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ base64: 'CROPPED_BASE64', mimeType: 'image/jpeg' })
      )
    )
  })

  it('passes the natural-pixel crop to cropFileToBase64 (not display pixels)', async () => {
    // Image is natively 800×600, displayed at 400×300 (2× scale-down).
    // Without conversion, cropFileToBase64 would receive {0,0,400,300} and
    // crop the top-left half of the natural image. The fix scales display→
    // natural before the canvas, so it must receive {0,0,800,600}.
    const { cropFileToBase64 } = jest.requireMock('@/lib/utils/crop-image') as {
      cropFileToBase64: jest.Mock
    }
    cropFileToBase64.mockClear()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    const img = screen.getByAltText(/Image being cropped/i) as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 600 })
    Object.defineProperty(img, 'width', { configurable: true, value: 400 })
    Object.defineProperty(img, 'height', { configurable: true, value: 300 })
    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /confirm crop/i }))
    await waitFor(() => expect(cropFileToBase64).toHaveBeenCalled())
    const passedCrop = cropFileToBase64.mock.calls[0][1]
    expect(passedCrop).toMatchObject({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('calls onUseFullImage with original bytes when "Use full image" is clicked', async () => {
    const onUseFullImage = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={onUseFullImage}
        onClose={jest.fn()}
        onRemove={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /use full image/i }))
    await waitFor(() =>
      expect(onUseFullImage).toHaveBeenCalledWith(
        expect.objectContaining({ base64: 'FULL_BASE64', mimeType: 'image/jpeg' })
      )
    )
  })

  it('calls onRemove when "Remove" is clicked', () => {
    const onRemove = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={jest.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "×" close button is clicked', () => {
    const onClose = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={onClose}
        onRemove={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /close cropper/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn()
    render(
      <ImageCropper
        file={makeFile()}
        currentIndex={1}
        totalCount={1}
        onConfirm={jest.fn()}
        onUseFullImage={jest.fn()}
        onClose={onClose}
        onRemove={jest.fn()}
      />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
