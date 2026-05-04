/**
 * @jest-environment node
 */
import { assignOrdersToClient } from '@/actions/orders'

describe('assignOrdersToClient', () => {
  it('returns { updatedCount: 0 } without touching the database when orderIds is empty', async () => {
    const result = await assignOrdersToClient([], 'any-client-id', 'any-report-id')
    expect(result).toEqual({ updatedCount: 0 })
  })
})
