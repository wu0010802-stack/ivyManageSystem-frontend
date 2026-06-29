import { describe, it, expect, vi, beforeEach } from 'vitest'

const { get } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} }),
}))

vi.mock('@/api', () => ({ default: { get } }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import { downloadFile } from '@/utils/download'
import { ElMessage } from 'element-plus'

describe('downloadFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('下載失敗時優先顯示 interceptor 正規化的 displayMessage（真實原因，非通用「下載失敗」）', async () => {
    const err = Object.assign(new Error('Request failed with status code 409'), {
      displayMessage: '本月薪資尚未封存',
    })
    get.mockRejectedValueOnce(err)
    await downloadFile('/exports/salary')
    expect(ElMessage.error).toHaveBeenCalledWith('本月薪資尚未封存')
  })
  it('下載成功回傳 true（呼叫端可據此判定成敗）', async () => {
    get.mockResolvedValueOnce({ data: new Blob(['x']), headers: {} })
    expect(await downloadFile('/exports/salary')).toBe(true)
  })
  it('下載失敗回傳 false（呼叫端不可誤判為成功）', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('boom'), { displayMessage: '本月薪資尚未封存' }))
    expect(await downloadFile('/exports/salary')).toBe(false)
  })
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
