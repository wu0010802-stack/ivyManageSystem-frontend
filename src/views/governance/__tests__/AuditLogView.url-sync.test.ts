import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

const { getAuditLogs, getAuditLogsMeta, exportAuditLogs } = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  getAuditLogsMeta: vi.fn(),
  exportAuditLogs: vi.fn(),
}))
vi.mock('@/api/audit', () => ({ getAuditLogs, getAuditLogsMeta, exportAuditLogs }))

import AuditLogView from '../AuditLogView.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const makeRouter = (): Router =>
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/audit-logs', component: AuditLogView }, { path: '/', redirect: '/audit-logs' }],
  })

const mountWithQuery = async (query: Record<string, string>) => {
  const router = makeRouter()
  await router.push({ path: '/audit-logs', query })
  await router.isReady()
  const wrapper = mount(AuditLogView, {
    global: {
      plugins: [ElementPlus, router],
      stubs: {
        'el-table': {
          props: ['data'],
          template: '<div data-test="audit-rows">{{ data.map((row) => row.username).join(",") }}</div>',
        },
        'el-table-column': true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('AuditLogView 篩選同步 URL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAuditLogsMeta.mockResolvedValue({ data: { entity_types: [], actions: [], field_labels: {} } })
    getAuditLogs.mockResolvedValue({ data: { items: [], total: 0 } })
  })

  it('掛載時從 URL query 還原篩選並用其查詢', async () => {
    await mountWithQuery({ entity_type: 'fee', risk_tag: 'refund', risk: 'refund', username: 'alice' })
    const params = getAuditLogs.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(params.entity_type).toBe('fee')
    expect(params.risk_tag).toBe('refund')
    expect(params.username).toBe('alice')
  })

  it('查詢後把非空篩選寫回 URL query', async () => {
    const { wrapper, router } = await mountWithQuery({})
    const input = wrapper.find('input[placeholder="使用者名稱"]')
    await input.setValue('bob')
    const searchBtn = wrapper.findAll('button').find((b) => b.text().includes('查詢'))
    await searchBtn!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.username).toBe('bob')
    expect(router.currentRoute.value.query.entity_type).toBeUndefined()
  })

  it('快篩狀態（risk key）寫入 URL 且可還原按鈕高亮', async () => {
    const { wrapper } = await mountWithQuery({ risk_tag: 'large_amount', risk: 'large_amount' })
    const btn = wrapper.findAll('button').find((b) => b.text() === '大額金流')
    expect(btn!.classes()).toContain('el-button--primary')
  })

  it('連續查詢時只顯示最新條件的結果，忽略較晚完成的舊請求', async () => {
    const { wrapper, router } = await mountWithQuery({})
    const requestA = deferred<{ data: { items: Array<Record<string, unknown>>; total: number } }>()
    const requestB = deferred<{ data: { items: Array<Record<string, unknown>>; total: number } }>()
    getAuditLogs
      .mockImplementationOnce(() => requestA.promise)
      .mockImplementationOnce(() => requestB.promise)
    const input = wrapper.find('input[placeholder="使用者名稱"]')
    const search = wrapper.findAll('button').find((b) => b.text().includes('查詢'))!

    await input.setValue('alice')
    await search.trigger('click')
    await input.setValue('bob')
    await search.trigger('click')

    requestB.resolve({ data: { items: [{ id: 2, username: '最新 bob' }], total: 1 } })
    await flushPromises()
    requestA.resolve({ data: { items: [{ id: 1, username: '過期 alice' }], total: 1 } })
    await flushPromises()

    expect(wrapper.get('[data-test="audit-rows"]').text()).toBe('最新 bob')
    expect(router.currentRoute.value.query.username).toBe('bob')
  })
})
