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
})
