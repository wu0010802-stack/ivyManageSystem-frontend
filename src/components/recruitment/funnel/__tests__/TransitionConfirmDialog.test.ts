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
    expect(wrapper.find('.destructive-warning').exists()).toBe(true)
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
    expect(wrapper.find('.destructive-warning').exists()).toBe(true)
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
    expect(wrapper.find('.destructive-warning').exists()).toBe(true)
    expect(wrapper.text()).toContain('將標記退預繳（取消預繳訂金）')
  })
})
