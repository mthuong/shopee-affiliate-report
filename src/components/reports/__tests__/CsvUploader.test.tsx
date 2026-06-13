import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CsvUploader } from '../CsvUploader'

jest.mock('@/lib/csv/parse-affiliate-csv', () => ({
  __esModule: true,
  parseAffiliateCsv: jest.fn(),
}))

import { parseAffiliateCsv } from '@/lib/csv/parse-affiliate-csv'
const mockParse = parseAffiliateCsv as jest.Mock

// jsdom's File has no arrayBuffer() — polyfill it for the component under test.
beforeAll(() => {
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function () {
      return Promise.resolve(new ArrayBuffer(0))
    }
  }
})

beforeEach(() => {
  mockParse.mockReset()
})

function selectFile() {
  const input = screen.getByTestId('csv-input') as HTMLInputElement
  const file = new File(['dummy'], 'report.csv', { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('CsvUploader', () => {
  it('calls onParsed with parsed orders and shows a success message', async () => {
    const orders = [
      { order_id: 'A', product_name: 'X', status_name: 'Đã hoàn thành', commission_vnd: 100, ordered_at: '2026-05-01T10:00:00' },
    ]
    mockParse.mockReturnValue(orders)
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() => expect(onParsed).toHaveBeenCalledWith(orders))
    expect(screen.getByText(/Parsed 1 order from report\.csv/)).toBeInTheDocument()
  })

  it('shows "No orders found" when the parser returns an empty array', async () => {
    mockParse.mockReturnValue([])
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() => expect(onParsed).toHaveBeenCalledWith([]))
    expect(screen.getByText(/No orders found/)).toBeInTheDocument()
  })

  it('shows an error message and does not call onParsed when parsing throws', async () => {
    mockParse.mockImplementation(() => {
      throw new Error("This doesn't look like a Shopee affiliate commission CSV.")
    })
    const onParsed = jest.fn()
    render(<CsvUploader onParsed={onParsed} />)

    selectFile()

    await waitFor(() =>
      expect(screen.getByText(/doesn't look like a Shopee affiliate commission CSV/)).toBeInTheDocument(),
    )
    expect(onParsed).not.toHaveBeenCalled()
  })
})
