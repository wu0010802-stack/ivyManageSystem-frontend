import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DismissalPosStudentCard from '../DismissalPosStudentCard.vue'

const STUDENT = { id: 1, name: '王小明' }

describe('DismissalPosStudentCard', () => {
  it('status=unpicked 時卡片可點擊並 emit quick-dispatch(student)', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await w.find('.pos-student-card').trigger('click')
    expect(w.emitted('quick-dispatch')).toEqual([[STUDENT]])
    expect(w.find('.pos-student-card').classes()).not.toContain('is-resolved')
  })

  it('status=guardian_picked 時卡片視覺降階（淡灰）但仍可點擊再次通知', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'guardian_picked' },
    })
    expect(w.find('.pos-student-card').classes()).toContain('is-resolved')
    expect(w.find('.pos-student-card').classes()).toContain('is-redispatchable')
    expect(w.find('.pos-student-card__status--picked').exists()).toBe(true)
    expect(w.text()).toContain('家長已接送')

    await w.find('.pos-student-card').trigger('click')
    expect(w.emitted('quick-dispatch')).toEqual([[STUDENT]])
  })

  it('status=on_leave 時顯示請假徽章且視覺降階、不可點擊', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'on_leave' },
    })
    expect(w.find('.pos-student-card').classes()).toContain('is-resolved')
    expect(w.find('.pos-student-card').classes()).not.toContain('is-redispatchable')
    expect(w.find('.pos-student-card__status--leave').exists()).toBe(true)
    expect(w.text()).toContain('請假')

    await w.find('.pos-student-card').trigger('click')
    expect(w.emitted('quick-dispatch')).toBeUndefined()
  })

  it('status=bus_picked 時顯示娃娃車已接送徽章且視覺降階', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'bus_picked' },
    })
    expect(w.find('.pos-student-card').classes()).toContain('is-resolved')
    expect(w.find('.pos-student-card__status--bus').exists()).toBe(true)
    expect(w.text()).toContain('娃娃車已接送')
  })

  it('status=proxy_picked 時顯示代理人已接走徽章，且與 guardian_picked 視覺可分辨', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'proxy_picked' },
    })
    await w.find('.pos-student-card').trigger('click')
    expect(w.emitted('quick-dispatch')).toBeUndefined()
    expect(w.find('.pos-student-card').classes()).toContain('is-resolved')
    expect(w.find('.pos-student-card__status--proxy').exists()).toBe(true)
    expect(w.find('.pos-student-card__status--picked').exists()).toBe(false)
    expect(w.text()).toContain('代理人已接走')
  })

  it('more-icon 觸發按鈕點擊不會冒泡到卡片本體（不誤觸 quick-dispatch）', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await w.find('.pos-student-card__more-trigger').trigger('click')
    expect(w.emitted('quick-dispatch')).toBeUndefined()
  })

  function menuItems(w: ReturnType<typeof mount>) {
    return w.findAllComponents({ name: 'ElDropdownItem' }).map(item => ({
      text: item.text(),
      disabled: item.props('disabled') as boolean,
      command: item.props('command') as string | undefined,
    }))
  }

  async function runCommand(w: ReturnType<typeof mount>, command: string) {
    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', command)
    await w.vm.$nextTick()
  }

  it('待接送：選單提供娃娃車接走與病假／事假三個可用項目', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    const items = menuItems(w)
    expect(items.map(i => i.command)).toEqual(['mark-bus', 'mark-leave:病假', 'mark-leave:事假'])
    expect(items.every(i => !i.disabled)).toBe(true)
    expect(items[0].text).toContain('標記已被娃娃車接走')
    expect(w.text()).not.toContain('功能開發中')
  })

  it('待接送：選單指令 emit 對應事件', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await runCommand(w, 'mark-bus')
    await runCommand(w, 'mark-leave:事假')
    expect(w.emitted('mark-bus')).toEqual([[STUDENT]])
    expect(w.emitted('mark-leave')).toEqual([[STUDENT, '事假']])
    expect(w.emitted('quick-dispatch')).toBeUndefined()
  })

  it('接送台補登的娃娃車：可撤銷，emit unmark-bus(student, callId)', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'bus_picked', detail: { busManualCallId: 55 } },
    })
    const items = menuItems(w)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ command: 'unmark-bus', disabled: false })
    await runCommand(w, 'unmark-bus')
    expect(w.emitted('unmark-bus')).toEqual([[STUDENT, 55]])
  })

  it('隨車老師打卡帶入的娃娃車：不可從 POS 撤銷，顯示路線', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'bus_picked', detail: { busRouteName: '放學一號車' } },
    })
    const items = menuItems(w)
    expect(items).toHaveLength(1)
    expect(items[0].disabled).toBe(true)
    expect(items[0].text).toContain('隨車老師')
    expect(items[0].text).toContain('放學一號車')
  })

  it('接送台補登的請假：可撤銷，emit unmark-leave(student)', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: {
        student: STUDENT,
        status: 'on_leave',
        detail: { leaveType: '病假', leaveMarkedByPos: true },
      },
    })
    expect(menuItems(w)[0]).toMatchObject({ command: 'unmark-leave', disabled: false })
    await runCommand(w, 'unmark-leave')
    expect(w.emitted('unmark-leave')).toEqual([[STUDENT]])
  })

  it('家長請假或點名寫入的請假：不可從 POS 撤銷', () => {
    const w = mount(DismissalPosStudentCard, {
      props: {
        student: STUDENT,
        status: 'on_leave',
        detail: { leaveType: '事假', leaveMarkedByPos: false },
      },
    })
    const items = menuItems(w)
    expect(items).toHaveLength(1)
    expect(items[0].disabled).toBe(true)
    expect(items[0].text).toContain('點名頁')
  })

  it('請假徽章帶出假別', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'on_leave', detail: { leaveType: '病假' } },
    })
    expect(w.find('.pos-student-card__status--leave').text()).toContain('病假')
  })

  it('已被家長接走：選單只有說明、無可用項目', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'guardian_picked' },
    })
    const items = menuItems(w)
    expect(items.every(i => i.disabled)).toBe(true)
  })

  it('busy 時整個選單停用（避免送出重複補登）', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked', busy: true },
    })
    expect(w.findComponent({ name: 'ElDropdown' }).props('disabled')).toBe(true)
  })

  it('aria-label 依狀態描述姓名＋狀態', () => {
    const unpicked = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    expect(unpicked.find('.pos-student-card').attributes('aria-label')).toBe('王小明，待接送')

    const picked = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'guardian_picked' },
    })
    expect(picked.find('.pos-student-card').attributes('aria-label')).toBe(
      '王小明，家長已接送，點擊可再次通知',
    )

    const proxyPicked = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'proxy_picked' },
    })
    expect(proxyPicked.find('.pos-student-card').attributes('aria-label')).toBe('王小明，代理人已接走')
  })

  it('Enter 鍵可觸發 quick-dispatch（鍵盤可操作）', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await w.find('.pos-student-card').trigger('keydown.enter')
    expect(w.emitted('quick-dispatch')).toEqual([[STUDENT]])
  })
})
