import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: { get: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import api from '@/api'
import { downloadFile } from '@/utils/download'

function makeResponse(headers = {}, data = new ArrayBuffer(0)) {
  return { headers, data }
}

describe('downloadFile()', () => {
  let linkEl
  let appendSpy, removeSpy, clickSpy
  let createObjectURLSpy, revokeObjectURLSpy

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock anchor element
    clickSpy = vi.fn()
    linkEl = { href: '', download: '', click: clickSpy }
    vi.spyOn(document, 'createElement').mockReturnValue(linkEl)
    appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})

    // Mock URL
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  describe('正常下載', () => {
    it('以 blob responseType 呼叫 api.get', async () => {
      api.get.mockResolvedValue(makeResponse())

      await downloadFile('/exports/salary')

      expect(api.get).toHaveBeenCalledWith('/exports/salary', { responseType: 'blob', timeout: 30000 })
    })

    it('建立 <a> 並點擊', async () => {
      api.get.mockResolvedValue(makeResponse())

      await downloadFile('/exports/salary')

      expect(document.createElement).toHaveBeenCalledWith('a')
      expect(clickSpy).toHaveBeenCalledOnce()
    })

    it('點擊後清除 DOM 與 ObjectURL', async () => {
      api.get.mockResolvedValue(makeResponse())

      await downloadFile('/exports/salary')

      expect(removeSpy).toHaveBeenCalledOnce()
      expect(revokeObjectURLSpy).toHaveBeenCalledOnce()
    })

    it('無 Content-Disposition 時使用 fallbackName', async () => {
      api.get.mockResolvedValue(makeResponse({}))

      await downloadFile('/exports/salary', 'salary.xlsx')

      expect(linkEl.download).toBe('salary.xlsx')
    })

    it('fallbackName 預設為 "download.xlsx"', async () => {
      api.get.mockResolvedValue(makeResponse({}))

      await downloadFile('/exports/salary')

      expect(linkEl.download).toBe('download.xlsx')
    })
  })

  describe('Content-Disposition 解析', () => {
    it('解析 filename="xxx.xlsx" 格式', async () => {
      api.get.mockResolvedValue(makeResponse({
        'content-disposition': 'attachment; filename="salary_2026_03.xlsx"'
      }))

      await downloadFile('/exports/salary')

      expect(linkEl.download).toBe('salary_2026_03.xlsx')
    })

    it('解析 filename*=UTF-8\'\'xxx.xlsx 格式（URL encoded）', async () => {
      api.get.mockResolvedValue(makeResponse({
        'content-disposition': "attachment; filename*=UTF-8''%E8%96%AA%E8%B3%87%E8%A1%A8.xlsx"
      }))

      await downloadFile('/exports/salary')

      expect(linkEl.download).toBe('薪資表.xlsx')
    })

    it('UTF-8 格式優先於一般 filename 格式', async () => {
      api.get.mockResolvedValue(makeResponse({
        'content-disposition': "attachment; filename=\"fallback.xlsx\"; filename*=UTF-8''%E6%AD%A3%E7%A2%BA.xlsx"
      }))

      await downloadFile('/exports/salary')

      expect(linkEl.download).toBe('正確.xlsx')
    })
  })

  describe('錯誤處理', () => {
    it('api.get 失敗時顯示 ElMessage.error', async () => {
      api.get.mockRejectedValue(new Error('Network Error'))

      await downloadFile('/exports/salary')

      expect(ElMessage.error).toHaveBeenCalledOnce()
      const [msg] = ElMessage.error.mock.calls[0]
      expect(msg).toContain('下載失敗')
    })

    it('錯誤訊息含 error.message', async () => {
      api.get.mockRejectedValue(new Error('Timeout'))

      await downloadFile('/exports/salary')

      const [msg] = ElMessage.error.mock.calls[0]
      expect(msg).toContain('Timeout')
    })

    it('無 error.message 時顯示通用訊息', async () => {
      api.get.mockRejectedValue({})

      await downloadFile('/exports/salary')

      const [msg] = ElMessage.error.mock.calls[0]
      expect(msg).toContain('未知錯誤')
    })
  })
})
