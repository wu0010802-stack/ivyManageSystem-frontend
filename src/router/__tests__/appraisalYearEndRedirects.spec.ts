import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '@/router/index'   // 若 index.ts 尚未 export routes，本 task Step 3 加上 export

// guard 需要登入者：stub 掉 auth（redirect 解析在 guard 前，但 push 後仍會跑 guard）
vi.mock('@/utils/auth', async (orig) => ({
  ...(await orig()),
  getUserInfo: () => ({ role: 'admin', permission_names: ['*'] }),
  isAuthenticated: () => true,
  hasPermission: () => true,
  canAccessRoute: () => true,
}))

const mkRouter = () => createRouter({ history: createMemoryHistory(), routes })

// [舊 URL, 期望落地 path, 期望 query 子集]
const CASES: Array<[string, string, Record<string, string>?]> = [
  ['/appraisal-year-end', '/appraisal-year-end/overview'],
  ['/appraisal-year-end?section=appraisal', '/appraisal-year-end/appraisal/current'],
  ['/appraisal-year-end?section=appraisal&tab=history&cycle=7&view=kanban', '/appraisal-year-end/appraisal/history', { cycle: '7', view: 'kanban' }],
  ['/appraisal-year-end?section=appraisal&tab=cycles', '/appraisal-year-end/appraisal/history'],
  ['/appraisal-year-end?section=appraisal&tab=institution_events', '/appraisal-year-end/appraisal/institution-events'],
  ['/appraisal-year-end?section=appraisal&tab=settings', '/appraisal-year-end/rules/scoring'],
  ['/appraisal-year-end?section=appraisal&tab=disciplinary', '/appraisal-year-end/appraisal/disciplinary'],
  ['/appraisal-year-end?section=year-end', '/appraisal-year-end/year-end'],
  ['/appraisal-year-end?section=payout', '/appraisal-year-end/year-end/payout'],
  ['/appraisal-year-end?section=year-end-rules', '/appraisal-year-end/rules/year-end-rules'],
  ['/appraisal-year-end?section=exceptions', '/appraisal-year-end/exceptions'],
  ['/appraisal-management', '/appraisal-year-end/appraisal/current'],
  ['/appraisal/cycles', '/appraisal-year-end/appraisal/history'],
  ['/appraisal/cycles/12', '/appraisal-year-end/appraisal/history', { cycle: '12' }],
  ['/appraisal/settings', '/appraisal-year-end/rules/scoring'],
  ['/year_end/cycles', '/appraisal-year-end/year-end'],
  ['/year_end/cycles/5', '/appraisal-year-end/year-end/cycles/5'],
  // 2026-07-21 工作區 shell 合併：grid/config 巢狀路由改 redirect 帶 step，
  // 舊 legacy 頂層路徑會鏈式 redirect 兩次最終落在工作區 + ?step=
  ['/year_end/cycles/5/grid', '/appraisal-year-end/year-end/cycles/5', { step: 'grid' }],
  ['/year_end/cycles/5/config', '/appraisal-year-end/year-end/cycles/5', { step: 'config' }],
  ['/year-end/appraisal-payout?year=2026', '/appraisal-year-end/year-end/payout', { year: '2026' }],
]

describe('考核與年終 redirect 全表（含後端 exceptions deep_link 兩種格式）', () => {
  it.each(CASES)('%s → %s', async (from, toPath, query) => {
    const router = mkRouter()
    await router.push(from)
    await router.isReady()
    expect(router.currentRoute.value.path).toBe(toPath)
    if (query) expect(router.currentRoute.value.query).toMatchObject(query)
  })
})
