/**
 * 共享裝置殘留（bug-hunt 2026-06-25，P3）：clearAuth 應重置 Pinia stores。
 *
 * 問題：clearAuth 清除 userInfo/localStorage/sessionStorage/離線佇列/Portal SW caches，
 * 但未重置任何 Pinia store。登出/登入皆 router.push 不 reload，故 keyed-fetch entries
 * （TTL 數分鐘）、notification.summary 等業務快取跨 session 殘留 —— 同一分頁前一位 admin
 * 登出、後一位登入，TTL/stale 窗內進入頁面第一個 render tick（refetch 前）可短暫看到
 * 前一位的快取資料。
 *
 * 修法：clearAuth 內對所有已實例化的 option store 呼叫 $reset()，清空快取 state。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia, defineStore } from 'pinia'

import { clearAuth } from '@/utils/auth'
import { advanceAdminSession } from '@/utils/adminSession'

describe('clearAuth 重置 Pinia stores（共享裝置殘留）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('登出時重置已實例化 option-store 的 state', () => {
    const useBiz = defineStore('biz_residual_test', {
      state: () => ({ cachedName: '' as string }),
      actions: {
        setName(v: string) {
          this.cachedName = v
        },
      },
    })
    const store = useBiz()
    store.setName('前一位 admin 的學生姓名')
    expect(store.cachedName).toBe('前一位 admin 的學生姓名')

    clearAuth({ notifyServer: false })

    // $reset 後回到 state() 預設值，避免下一位登入者短暫看到殘留。
    expect(store.cachedName).toBe('')
  })

  it('多個 store 一併重置', () => {
    const useA = defineStore('residual_a', {
      state: () => ({ v: 0 }),
      actions: {
        bump() {
          this.v = 99
        },
      },
    })
    const useB = defineStore('residual_b', {
      state: () => ({ list: [] as string[] }),
      actions: {
        fill() {
          this.list = ['a', 'b']
        },
      },
    })
    const a = useA()
    const b = useB()
    a.bump()
    b.fill()

    clearAuth({ notifyServer: false })

    expect(a.v).toBe(0)
    expect(b.list).toEqual([])
  })

  it('登出時清除可能含員工薪資的試算快取', async () => {
    sessionStorage.setItem('salary_simulate_last_v2', '{"employee":"前一位員工"}')
    sessionStorage.setItem('salary_simulate_cache_v2', '{"salary":42000}')

    await clearAuth({ notifyServer: false })

    expect(sessionStorage.getItem('salary_simulate_last_v2')).toBeNull()
    expect(sessionStorage.getItem('salary_simulate_cache_v2')).toBeNull()
  })

  it('代操作或重新登入造成管理端身分切換時也清除薪資試算快取', () => {
    sessionStorage.setItem('salary_simulate_last_v2', '{"employee":"舊身分員工"}')
    sessionStorage.setItem('salary_simulate_cache_v2', '{"salary":39000}')

    advanceAdminSession()

    expect(sessionStorage.getItem('salary_simulate_last_v2')).toBeNull()
    expect(sessionStorage.getItem('salary_simulate_cache_v2')).toBeNull()
  })
})
