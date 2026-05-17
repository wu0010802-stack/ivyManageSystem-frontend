import { describe, it, expect } from 'vitest'
import { reactive, ref, nextTick } from 'vue'
import { useMinuteSnapping } from '@/composables/useMinuteSnapping'

function setup(initial = {}, mode = 'custom') {
  const form = reactive({ start_date: '', end_date: '', ...initial })
  const leaveMode = ref(mode)
  useMinuteSnapping({ form, leaveMode })
  return { form, leaveMode }
}

describe('useMinuteSnapping — 分鐘對齊', () => {
  it('minute=44 → 30', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:44'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 10:30')
  })

  it('minute < 15 → 00（保留同小時）', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:14'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 10:00')
  })

  it('minute=15 → 30（邊界）', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:15'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 10:30')
  })

  it('minute=45 → 下一小時 00', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:45'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 11:00')
  })

  it('minute=59 → 下一小時 00', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:59'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 11:00')
  })

  it('跨日：23:59 → 次日 00:00', async () => {
    const { form } = setup()
    form.end_date = '2026-05-17 23:59'
    await nextTick()
    expect(form.end_date).toBe('2026-05-18 00:00')
  })

  it('跨月：05-31 23:50 → 06-01 00:00', async () => {
    const { form } = setup()
    form.end_date = '2026-05-31 23:50'
    await nextTick()
    expect(form.end_date).toBe('2026-06-01 00:00')
  })

  it('跨年：12-31 23:55 → 次年 01-01 00:00', async () => {
    const { form } = setup()
    form.end_date = '2026-12-31 23:55'
    await nextTick()
    expect(form.end_date).toBe('2027-01-01 00:00')
  })

  it('保留 16 之後的秒/尾段', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17 10:44:30'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 10:30:30')
  })

  it('leaveMode !== custom 時不動', async () => {
    const { form, leaveMode } = setup({}, 'morning')
    form.start_date = '2026-05-17 10:44'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17 10:44')
    leaveMode.value = 'morning'
  })

  it('長度 <= 10（只有日期沒時間）不動', async () => {
    const { form } = setup()
    form.start_date = '2026-05-17'
    await nextTick()
    expect(form.start_date).toBe('2026-05-17')
  })

  it('空字串不動', async () => {
    const { form } = setup()
    form.start_date = ''
    await nextTick()
    expect(form.start_date).toBe('')
  })
})
