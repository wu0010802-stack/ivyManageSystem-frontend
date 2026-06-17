import { describe, it, expect, vi, beforeEach } from 'vitest'

const { get } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} }),
}))

vi.mock('@/api', () => ({ default: { get } }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import { downloadFile } from '@/utils/download'

describe('downloadFile', () => {
  beforeEach(() => vi.clearAllMocks())
  it('帶 params 時傳給 axios get', async () => {
    get.mockResolvedValue({ data: new Blob(['x']), headers: {} })
    await downloadFile('/exports/employees', '員工名冊.xlsx', { search: '王' })
    expect(get).toHaveBeenCalledWith(
      '/exports/employees',
      expect.objectContaining({ responseType: 'blob', params: { search: '王' } }),
    )
  })
  it('未帶 params 時 params 為 undefined（向後相容）', async () => {
    get.mockResolvedValue({ data: new Blob(['x']), headers: {} })
    await downloadFile('/exports/employees')
    expect(get).toHaveBeenCalledWith(
      '/exports/employees',
      expect.objectContaining({ responseType: 'blob', params: undefined }),
    )
  })
})
