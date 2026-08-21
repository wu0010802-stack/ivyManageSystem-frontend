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

  it('status=guardian_picked 時卡片視覺降階（淡灰）但仍可點擊再次通知，並顯示再次通知提示', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'guardian_picked' },
    })
    expect(w.find('.pos-student-card').classes()).toContain('is-resolved')
    expect(w.find('.pos-student-card').classes()).toContain('is-redispatchable')
    expect(w.find('.pos-student-card__status--picked').exists()).toBe(true)
    expect(w.text()).toContain('家長已接送')
    expect(w.text()).toContain('點卡片可再次通知')

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

  it('more-icon 觸發按鈕點擊不會冒泡到卡片本體（不誤觸 quick-dispatch）', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await w.find('.pos-student-card__more-trigger').trigger('click')
    expect(w.emitted('quick-dispatch')).toBeUndefined()
  })

  it('more-icon 兩個選單項目皆 disabled', () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    const items = w.findAllComponents({ name: 'ElDropdownItem' })
    expect(items.length).toBe(2)
    items.forEach(item => {
      expect(item.props('disabled')).toBe(true)
    })
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
  })

  it('Enter 鍵可觸發 quick-dispatch（鍵盤可操作）', async () => {
    const w = mount(DismissalPosStudentCard, {
      props: { student: STUDENT, status: 'unpicked' },
    })
    await w.find('.pos-student-card').trigger('keydown.enter')
    expect(w.emitted('quick-dispatch')).toEqual([[STUDENT]])
  })
})
