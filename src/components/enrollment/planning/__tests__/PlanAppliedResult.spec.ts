import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlanAppliedResult from '../PlanAppliedResult.vue'
import type { Schema } from '@/api/_generated/typed'

type Summary = Schema<'PlanAppliedSummaryOut'>

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    created_classrooms: 2,
    reused_classrooms: 6,
    moved_students: 120,
    graduated: 36,
    excluded_still_active: 1,
    left_behind: [
      { id: 11, name: '王小明', classroom_name: '向日葵' },
      { id: 12, name: '李小華', classroom_name: '牡丹' },
    ],
    excluded_still_active_students: [{ id: 12, name: '李小華', classroom_name: '牡丹' }],
    skipped_inactive: [{ id: 13, name: '陳小強', classroom_name: null }],
    capacity_overflow: [{ id: 5, target_name: '玫瑰', capacity: 30, current_count: 32 }],
    ...overrides,
  }
}

function mountResult(s: Summary = summary(), appliedAt: string | null = '2027-08-01T01:00:00') {
  return mount(PlanAppliedResult, {
    global: { plugins: [ElementPlus], stubs: { RouterLink: RouterLinkStub } },
    props: { summary: s, appliedAt },
  })
}

describe('PlanAppliedResult', () => {
  it('標題與套用時間、搬動／畢業／班級數', () => {
    const w = mountResult()
    expect(w.find('.result-title').text()).toBe('套用結果')
    expect(w.text()).toContain('2027/08/01')
    expect(w.text()).toContain('搬到新班 120 位')
    expect(w.text()).toContain('畢業 36 位')
    expect(w.text()).toContain('新建 2 班')
  })

  it('仍在去年班與排除名單分開列，同一人只出現一次（不相加）', () => {
    const w = mountResult()
    const left = w.find('.result-list--left-behind')
    expect(left.find('.list-title').text()).toContain('1 位')
    expect(left.text()).toContain('王小明')
    expect(left.text()).not.toContain('李小華')
    const excluded = w.find('.result-list--excluded')
    expect(excluded.find('.list-title').text()).toContain('1 位')
    expect(excluded.text()).toContain('李小華')
    expect(w.text()).not.toContain('2 位')
  })

  it('學生名字連到學生檔案頁', () => {
    const w = mountResult()
    const links = w.findAllComponents(RouterLinkStub)
    expect(links.map(l => l.props('to'))).toContain('/students/profile/11')
    expect(links.map(l => l.props('to'))).toContain('/students/profile/13')
  })

  it('超過容量的班級列出人數／容量', () => {
    expect(mountResult().find('.result-list--overflow').text()).toContain('玫瑰 32／30 人')
  })

  it('全部照計畫套用：只顯示完成訊息，沒有空名單', () => {
    const w = mountResult(summary({
      left_behind: [], excluded_still_active_students: [], skipped_inactive: [], capacity_overflow: [], excluded_still_active: 0,
    }))
    expect(w.find('.result-list--left-behind').exists()).toBe(false)
    expect(w.text()).toContain('所有學生都已照計畫套用')
  })
})
