import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { applyDedupe, clearDedupe } from '@/utils/apiDedupe'

describe('apiDedupe session isolation', () => {
  it('clear 後同 key 會建立新請求，舊 promise 完成也不會刪掉新身分 inflight', async () => {
    const pending = []
    const adapter = vi.fn((config) => new Promise((resolve) => {
      pending.push({ config, resolve })
    }))
    const instance = axios.create({ adapter })
    applyDedupe(instance)

    const oldRequest = instance.get('/parent/me')
    const oldDuplicate = instance.get('/parent/me')
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(1))
    expect(oldDuplicate).toBe(oldRequest)

    clearDedupe(instance)
    const currentRequest = instance.get('/parent/me')
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(2))
    expect(currentRequest).not.toBe(oldRequest)

    pending[0].resolve({
      data: { owner: 'A' }, status: 200, statusText: 'OK', headers: {}, config: pending[0].config,
    })
    await oldRequest

    const currentDuplicate = instance.get('/parent/me')
    expect(currentDuplicate).toBe(currentRequest)
    expect(adapter).toHaveBeenCalledTimes(2)

    pending[1].resolve({
      data: { owner: 'B' }, status: 200, statusText: 'OK', headers: {}, config: pending[1].config,
    })
    await expect(currentDuplicate).resolves.toMatchObject({ data: { owner: 'B' } })
  })
})
