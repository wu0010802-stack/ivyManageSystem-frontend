/**
 * tests/unit/components/portal/ClassHubTaskRow.test.ts
 *
 * 任務列 emoji 圖示 SVG 化：
 * (a) 五種 kind 均渲染線稿 SVG＋label，不再輸出 emoji 字元
 * (b) 未知 kind fallback：label 用 kind 原字串、仍有圖示容器
 * (c) 行為不變：count>0 顯示（n）、count=0 顯示「無」與 --empty class
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassHubTaskRow from '@/components/portal/class-hub/ClassHubTaskRow.vue'

const doMount = (props: Record<string, unknown>) =>
  mount(ClassHubTaskRow, { props, global: { plugins: [ElementPlus] } })

const KINDS: Array<[string, string]> = [
  ['attendance', '到園點名'],
  ['medication', '用藥執行'],
  ['observation', '課堂觀察'],
  ['incident', '事件紀錄'],
  ['contact_book', '每日聯絡簿'],
]

describe('ClassHubTaskRow — SVG 圖示', () => {
  it('(a) 五種 kind 渲染 SVG 與 label，無 emoji', () => {
    for (const [kind, label] of KINDS) {
      const wrapper = doMount({ kind, count: 1 })
      expect(wrapper.text()).toContain(label)
      expect(wrapper.find('.task-row__icon svg').exists()).toBe(true)
      expect(wrapper.text()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    }
  })

  it('(b) 未知 kind fallback 顯示 kind 字串與圖示容器', () => {
    const wrapper = doMount({ kind: 'mystery_kind', count: 0 })
    expect(wrapper.text()).toContain('mystery_kind')
    expect(wrapper.find('.task-row__icon').exists()).toBe(true)
  })

  it('(c) count 行為不變', () => {
    const withCount = doMount({ kind: 'attendance', count: 3 })
    expect(withCount.text()).toContain('（3）')
    expect(withCount.find('.task-row--empty').exists()).toBe(false)

    const empty = doMount({ kind: 'attendance', count: 0 })
    expect(empty.text()).toContain('無')
    expect(empty.find('.task-row--empty').exists()).toBe(true)
  })
})
