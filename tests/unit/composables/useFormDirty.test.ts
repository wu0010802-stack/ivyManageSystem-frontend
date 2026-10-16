import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { useFormDirty } from '@/composables/useFormDirty'

describe('useFormDirty', () => {
  it('snapshot 前為 clean；改值後 dirty；再 snapshot 回 clean', () => {
    const form = reactive({ name: '', price: 0 })
    const { isDirty, snapshot } = useFormDirty(form)
    expect(isDirty.value).toBe(false)
    form.name = '美語'
    expect(isDirty.value).toBe(true)
    snapshot()
    expect(isDirty.value).toBe(false)
  })

  it('exclude 的欄位變動不計 dirty', () => {
    const form = reactive({ name: '', updated_at: 't1' })
    const { isDirty } = useFormDirty(form, { exclude: ['updated_at'] })
    form.updated_at = 't2'
    expect(isDirty.value).toBe(false)
  })

  it('接受 ref 整包重指派（openEdit 慣例：form.value = {...}）', () => {
    const form = ref({ name: 'a' })
    const { isDirty, snapshot } = useFormDirty(form)
    form.value = { name: 'b' }
    snapshot()
    expect(isDirty.value).toBe(false)
    form.value.name = 'c'
    expect(isDirty.value).toBe(true)
  })

  // el-input-number 清空會 emit undefined（或 null，依元件版本與路徑而定）；
  // JSON.stringify 會「丟掉」undefined 的 key 卻保留 null，兩者序列化結果不同，
  // 使用者什麼都沒改只是點了清除鈕，離開頁面就誤跳「有未儲存的變更」。
  it('初值 null、清空後變 undefined：不算 dirty', () => {
    const form = reactive<{ name: string; price: number | null | undefined }>({
      name: '美語',
      price: null,
    })
    const { isDirty } = useFormDirty(form)
    form.price = undefined
    expect(isDirty.value).toBe(false)
  })

  it('初值 undefined、清空後變 null：不算 dirty（對稱）', () => {
    const form = reactive<{ price: number | null | undefined }>({ price: undefined })
    const { isDirty } = useFormDirty(form)
    form.price = null
    expect(isDirty.value).toBe(false)
  })

  it('空值正規化不吞掉真正的改動：null → 有值、有值 → undefined 仍是 dirty', () => {
    const form = reactive<{ price: number | null | undefined }>({ price: null })
    const { isDirty, snapshot } = useFormDirty(form)
    form.price = 100
    expect(isDirty.value).toBe(true)
    snapshot()
    form.price = undefined
    expect(isDirty.value).toBe(true)
  })
})
