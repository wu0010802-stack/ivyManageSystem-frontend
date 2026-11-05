// tests/unit/composables/useEmployeeFormDirty.test.js
import { describe, it, expect } from 'vitest'
import { reactive, nextTick } from 'vue'
import { useEmployeeFormDirty } from '@/composables/useEmployeeFormDirty'

describe('useEmployeeFormDirty', () => {
  const basicFields = ['name', 'phone']
  const salaryFields = ['base_salary', 'pension_self_rate']

  it('reset 後 dirty 為空', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty, salaryDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    await nextTick()
    expect(basicDirty.value).toEqual({})
    expect(salaryDirty.value).toEqual({})
  })

  it('修改 basic 欄位後只進 basicDirty', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty, salaryDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.phone = '0922'
    await nextTick()
    expect(basicDirty.value).toEqual({ phone: { before: '0911', after: '0922' } })
    expect(salaryDirty.value).toEqual({})
  })

  it('修改 salary 欄位後只進 salaryDirty', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty, salaryDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.base_salary = 38000
    await nextTick()
    expect(basicDirty.value).toEqual({})
    expect(salaryDirty.value).toEqual({
      base_salary: { before: 30000, after: 38000 }
    })
  })

  it('改回原值後 dirty 歸零', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.phone = '0922'
    await nextTick()
    expect(Object.keys(basicDirty.value)).toEqual(['phone'])
    form.phone = '0911'
    await nextTick()
    expect(basicDirty.value).toEqual({})
  })

  it('null 與 undefined 視為相同', async () => {
    const form = reactive({ name: null, phone: undefined, base_salary: 0, pension_self_rate: 0 })
    const { reset, basicDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.name = undefined
    await nextTick()
    expect(basicDirty.value).toEqual({})
  })

  it('reset 後再修改可重新偵測', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.phone = '0922'
    await nextTick()
    reset(form)
    await nextTick()
    expect(basicDirty.value).toEqual({})
    form.phone = '0933'
    await nextTick()
    expect(basicDirty.value).toEqual({ phone: { before: '0922', after: '0933' } })
  })

  it('reset(form, fields) 只重設指定欄位，另一 tab 的待存異動維持 dirty（QA F1）', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty, salaryDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    reset(form)
    form.phone = '0922'
    form.base_salary = 38000
    await nextTick()
    reset(form, basicFields) // 只存了基本資料 tab
    await nextTick()
    expect(basicDirty.value).toEqual({})
    expect(salaryDirty.value).toEqual({ base_salary: { before: 30000, after: 38000 } })
    // 之後基本資料 tab 再改，基準是剛才儲存的值
    form.phone = '0933'
    await nextTick()
    expect(basicDirty.value).toEqual({ phone: { before: '0922', after: '0933' } })
  })

  it('reset(form, fields) 在尚無基準快照時退回整份重設', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { reset, basicDirty, salaryDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    form.base_salary = 38000
    reset(form, basicFields)
    await nextTick()
    expect(basicDirty.value).toEqual({})
    expect(salaryDirty.value).toEqual({})
  })

  it('originalForm 為 null（新增模式）→ dirty 永遠是空', async () => {
    const form = reactive({ name: '甲', phone: '0911', base_salary: 30000, pension_self_rate: 0 })
    const { basicDirty } = useEmployeeFormDirty(form, basicFields, salaryFields)
    form.phone = '0922'
    await nextTick()
    expect(basicDirty.value).toEqual({})
  })
})
