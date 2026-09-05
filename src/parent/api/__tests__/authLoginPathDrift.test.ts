/**
 * 漂移守衛：`src/parent/api/index.ts` 的 `PARENT_LOGIN_PATHS`（攔截器據此把
 * 網路層失敗改報成 `login_failed`，見該檔常數上的註解）與 `src/parent/api/auth.ts`
 * 實際 POST 的路徑必須逐字一致——兩邊各自維護一份字面值，改一邊忘改另一邊，
 * 攔截器的特判就永遠打不中，登入失敗又會退回 api_timeout 重複計數。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import api, { PARENT_LOGIN_PATHS } from '../index'
import { liffLogin, deviceSetup } from '../auth'

describe('PARENT_LOGIN_PATHS 與 auth.ts 實際路徑一致', () => {
  let postSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    postSpy = vi.spyOn(api, 'post').mockResolvedValue({ data: { status: 'ok' } })
  })

  afterEach(() => {
    postSpy.mockRestore()
  })

  it('liffLogin 實際 POST 的路徑在集合內', async () => {
    await liffLogin('fake-id-token')
    expect(postSpy).toHaveBeenCalledTimes(1)
    const path = postSpy.mock.calls[0]?.[0] as string
    expect(PARENT_LOGIN_PATHS.has(path)).toBe(true)
  })

  it('deviceSetup 實際 POST 的路徑在集合內', async () => {
    await deviceSetup('ABCD1234EFGH')
    expect(postSpy).toHaveBeenCalledTimes(1)
    const path = postSpy.mock.calls[0]?.[0] as string
    expect(PARENT_LOGIN_PATHS.has(path)).toBe(true)
  })

  it('集合本身恰好只有這兩個字面值（不多不少，改動需同步這條測試）', () => {
    expect([...PARENT_LOGIN_PATHS].sort()).toEqual(
      ['/parent/auth/device-setup', '/parent/auth/liff-login'].sort(),
    )
  })
})
