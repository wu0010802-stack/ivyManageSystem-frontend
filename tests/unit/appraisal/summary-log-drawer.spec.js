/**
 * P1-11：SummaryLogDrawer 台北時區 + action 色區分。
 *
 *   1. timestamp 不含 'T'（已透過 formatDateTimeTW 格式化為台北時區）
 *   2. 三個簽核 stage (主管 / 會計 / 核定) 的 el-tag type 不同
 *   3. REJECT → danger，COMMENT / RECOMPUTE → info
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { getSummaryLogsMock, elMessage } = vi.hoisted(() => ({
  getSummaryLogsMock: vi.fn(),
  elMessage: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

vi.mock('element-plus', () => ({ ElMessage: elMessage }))
vi.mock('@/api/appraisal', () => ({
  getSummaryLogs: getSummaryLogsMock,
}))
vi.mock('@/utils/error', () => ({ apiError: (e, f) => f || 'err' }))

import SummaryLogDrawer from '@/views/appraisal/components/SummaryLogDrawer.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const stubs = {
  'el-drawer': transparentStub(),
  'el-timeline': transparentStub(),
  'el-timeline-item': {
    props: ['timestamp', 'type'],
    inheritAttrs: false,
    template: `<div
      :data-test="$attrs['data-test']"
      :data-timestamp="timestamp"
      :data-timeline-type="type"
    ><slot /></div>`,
  },
  'el-tag': {
    props: ['type'],
    inheritAttrs: false,
    template: `<span
      :data-test="$attrs['data-test']"
      :data-tag-type="type"
    ><slot /></span>`,
  },
  'el-empty': transparentStub(),
}

const sampleLogs = [
  {
    id: 1,
    action: 'SIGN_SUPERVISOR',
    created_at: '2026-05-18T02:34:56Z', // UTC, 台北為 10:34
    actor_id: 100,
    actor_name: 'alice',
    from_status: 'DRAFT',
    to_status: 'SUPERVISOR_SIGNED',
  },
  {
    id: 2,
    action: 'SIGN_ACCOUNTING',
    created_at: '2026-05-18T03:00:00Z',
    actor_id: 101,
  },
  {
    id: 3,
    action: 'FINALIZE',
    created_at: '2026-05-18T04:00:00Z',
    actor_id: 102,
  },
  {
    id: 4,
    action: 'REJECT',
    created_at: '2026-05-18T05:00:00Z',
    actor_id: 103,
    reason: '資料有誤',
  },
  {
    id: 5,
    action: 'COMMENT',
    created_at: '2026-05-18T06:00:00Z',
    actor_id: 104,
    comment: 'OK',
  },
]

async function mountDrawer() {
  getSummaryLogsMock.mockResolvedValue({ data: sampleLogs })
  const w = mount(SummaryLogDrawer, {
    props: { visible: true, summaryId: 99 },
    global: { stubs },
  })
  // wait for async load
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
  return w
}

describe('P1-11 SummaryLogDrawer 台北時區 + action 色區分', () => {
  beforeEach(() => {
    getSummaryLogsMock.mockReset()
  })

  it('timestamp 經 formatDateTimeTW 格式化，不含原始 ISO 的 T', async () => {
    const w = await mountDrawer()
    const items = w.findAll('[data-test^="log-item-"]')
    expect(items.length).toBe(5)
    items.forEach((it) => {
      const ts = it.attributes('data-timestamp')
      expect(ts).toBeTruthy()
      expect(ts).not.toContain('T')
      expect(ts).not.toContain('Z')
    })
  })

  it('三個簽核 stage 與其他 action 的 el-tag type 區分明確', async () => {
    const w = await mountDrawer()
    const tagType = (id) =>
      w.find(`[data-test="log-action-tag-${id}"]`).attributes('data-tag-type')

    expect(tagType(1)).toBe('primary')  // SIGN_SUPERVISOR
    expect(tagType(2)).toBe('warning')  // SIGN_ACCOUNTING
    expect(tagType(3)).toBe('success')  // FINALIZE
    expect(tagType(4)).toBe('danger')   // REJECT
    expect(tagType(5)).toBe('info')     // COMMENT

    // 三個 sign type 互不相同
    expect(new Set([tagType(1), tagType(2), tagType(3)]).size).toBe(3)
  })
})
