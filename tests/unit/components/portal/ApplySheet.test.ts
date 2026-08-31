/**
 * tests/unit/components/portal/ApplySheet.test.ts
 *
 * 申請集中入口 bottom sheet：
 * (a) 四列：請假申請／加班申請／補打卡申請／異常確認
 * (b) 點列導向對應既有頁面並關閉（emit update:modelValue false）
 * (c) 請假列顯示 substitutePendingCount badge；0 時不顯示
 * (d) 圖示為線稿 SVG（非 emoji）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

import ApplySheet from '@/components/portal/ApplySheet.vue'

// TeacherBottomSheet 用 Teleport + visualViewport，行為由它自己的測試覆蓋；
// 這裡 stub 成透明容器只驗 ApplySheet 內容。
const stubs = {
  TeacherBottomSheet: {
    props: ['modelValue', 'title'],
    template: '<div v-if="modelValue" class="sheet-stub" :data-title="title"><slot /></div>',
  },
}

const doMount = (props: Record<string, unknown> = {}) =>
  mount(ApplySheet, {
    props: { modelValue: true, ...props },
    global: { stubs },
  })

describe('ApplySheet — 申請集中入口', () => {
  beforeEach(() => {
    routerPush.mockClear()
  })

  it('(a) 渲染四列申請項目與標題', () => {
    const wrapper = doMount()
    const text = wrapper.text()
    expect(wrapper.find('.sheet-stub').attributes('data-title')).toBe('我要申請')
    expect(text).toContain('請假申請')
    expect(text).toContain('加班申請')
    expect(text).toContain('補打卡申請')
    expect(text).toContain('異常確認')
    expect(wrapper.findAll('.apply-sheet__row')).toHaveLength(4)
  })

  it('(b) 點列 push 對應路由（表單頁帶 ?new=1 直開表單）並關閉', async () => {
    const wrapper = doMount()
    const rows = wrapper.findAll('.apply-sheet__row')
    const byLabel = (label: string) => rows.find((r) => r.text().includes(label))

    await byLabel('請假申請')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/leave?new=1')

    await byLabel('加班申請')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/overtime?new=1')

    await byLabel('補打卡申請')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/punch-correction?new=1')

    await byLabel('異常確認')!.trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/anomalies')

    const closeEvents = wrapper.emitted('update:modelValue') || []
    expect(closeEvents.length).toBeGreaterThanOrEqual(4)
    expect(closeEvents.every(([v]) => v === false)).toBe(true)
  })

  it('(c) substitutePendingCount > 0 時請假列顯示 badge；0 時不顯示', () => {
    const withBadge = doMount({ substitutePendingCount: 3 })
    const leaveRow = withBadge
      .findAll('.apply-sheet__row')
      .find((r) => r.text().includes('請假申請'))!
    expect(leaveRow.find('.apply-sheet__badge').exists()).toBe(true)
    expect(leaveRow.find('.apply-sheet__badge').text()).toBe('3')

    const noBadge = doMount({ substitutePendingCount: 0 })
    expect(noBadge.find('.apply-sheet__badge').exists()).toBe(false)
  })

  it('(d) 每列有線稿 SVG 圖示、無 emoji', () => {
    const wrapper = doMount()
    const rows = wrapper.findAll('.apply-sheet__row')
    rows.forEach((r) => {
      expect(r.find('svg').exists()).toBe(true)
    })
    // emoji 掃描（BMP 之外的 surrogate pair 或常見符號區）
    expect(wrapper.text()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
