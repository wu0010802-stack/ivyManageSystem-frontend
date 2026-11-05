// QA P2 #72（2026-11-06）：「主管職」「獎金等級覆蓋」是 clearable 的 el-select，
// Element Plus 預設清除值是 undefined（useEmptyValues.valueOnClear 預設 undefined）：
// v-model 寫成 undefined → dirtyToPayload 帶 undefined → JSON.stringify 丟 key →
// 後端收到 {}，畫面卻顯示儲存成功。與薪資 tab 三個下拉（EmployeeFormSalary）一致，
// 這兩個下拉必須 :value-on-clear="null"，清除時才送出明確的 null。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import ElementPlus from 'element-plus'
import EmployeeFormBasic from '../EmployeeFormBasic.vue'

// 真 EP 全量 mount 在並行滿載時偶發超過預設 5s，比照同目錄既有慣例放寬 timeout
vi.setConfig({ testTimeout: 15000 })

function mountBasic(form: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return mount(EmployeeFormBasic, {
    props: { form, ...extra },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}

type Wrapper = ReturnType<typeof mountBasic>

function selectByPlaceholder(wrapper: Wrapper, placeholder: string) {
  const found = wrapper
    .findAllComponents({ name: 'ElSelect' })
    .find(c => c.props('placeholder') === placeholder)
  if (!found) throw new Error(`找不到 placeholder=${placeholder} 的 ElSelect`)
  return found
}

// 真的走一次使用者操作：hover 出清除圖示 → 點擊 → 讀 v-model 實際被寫成什麼
async function clickClear(wrapper: Wrapper, placeholder: string) {
  const sel = selectByPlaceholder(wrapper, placeholder)
  await sel.trigger('mouseenter')
  const clear = sel.find('.el-select__icon.clear, .el-select__clear, .el-icon.clear')
  expect(clear.exists(), '清除圖示未出現').toBe(true)
  await clear.trigger('click')
}

describe('EmployeeFormBasic 主管職／獎金等級覆蓋的清除值', () => {
  it('主管職 el-select 的 valueOnClear 為 null', () => {
    const wrapper = mountBasic({ supervisor_role: '組長' })
    expect(selectByPlaceholder(wrapper, '無主管職').props('valueOnClear')).toBeNull()
    wrapper.unmount()
  })

  it('獎金等級覆蓋 el-select 的 valueOnClear 為 null', () => {
    const wrapper = mountBasic({ bonus_grade: 'A' })
    expect(selectByPlaceholder(wrapper, '自動（依教育局職稱）').props('valueOnClear')).toBeNull()
    wrapper.unmount()
  })

  it('實際點清除：主管職 v-model 被寫成 null（不是 undefined）', async () => {
    const form = reactive<Record<string, unknown>>({ supervisor_role: '組長', bonus_grade: 'A' })
    const wrapper = mountBasic(form)
    await clickClear(wrapper, '無主管職')
    expect(form.supervisor_role).toBeNull()
    // 另一個欄位不受影響
    expect(form.bonus_grade).toBe('A')
    wrapper.unmount()
  })

  it('實際點清除：獎金等級覆蓋 v-model 被寫成 null（不是 undefined）', async () => {
    const form = reactive<Record<string, unknown>>({ supervisor_role: '組長', bonus_grade: 'A' })
    const wrapper = mountBasic(form)
    await clickClear(wrapper, '自動（依教育局職稱）')
    expect(form.bonus_grade).toBeNull()
    expect(form.supervisor_role).toBe('組長')
    wrapper.unmount()
  })
})
