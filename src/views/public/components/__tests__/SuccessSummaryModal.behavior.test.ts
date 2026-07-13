import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SuccessSummaryModal from '../SuccessSummaryModal.vue'

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    message: '報名資料已送出，校方將於 1-2 個工作天確認後主動與您聯繫。',
    studentName: '王小明',
    parentPhone: '0912345678',
    selectedCourses: [{ name: '幼兒體適能', price: 2600 }],
    selectedSupplies: [{ name: '美語課本組', price: 950 }],
    totalAmount: 3550,
    queryToken: 'tok_ABC',
    editUrl: 'https://ivy.example.tw/public.html#/activity/query?token=tok_ABC',
    copyHint: '',
    ...overrides,
  }
}

function mountModal(overrides: Record<string, unknown> = {}) {
  return mount(SuccessSummaryModal, { props: { summary: makeSummary(overrides) } })
}

let writeText: ReturnType<typeof vi.fn>
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

describe('金額格式', () => {
  it('課程價、加購價與總額都以千分位顯示', () => {
    const wrapper = mountModal()
    expect(wrapper.text()).toContain('$2,600')
    expect(wrapper.text()).toContain('$3,550')
    expect(wrapper.text()).not.toContain('$2600')
    expect(wrapper.text()).not.toContain('$3550')
  })
})

describe('資訊架構', () => {
  it('查詢碼區排在報名摘要之前（保存查詢碼是本畫面第一目標）', () => {
    const wrapper = mountModal()
    const body = wrapper.get('.modal-body').element.innerHTML
    const tokenIdx = body.indexOf('success-token-box')
    const receiptIdx = body.indexOf('summary-receipt')
    expect(tokenIdx).toBeGreaterThan(-1)
    expect(receiptIdx).toBeGreaterThan(-1)
    expect(tokenIdx).toBeLessThan(receiptIdx)
  })

  it('無 queryToken 時不顯示查詢碼區', () => {
    const wrapper = mountModal({ queryToken: '', editUrl: '' })
    expect(wrapper.find('.success-token-box').exists()).toBe(false)
  })
})

describe('軟性保存守門', () => {
  it('未複製就點完成：第一次只顯示提醒不關閉，第二次才關閉', async () => {
    const wrapper = mountModal()
    await wrapper.get('.btn-block').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('.close-nudge').exists()).toBe(true)
    await wrapper.get('.btn-block').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('複製查詢碼後 CTA 轉主色，點擊直接關閉且無提醒', async () => {
    const wrapper = mountModal()
    expect(wrapper.get('.btn-block').classes()).toContain('btn-outline')
    await wrapper.get('.btn-copy').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('tok_ABC')
    expect(wrapper.get('.btn-block').classes()).toContain('btn-primary')
    await wrapper.get('.btn-block').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.close-nudge').exists()).toBe(false)
  })

  it('無 queryToken 時不守門，一次點擊即關閉', async () => {
    const wrapper = mountModal({ queryToken: '', editUrl: '' })
    await wrapper.get('.btn-block').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('右上關閉鈕不守門（dialog 慣例），一次點擊即關閉', async () => {
    const wrapper = mountModal()
    await wrapper.get('.modal-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('複製後關閉並開啟第二筆報名時，恢復未保存提醒', async () => {
    const wrapper = mountModal()
    await wrapper.get('.btn-copy').trigger('click')
    await flushPromises()
    expect(wrapper.get('.btn-block').classes()).toContain('btn-primary')

    await wrapper.get('.modal-close').trigger('click')
    await wrapper.setProps({ summary: makeSummary({ visible: false }) })
    await wrapper.setProps({
      summary: makeSummary({
        queryToken: 'tok_SECOND',
        editUrl: 'https://ivy.example.tw/public.html#/activity/query?token=tok_SECOND',
      }),
    })

    expect(wrapper.get('.btn-block').classes()).toContain('btn-outline')
    await wrapper.get('.btn-block').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.find('.close-nudge').exists()).toBe(true)
  })
})

describe('複製就地回饋', () => {
  it('點複製後該按鈕就地顯示「已複製」', async () => {
    const wrapper = mountModal()
    const btn = wrapper.get('.btn-copy')
    expect(btn.text()).toContain('複製')
    await btn.trigger('click')
    await flushPromises()
    expect(btn.text()).toContain('已複製')
  })

  it('複製播報區帶 aria-live，供螢幕閱讀器接收結果', () => {
    const wrapper = mountModal()
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
  })
})
