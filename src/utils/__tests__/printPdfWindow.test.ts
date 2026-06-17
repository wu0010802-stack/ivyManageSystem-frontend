import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openPdfInNewTab } from '@/utils/printPdfWindow'

// 用 DOMParser 模擬新分頁的 document：document.write 後的 HTML 解析成可檢視的 DOM，
// 讓我們能斷言 loadingText 是否被當成 HTML 解析（XSS sink）。
function makeFakeWin() {
  let parsed: Document | null = null
  let buffer = ''
  const fakeDocument = {
    write(html: string) {
      buffer += html
      parsed = new DOMParser().parseFromString(buffer, 'text/html')
    },
    getElementById(id: string) {
      return parsed ? parsed.getElementById(id) : null
    },
    get body() {
      return parsed ? parsed.body : null
    },
  }
  return {
    document: fakeDocument,
    location: { replace: vi.fn() },
    addEventListener: vi.fn(),
    _getParsed: () => parsed,
  }
}

describe('openPdfInNewTab：loadingText 不被當 HTML 解析（XSS sink 防護）', () => {
  let fakeWin: ReturnType<typeof makeFakeWin>

  beforeEach(() => {
    fakeWin = makeFakeWin()
    window.open = vi.fn(() => fakeWin as unknown as Window)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('惡意 loadingText 以純文字（textContent）呈現，不會產生可執行節點', async () => {
    const payload = '<img src=x onerror="alert(1)">'
    await openPdfInNewTab({
      fetchBlob: async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      loadingText: payload,
    })
    const parsed = fakeWin._getParsed()!
    // 不應被解析成 <img> 元素
    expect(parsed.querySelector('img')).toBeNull()
    // loadingText 應原樣以文字呈現
    expect(parsed.getElementById('ivy-pdf-loading-text')?.textContent).toBe(payload)
  })

  it('預設 loadingText 正常顯示', async () => {
    await openPdfInNewTab({
      fetchBlob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    })
    const parsed = fakeWin._getParsed()!
    expect(parsed.getElementById('ivy-pdf-loading-text')?.textContent).toBe('PDF 載入中…')
  })

  it('window.open 回 null（被 popup blocker 擋）時走 onError 並回 null', async () => {
    window.open = vi.fn(() => null)
    const onError = vi.fn()
    const result = await openPdfInNewTab({ fetchBlob: async () => new Blob(), onError })
    expect(result).toBeNull()
    expect(onError).toHaveBeenCalled()
  })
})
