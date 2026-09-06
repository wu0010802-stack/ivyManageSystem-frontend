import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn().mockResolvedValue({
    data: [{ id: 1, name: '小班-甲', class_code: 'A' }],
  }),
}))

import TransitionConfirmDialog from '../TransitionConfirmDialog.vue'

describe('TransitionConfirmDialog modes', () => {
  it('dropdown mode (deposited→enrolled): shows classroom select', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'deposited', toStage: 'enrolled',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick(); await nextTick()
    expect(wrapper.text()).toContain('班別')
    expect(wrapper.find('.classroom-select').exists()).toBe(true)
  })

  it('destructive mode: shows reason textarea + warning', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'enrolled', toStage: 'deposited',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.text()).toContain('原因')
    expect(wrapper.find('.transition-warning').exists()).toBe(true)
  })

  it('plain mode: just confirm/cancel', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'visited', toStage: 'deposited',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.find('.classroom-select').exists()).toBe(false)
    expect(wrapper.find('.reason-input').exists()).toBe(false)
  })

  it('destructive rejects empty reason on confirm', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'enrolled', toStage: 'deposited',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.find('.confirm-btn').trigger('click')
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('emits confirm with classroomId in dropdown mode', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'deposited', toStage: 'enrolled',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick(); await nextTick()
    ;(wrapper.vm as unknown as { selectedClassroomId: number }).selectedClassroomId = 1
    await nextTick()
    await wrapper.find('.confirm-btn').trigger('click')
    expect(wrapper.emitted('confirm')?.[0][0]).toMatchObject({ classroomId: 1 })
  })

  it('emits cancel on cancel button', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'visited', toStage: 'deposited',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    await wrapper.find('.cancel-btn').trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('enrolled→withdrawn: destructive mode with 刪除學生檔案 warning', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'enrolled', toStage: 'withdrawn',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.find('.transition-warning').exists()).toBe(true)
    expect(wrapper.text()).toContain('將刪除學生檔案（含家長聯絡資料），招生紀錄保留')
    expect(wrapper.text()).toContain('原因')
  })

  it('deposited→withdrawn: destructive mode with 標記退預繳 warning', async () => {
    const wrapper = mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: 'deposited', toStage: 'withdrawn',
        visitId: 1, childName: '王小寶',
      },
      attachTo: document.body,
    })
    await nextTick()
    expect(wrapper.find('.transition-warning').exists()).toBe(true)
    expect(wrapper.text()).toContain('將標記退預繳')
    expect(wrapper.text()).toContain('學費管理')
  })
})

/**
 * 2026-09-06 招生流程審查：原本只有「選班別」與「進退出欄」會攔下來確認，
 * 其餘直接送出——拖曳填不到收預繳人員，拖出退出欄更是一聲不響。
 */
describe('TransitionConfirmDialog 新增的確認模式', () => {
  const mountAt = (fromStage: string, toStage: string) =>
    mount(TransitionConfirmDialog, {
      props: {
        modelValue: true,
        fromStage: fromStage as never,
        toStage: toStage as never,
        visitId: 7,
        childName: '王小寶',
      },
      attachTo: document.body,
    })

  it('visited→deposited：可填收預繳人員，並提醒實際收款在學費管理', async () => {
    const wrapper = mountAt('visited', 'deposited')
    await nextTick()

    expect(wrapper.find('[data-test="deposit-collector-input"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('學費管理')
    expect(wrapper.text()).toContain('收預繳人員')
  })

  it('visited→deposited：收預繳人員選填，不填也能確認', async () => {
    const wrapper = mountAt('visited', 'deposited')
    await nextTick()

    await wrapper.find('.confirm-btn').trigger('click')

    expect(wrapper.emitted('confirm')).toBeTruthy()
    expect(wrapper.emitted('confirm')![0][0]).toMatchObject({ depositCollector: undefined })
  })

  it('visited→deposited：填了就帶進 payload（去頭尾空白）', async () => {
    const wrapper = mountAt('visited', 'deposited')
    await nextTick()

    // el-input 把 data-test 透傳到 input 本身（不是外層 div），故不加子選擇器
    await wrapper.find('[data-test="deposit-collector-input"]').setValue('  王小美  ')
    await wrapper.find('.confirm-btn').trigger('click')

    expect(wrapper.emitted('confirm')![0][0]).toMatchObject({ depositCollector: '王小美' })
  })

  it('withdrawn→deposited：離開退出欄也要確認（與進欄對稱）', async () => {
    const wrapper = mountAt('withdrawn', 'deposited')
    await nextTick()

    expect(wrapper.find('.transition-warning').exists()).toBe(true)
    expect(wrapper.text()).toContain('取消這筆退預繳／退註冊的標記')
    // 不是 destructive，不需要填原因
    expect(wrapper.text()).not.toContain('原因（必填）')
  })

  it('deposited→visited：取消預繳有說明', async () => {
    const wrapper = mountAt('deposited', 'visited')
    await nextTick()

    expect(wrapper.text()).toContain('將取消預繳標記')
  })

  it('deposited→withdrawn：警示點出退款要另外處理', async () => {
    const wrapper = mountAt('deposited', 'withdrawn')
    await nextTick()

    expect(wrapper.text()).toContain('學費管理')
  })
})
