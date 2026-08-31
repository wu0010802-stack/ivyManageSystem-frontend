/**
 * tests/unit/components/portal/home/TodayFocusCard.test.ts
 *
 * Phase 2 任務流首頁：「現在該做」置頂卡。
 * (a) 有 next：渲染 eyebrow／detail／學生／時間，CTA emit jump(deep_link)
 * (b) 無 next 且 counts 全 0：顯示「今日班級任務都完成」、無 CTA
 * (b2) 無 next 但 counts >0：顯示尚有 N 項待完成，不得謊報完成
 * (c) counts 計數列：只列 >0 的類別，點擊 emit open-hub；全 0 不渲染
 * (d) 線稿 SVG、無 emoji
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodayFocusCard from '@/components/portal/home/TodayFocusCard.vue'

const NEXT = {
  kind: 'medication',
  student_name: '王小明',
  detail: '餵藥（感冒糖漿 5ml）',
  due_at: '2026-08-24T11:30:00',
  deep_link: '/portal/class-hub?sheet=medication&id=5',
}

const COUNTS = {
  attendance_pending: 4,
  medications_pending: 2,
  observations_pending: 0,
  contact_books_pending: 17,
}

const ALL_ZERO = {
  attendance_pending: 0,
  medications_pending: 0,
  observations_pending: 0,
  contact_books_pending: 0,
}

const doMount = (props: Record<string, unknown> = {}) =>
  mount(TodayFocusCard, {
    props: { next: NEXT, counts: COUNTS, classroomName: '小蜜蜂班', ...props },
  })

describe('TodayFocusCard — 現在該做', () => {
  it('(a) 有 next 時渲染任務內容與 CTA', async () => {
    const wrapper = doMount()
    const text = wrapper.text()
    expect(text).toContain('現在該做')
    expect(text).toContain('小蜜蜂班')
    expect(text).toContain('餵藥（感冒糖漿 5ml）')
    expect(text).toContain('王小明')
    expect(text).toContain('11:30')

    await wrapper.find('.today-focus__cta').trigger('click')
    expect(wrapper.emitted('jump')?.[0]).toEqual([NEXT.deep_link])
  })

  it('(b) 無 next 且 counts 全 0 才是完成狀態、無 CTA', () => {
    const wrapper = doMount({ next: null, counts: ALL_ZERO })
    expect(wrapper.text()).toContain('今日班級任務都完成')
    expect(wrapper.find('.today-focus__cta').exists()).toBe(false)
  })

  it('(b2) 無 next 但仍有待辦時，不可謊報「都完成」', () => {
    // Why: sticky_next 只由 medication 驅動（後端 class_hub.py 註解自承 v1 限定），
    // 沒有待餵藥就回 null。舊版把 null 一律當「全部做完」，於是在點名／課堂觀察／
    // 聯絡簿都還沒做的日子照樣顯示「今日班級任務都完成」——而幼兒園多數日子
    // 本來就沒有用藥委託，等於幾乎每天誤報。
    const wrapper = doMount({ next: null })  // counts 仍有 4+2+17 = 23 項
    expect(wrapper.text()).not.toContain('今日班級任務都完成')
    expect(wrapper.text()).toContain('23')
    expect(wrapper.find('.today-focus__cta').exists()).toBe(false)
    // 明細仍走既有 chips 列
    expect(wrapper.find('.today-focus__strip').exists()).toBe(true)
  })

  it('(c) counts 計數列只列 >0 類別，點擊 emit open-hub', async () => {
    const wrapper = doMount()
    const strip = wrapper.find('.today-focus__strip')
    expect(strip.exists()).toBe(true)
    const stripText = strip.text()
    expect(stripText).toContain('到園點名')
    expect(stripText).toContain('4')
    expect(stripText).toContain('用藥')
    expect(stripText).toContain('聯絡簿')
    expect(stripText).toContain('17')
    expect(stripText).not.toContain('課堂觀察')

    await strip.trigger('click')
    expect(wrapper.emitted('open-hub')).toBeTruthy()

    const allZero = doMount({
      counts: {
        attendance_pending: 0,
        medications_pending: 0,
        observations_pending: 0,
        contact_books_pending: 0,
      },
    })
    expect(allZero.find('.today-focus__strip').exists()).toBe(false)
  })

  it('(d) 無 emoji', () => {
    const wrapper = doMount()
    expect(wrapper.text()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    const done = doMount({ next: null, counts: ALL_ZERO })
    expect(done.text()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    const pending = doMount({ next: null })
    expect(pending.text()).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})
