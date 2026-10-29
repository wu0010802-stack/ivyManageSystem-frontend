import { describe, it, expect } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index'
import { BATCH_TABS } from '@/views/salary/batchTabs'

// 後台 IA 重整 S2（2026-10-29）：薪資設定的四個批次作業頁籤搬到 /salary/batches，
// 舊書籤 /salary/settings?tab=<key> 要落到新頁同名頁籤，其餘 query 一併帶過去。
const mkRouter = () => createRouter({ history: createMemoryHistory(), routes })

describe('/salary/settings?tab=<批次作業> → /salary/batches', () => {
  it.each(BATCH_TABS)('?tab=%s 導到 /salary/batches 同名頁籤', async (key) => {
    const router = mkRouter()
    await router.push(`/salary/settings?tab=${key}`)
    expect(router.currentRoute.value.path).toBe('/salary/batches')
    expect(router.currentRoute.value.query.tab).toBe(key)
    expect(router.currentRoute.value.name).toBe('salary-batches')
  })

  it('其餘 query 一併帶過去', async () => {
    const router = mkRouter()
    await router.push('/salary/settings?tab=festival_suspension&year=2026&month=9')
    expect(router.currentRoute.value.path).toBe('/salary/batches')
    expect(router.currentRoute.value.query).toMatchObject({ tab: 'festival_suspension', year: '2026', month: '9' })
  })

  it('留在薪資設定的頁籤與無 tab 不被導走', async () => {
    for (const q of ['', '?tab=bonus', '?tab=art_teacher', '?tab=system_settings', '?tab=logic', '?tab=unknown']) {
      const router = mkRouter()
      await router.push(`/salary/settings${q}`)
      expect(router.currentRoute.value.path, q).toBe('/salary/settings')
      expect(router.currentRoute.value.name).toBe('salary-settings')
    }
  })

  it('/salary/batches 是正式頁（有標題，可被全域搜尋掃到）；沿用 /salary prefix 的權限規則', async () => {
    const router = mkRouter()
    await router.push('/salary/batches')
    expect(router.currentRoute.value.meta.title).toBe('獎金批次作業')
  })
})
