/**
 * P1-8：FINALIZED 卡片隱藏簽核 dropdown，避免 silent no-op。
 *
 * CycleDetailView.onKanbanAction 的 stage map 只涵蓋 DRAFT /
 * SUPERVISOR_SIGNED / ACCOUNTING_SIGNED。狀態為 FINALIZED 時若使用者
 * 點「簽核」，stage 取不到 → 整個 action handler 靜默 no-op。
 * 解：SummaryCard 內判斷 status==='FINALIZED' 時不 render 簽核項。
 * 退簽（REJECT）option 保留，因 FINALIZED → ACCOUNTING_SIGNED 允許。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

import SummaryCard from '@/views/appraisal/components/SummaryCard.vue'

const transparentStub = (slotsToRender = ['default']) => ({
  template: `<div>${slotsToRender.map((s) => `<slot name="${s}" />`).join('')}</div>`,
})

const stubs = {
  'el-checkbox': transparentStub(),
  'el-dropdown': transparentStub(['default', 'dropdown']),
  'el-dropdown-menu': transparentStub(),
  'el-dropdown-item': transparentStub(),
  'el-icon': transparentStub(),
  'el-tag': transparentStub(),
}

function mountWithStatus(status) {
  return mount(SummaryCard, {
    props: {
      summary: {
        id: 1,
        employee_name: '張三',
        total_score: '85',
        grade: 'GOOD',
        bonus_amount: '0',
        status,
      },
      selected: false,
      showMenu: true,
    },
    global: { stubs },
  })
}

describe('P1-8 SummaryCard FINALIZED 卡片隱藏簽核 dropdown', () => {
  it('status=FINALIZED 時 簽核 dropdown-item 不 render', () => {
    const w = mountWithStatus('FINALIZED')
    expect(w.find('[data-test="dropdown-item-sign"]').exists()).toBe(false)
  })

  it('status=FINALIZED 時 退簽 dropdown-item 仍 render', () => {
    const w = mountWithStatus('FINALIZED')
    expect(w.find('[data-test="dropdown-item-reject"]').exists()).toBe(true)
  })

  it('status=DRAFT 時 簽核 dropdown-item 正常 render', () => {
    const w = mountWithStatus('DRAFT')
    expect(w.find('[data-test="dropdown-item-sign"]').exists()).toBe(true)
  })

  it('status=ACCOUNTING_SIGNED 時 簽核 dropdown-item 正常 render', () => {
    const w = mountWithStatus('ACCOUNTING_SIGNED')
    expect(w.find('[data-test="dropdown-item-sign"]').exists()).toBe(true)
  })
})
