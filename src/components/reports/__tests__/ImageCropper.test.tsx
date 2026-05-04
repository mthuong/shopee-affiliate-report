import { render, screen, fireEvent } from '@testing-library/react'
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

// Mock the canvas helper so confirm doesn't depend on canvas APIs.
jest.mock('@/lib/utils/crop-image', () => ({
  __esModule: true,
  cropFileToBase64: jest.fn(async () => ({
    base64: 'CROPPED_BASE64',
    mimeType: 'image/jpeg',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
  })),
  readFileAsCropped: jest.fn(async () => ({
    base64: 'FULL_BASE64',
    mimeType: 'image/jpeg',
  })),
}))

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
    // jsdom also reports naturalWidth/Height as 0; stub them so the min-size
    // guard in handleConfirm doesn't reject the crop.
    const img = screen.getByAltText(/Image being cropped/i) as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 600 })
    fireEvent.load(img)
    fireEvent.click(screen.getByRole('button', { name: /confirm crop/i }))
    // Wait a microtask for the async helper to resolve.
    await Promise.resolve()
    await Promise.resolve()
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'CROPPED_BASE64', mimeType: 'image/jpeg' })
    )
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
    await Promise.resolve()
    await Promise.resolve()
    expect(onUseFullImage).toHaveBeenCalledWith(
      expect.objectContaining({ base64: 'FULL_BASE64', mimeType: 'image/jpeg' })
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
