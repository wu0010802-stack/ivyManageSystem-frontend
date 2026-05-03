import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

vi.mock('@/api/portal', () => ({
  getPortalStudentDetail: vi.fn(),
  revealPortalStudentPhone: vi.fn(),
}))

vi.mock('element-plus', () => {
  const passthrough = (name) =>
    defineComponent({
      name,
      setup(_, { slots }) {
        return () => h('div', { class: name }, slots.default?.())
      },
    })
  return {
    ElDrawer: defineComponent({
      name: 'ElDrawer',
      props: ['modelValue', 'size', 'withHeader', 'destroyOnClose'],
      setup(_, { slots }) {
        return () => h('div', { class: 'el-drawer' }, slots.default?.())
      },
    }),
    ElTabs: passthrough('el-tabs'),
    ElTabPane: passthrough('el-tab-pane'),
    ElTag: passthrough('el-tag'),
    ElEmpty: defineComponent({
      name: 'ElEmpty',
      props: ['description', 'imageSize'],
      render() {
        return h('div', { class: 'el-empty' }, this.description)
      },
    }),
    ElIcon: passthrough('el-icon'),
    ElMessage: { error: vi.fn() },
  }
})

vi.mock('@element-plus/icons-vue', () => ({
  View: { name: 'View', render: () => h('span') },
  Hide: { name: 'Hide', render: () => h('span') },
}))

vi.mock('@/utils/error', () => ({
  apiError: (e, fallback) => fallback,
}))

import {
  getPortalStudentDetail,
  revealPortalStudentPhone,
} from '@/api/portal'
import PortalStudentDrawer from '@/components/portal/students/PortalStudentDrawer.vue'

const SAMPLE = {
  student: {
    id: 1,
    student_id: 'S001',
    name: '小明',
    gender: 'M',
    birthday: '2020-05-05',
    enrollment_date: '2024-09-01',
    lifecycle_status: 'active',
    parent_name: '王媽',
    parent_phone_masked: '0912-***-678',
    emergency_contact_name: '緊急阿姨',
    emergency_contact_relation: '阿姨',
    emergency_contact_phone_masked: '0223-***-789',
  },
  classroom: { id: 1, name: 'A班', viewer_role: '主教老師' },
  guardians: [
    {
      id: 10,
      name: '王媽',
      phone_masked: '0911-***-333',
      relation: '母親',
      is_primary: true,
      can_pickup: true,
      is_emergency: false,
    },
  ],
  health: { allergies: [], recent_medication_orders: [] },
  attendance_30d: { summary: { present: 18, absent: 2, late: 1, leave: 1 } },
  attendance_this_month: { rate: 95.5, last_absent_date: '2026-05-01' },
  transfer_history: [],
}

describe('PortalStudentDrawer', () => {
  beforeEach(() => {
    getPortalStudentDetail.mockReset()
    revealPortalStudentPhone.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function mountWithStudent(studentId = 1) {
    getPortalStudentDetail.mockResolvedValue({ data: SAMPLE })
    const wrapper = mount(PortalStudentDrawer, {
      props: { modelValue: true, studentId },
    })
    // wait for watcher async
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()
    return wrapper
  }

  it('開啟時呼叫 loadDetail 並渲染 masked phone', async () => {
    const wrapper = await mountWithStudent()
    expect(getPortalStudentDetail).toHaveBeenCalledWith(1)
    const text = wrapper.text()
    expect(text).toContain('小明')
    expect(text).toContain('0912-***-678') // parent
    expect(text).toContain('0911-***-333') // guardian
    expect(text).toContain('0223-***-789') // emergency
    // 不洩漏地址
    expect(text).not.toContain('信義區')
  })

  it('點 reveal-btn 呼叫 API 並切到完整號碼', async () => {
    revealPortalStudentPhone.mockResolvedValue({
      data: { phone: '0912345678' },
    })
    const wrapper = await mountWithStudent()

    // 找 parent 的 reveal 按鈕（第一個 reveal-btn 是 parent）
    const buttons = wrapper.findAll('button.reveal-btn')
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[0].trigger('click')
    await nextTick()

    expect(revealPortalStudentPhone).toHaveBeenCalledWith(1, {
      target: 'parent',
      guardian_id: null,
    })
    expect(wrapper.text()).toContain('0912345678')
  })

  it('關閉抽屜時 reset detail 與已揭露電話', async () => {
    revealPortalStudentPhone.mockResolvedValue({
      data: { phone: '0912345678' },
    })
    const wrapper = await mountWithStudent()
    const buttons = wrapper.findAll('button.reveal-btn')
    await buttons[0].trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('0912345678')

    await wrapper.setProps({ modelValue: false })
    await nextTick()
    await wrapper.setProps({ modelValue: true, studentId: 1 })
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    // 重新開啟 → 第二次 loadDetail，揭露狀態應已清空（仍是 masked）
    expect(wrapper.text()).toContain('0912-***-678')
    expect(wrapper.text()).not.toContain('0912345678')
  })
})
