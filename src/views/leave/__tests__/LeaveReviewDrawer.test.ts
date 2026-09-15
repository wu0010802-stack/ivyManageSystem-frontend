import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveReviewDrawer from '../LeaveReviewDrawer.vue'

const getLeaveQuotas = vi.fn()
vi.mock('@/api/leaves', () => ({
  getLeaveQuotas: (...a: unknown[]) => getLeaveQuotas(...a),
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const baseRow = {
  id: 1,
  employee_id: 10,
  employee_name: '林佳蓉',
  leave_type: 'annual',
  leave_type_label: '特休',
  status: 'pending',
  start_date: '2026-09-21',
  end_date: '2026-09-25',
  leave_hours: 40,
  reason: '家族旅遊',
  attachment_paths: [] as string[],
  substitute_employee_name: null,
  substitute_status: 'not_required',
  related_swap: null,
  created_at: '2026-09-12T10:30:00',
  rejection_reason: null,
}

function mountDrawer(row: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  return mount(LeaveReviewDrawer, {
    props: {
      visible: true,
      row,
      sameDayCount: 0,
      canApprove: true,
      ...extra,
    },
  })
}

describe('LeaveReviewDrawer', () => {
  beforeEach(() => {
    getLeaveQuotas.mockReset()
    getLeaveQuotas.mockResolvedValue({ data: [] })
  })

  describe('leaveNeedsAttachment 等價的 needsAttachment 邏輯', () => {
    it('待審、超過附件門檻、無附件 → true', async () => {
      const row = { ...baseRow, start_date: '2026-09-01', end_date: '2026-09-10', attachment_paths: [] }
      const w = mountDrawer(row)
      await flushPromises()
      expect(w.vm.$.setupState.needsAttachment).toBe(true)
    })

    it('已有附件 → false', async () => {
      const row = { ...baseRow, start_date: '2026-09-01', end_date: '2026-09-10', attachment_paths: ['a.jpg'] }
      const w = mountDrawer(row)
      await flushPromises()
      expect(w.vm.$.setupState.needsAttachment).toBe(false)
    })

    it('單日假單（未超過門檻）→ false', async () => {
      const row = { ...baseRow, start_date: '2026-09-01', end_date: '2026-09-01', attachment_paths: [] }
      const w = mountDrawer(row)
      await flushPromises()
      expect(w.vm.$.setupState.needsAttachment).toBe(false)
    })
  })

  describe('代理人狀態文字', () => {
    it('無代理人 → 不需代理人', async () => {
      const w = mountDrawer({ ...baseRow, substitute_employee_name: null })
      await flushPromises()
      expect(w.vm.$.setupState.substituteText).toBe('不需代理人')
      expect(w.vm.$.setupState.substituteClass).toBe('info')
    })

    it('已拒絕且假單待審 → warn 且文字帶「已拒絕」', async () => {
      const w = mountDrawer({ ...baseRow, substitute_employee_name: '劉美玲', substitute_status: 'rejected', status: 'pending' })
      await flushPromises()
      expect(w.vm.$.setupState.substituteClass).toBe('warn')
      expect(w.vm.$.setupState.substituteText).toContain('已拒絕')
    })

    it('已接受 → ok', async () => {
      const w = mountDrawer({ ...baseRow, substitute_employee_name: '劉美玲', substitute_status: 'accepted' })
      await flushPromises()
      expect(w.vm.$.setupState.substituteClass).toBe('ok')
    })
  })

  describe('配額查詢與超額判斷', () => {
    it('開啟時依 employee_id/leave_type/年份打 getLeaveQuotas', async () => {
      mountDrawer({ ...baseRow, employee_id: 10, leave_type: 'annual', start_date: '2026-09-21' })
      await flushPromises()
      expect(getLeaveQuotas).toHaveBeenCalledWith(
        expect.objectContaining({ employee_id: 10, leave_type: 'annual', year: 2026 }),
      )
    })

    it('剩餘配額不足本次時數 → quotaShort > 0 且 quotaClass 為 warn', async () => {
      getLeaveQuotas.mockResolvedValue({ data: [{ remaining_hours: 16, used_hours: 24, pending_hours: 0, total_hours: 80 }] })
      const w = mountDrawer({ ...baseRow, leave_hours: 40, status: 'pending' })
      await flushPromises()
      expect(w.vm.$.setupState.quotaShort).toBe(24)
      expect(w.vm.$.setupState.quotaClass).toBe('warn')
    })

    it('配額充足 → quotaShort 為 0 且 quotaClass 為 ok', async () => {
      getLeaveQuotas.mockResolvedValue({ data: [{ remaining_hours: 100, used_hours: 8, pending_hours: 0, total_hours: 120 }] })
      const w = mountDrawer({ ...baseRow, leave_hours: 40, status: 'pending' })
      await flushPromises()
      expect(w.vm.$.setupState.quotaShort).toBe(0)
      expect(w.vm.$.setupState.quotaClass).toBe('ok')
    })

    it('查無配額資料（如事件型假別）→ quotaClass 為 info', async () => {
      getLeaveQuotas.mockResolvedValue({ data: [] })
      const w = mountDrawer({ ...baseRow, leave_type: 'official' })
      await flushPromises()
      expect(w.vm.$.setupState.quota).toBeNull()
      expect(w.vm.$.setupState.quotaClass).toBe('info')
    })

    it('已核准的假單不比對配額超額（remaining 已反映本筆，不重複警示）', async () => {
      getLeaveQuotas.mockResolvedValue({ data: [{ remaining_hours: 0, used_hours: 40, pending_hours: 0, total_hours: 40 }] })
      const w = mountDrawer({ ...baseRow, leave_hours: 40, status: 'approved' })
      await flushPromises()
      expect(w.vm.$.setupState.quotaShort).toBe(0)
    })
  })

  describe('emit 事件轉發（不重新實作核准/駁回/編輯/紀錄邏輯）', () => {
    it('觸發 approve/reject/edit/logs/attachment 皆原樣把 row 帶出去', async () => {
      const row = { ...baseRow }
      const w = mountDrawer(row)
      await flushPromises()

      w.vm.$.setupState.emit('approve', row)
      w.vm.$.setupState.emit('reject', row)
      w.vm.$.setupState.emit('edit', row)
      w.vm.$.setupState.emit('logs', row)
      w.vm.$.setupState.emit('attachment', row)

      expect(w.emitted('approve')?.[0]).toEqual([row])
      expect(w.emitted('reject')?.[0]).toEqual([row])
      expect(w.emitted('edit')?.[0]).toEqual([row])
      expect(w.emitted('logs')?.[0]).toEqual([row])
      expect(w.emitted('attachment')?.[0]).toEqual([row])
    })
  })

  describe('row 為 null 時不查配額、不炸', () => {
    it('mount 時 row=null 不呼叫 getLeaveQuotas', async () => {
      mountDrawer(null, { visible: false })
      await flushPromises()
      expect(getLeaveQuotas).not.toHaveBeenCalled()
    })
  })
})
