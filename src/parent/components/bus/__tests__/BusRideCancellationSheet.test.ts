import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BusRideCancellationSheet from '../BusRideCancellationSheet.vue'

type Props = InstanceType<typeof BusRideCancellationSheet>['$props']

const mountSheet = async (props: Partial<Props> = {}) => {
  const w = mount(BusRideCancellationSheet, {
    props: {
      visible: true,
      childName: '王小明',
      activeCancellations: [],
      submitting: false,
      results: null,
      ...props,
    },
    attachTo: document.body, // ParentBottomSheet teleport 到 body
  })
  await flushPromises()
  return w
}

const q = <T extends Element>(sel: string) => document.querySelector(sel) as T | null

describe('BusRideCancellationSheet', () => {
  it('「整天」選取兩方向並經確認後 emit submit 兩方向', async () => {
    const w = await mountSheet()
    ;(q<HTMLButtonElement>('[data-test="whole-day-btn"]'))!.click()
    await flushPromises()
    const submit = q<HTMLButtonElement>('[data-test="submit-btn"]')!
    expect(submit.disabled).toBe(false)
    submit.click()
    await flushPromises()
    // ConfirmDialog 確認後才 emit（按套用才落庫的家長端對應語意）
    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('確定回報'),
    )!
    confirmBtn.click()
    await flushPromises()
    expect(w.emitted('submit')?.[0]).toEqual([['morning', 'afternoon']])
    w.unmount()
  })

  it('部分成功結果分筆呈現（每方向一筆、失敗顯示訊息）', async () => {
    const w = await mountSheet({
      results: [
        { direction: 'morning', ok: false, message: '早上已完成接車，無法取消' },
        { direction: 'afternoon', ok: true, message: '已取消下午送車' },
      ],
    })
    expect(q('[data-test="result-morning"]')?.textContent).toContain('早上已完成接車')
    expect(q('[data-test="result-afternoon"]')?.textContent).toContain('已取消下午送車')
    // 有結果時不再顯示送出表單
    expect(q('[data-test="submit-btn"]')).toBeNull()
    w.unmount()
  })

  it('已有有效 cancellation 的方向顯示「已回報不搭」；revocable=false 隱藏撤銷鈕', async () => {
    const w = await mountSheet({
      activeCancellations: [
        { id: 11, direction: 'morning', revocable: true },
        { id: 12, direction: 'afternoon', revocable: false },
      ],
    })
    expect(q('[data-test="row-morning"]')?.textContent).toContain('已回報不搭')
    expect(q('[data-test="revoke-morning"]')).not.toBeNull()
    expect(q('[data-test="revoke-afternoon"]')).toBeNull()
    // 兩方向都已回報 → 無「整天」與可選項
    expect(q('[data-test="whole-day-btn"]')).toBeNull()
    w.unmount()
  })

  it('撤銷 emit cancellation id', async () => {
    const w = await mountSheet({
      activeCancellations: [{ id: 11, direction: 'morning', revocable: true }],
    })
    ;(q<HTMLButtonElement>('[data-test="revoke-morning"]'))!.click()
    await flushPromises()
    expect(w.emitted('revoke')?.[0]).toEqual([11])
    w.unmount()
  })

  it('未選任何方向時送出鈕 disabled', async () => {
    const w = await mountSheet()
    expect(q<HTMLButtonElement>('[data-test="submit-btn"]')!.disabled).toBe(true)
    w.unmount()
  })
})
