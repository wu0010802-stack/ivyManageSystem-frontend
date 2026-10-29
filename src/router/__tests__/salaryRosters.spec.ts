import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index'

// 後台 IA 重整 W1（2026-10-29）：/salary/rosters 轉帳名冊集中頁是正式頁（有標題，可被全域搜尋掃到）；
// 權限沿用 manifest 的 /salary prefix（SALARY_READ），不新增規則。
describe('/salary/rosters', () => {
  it('是正式頁，標題為轉帳名冊', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/salary/rosters')
    expect(router.currentRoute.value.path).toBe('/salary/rosters')
    expect(router.currentRoute.value.name).toBe('salary-rosters')
    expect(router.currentRoute.value.meta.title).toBe('轉帳名冊')
  })
})
