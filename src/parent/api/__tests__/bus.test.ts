import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../index', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: 'http://test/api' },
  },
}))

import api from '../index'
import * as bus from '../bus'

describe('parent bus API wrapper', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getBusToday 呼叫正確路徑', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} })
    await bus.getBusToday()
    expect(api.get).toHaveBeenCalledWith('/parent/bus/today')
  })

  it('getRideCancellations 省略 date 時不送 params', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { date: '', children: [] } })
    await bus.getRideCancellations()
    expect(api.get).toHaveBeenCalledWith('/parent/bus/ride-cancellations', {
      params: undefined,
    })
  })

  it('getRideCancellations 帶 date 時送 query', async () => {
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { date: '', children: [] } })
    await bus.getRideCancellations('2026-08-27')
    expect(api.get).toHaveBeenCalledWith('/parent/bus/ride-cancellations', {
      params: { date: '2026-08-27' },
    })
  })

  it('createRideCancellation「整天」是單一 request 帶兩個 direction', async () => {
    // 契約重點（後端 RideCancellationCreateIn 註解明文）：不是打兩次 HTTP。
    // 這條測試存在的目的就是釘住這點——tasks.json 的舊描述寫成「拆兩筆分別
    // 送出」，照抄會做出錯誤的呼叫形狀。
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { results: [] } })
    await bus.createRideCancellation({
      student_id: 3,
      date: '2026-08-26',
      directions: ['morning', 'afternoon'],
    })
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/parent/bus/ride-cancellations', {
      student_id: 3,
      date: '2026-08-26',
      directions: ['morning', 'afternoon'],
    })
  })

  it('revokeRideCancellation 帶 id', async () => {
    ;(api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } })
    await bus.revokeRideCancellation(12)
    expect(api.post).toHaveBeenCalledWith('/parent/bus/ride-cancellations/12/revoke')
  })
})
