import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDataExport } from '../useDataExport'

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }))

vi.mock('@/parent/api', () => ({
  default: { get: mockGet },
}))

describe('useDataExport', () => {
  beforeEach(() => {
    mockGet.mockReset()
    ;(global as unknown as Record<string, unknown>).URL = {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    }
    // Stub document.body.appendChild/removeChild/createElement
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = { tagName: tag.toUpperCase(), href: '', download: '', click: vi.fn() }
      return el as unknown as HTMLElement
    })
  })

  it('downloads blob and triggers anchor click', async () => {
    mockGet.mockResolvedValue({
      data: new Blob(['{"a":1}'], { type: 'application/json' }),
      headers: {
        'content-disposition': 'attachment; filename="ivy_data_export_42_20260522.json"',
      },
    })

    const { downloading, downloadExport } = useDataExport()
    expect(downloading.value).toBe(false)
    const result = await downloadExport()
    expect(result).toEqual({ ok: true })
    expect(mockGet).toHaveBeenCalledWith('/parent/me/data-export', { responseType: 'blob' })
    expect((global as unknown as { URL: { createObjectURL: ReturnType<typeof vi.fn> } }).URL.createObjectURL).toHaveBeenCalled()
    expect(downloading.value).toBe(false)
  })

  it('returns rate_limited reason on 429', async () => {
    mockGet.mockRejectedValue({ response: { status: 429 } })
    const { downloadExport } = useDataExport()
    const result = await downloadExport()
    expect(result).toEqual({ ok: false, reason: 'rate_limited' })
  })

  it('returns too_large reason on 413', async () => {
    mockGet.mockRejectedValue({ response: { status: 413 } })
    const { downloadExport } = useDataExport()
    const result = await downloadExport()
    expect(result).toEqual({ ok: false, reason: 'too_large' })
  })

  it('rethrows other errors', async () => {
    mockGet.mockRejectedValue({ response: { status: 500 } })
    const { downloadExport } = useDataExport()
    await expect(downloadExport()).rejects.toBeTruthy()
  })
})
