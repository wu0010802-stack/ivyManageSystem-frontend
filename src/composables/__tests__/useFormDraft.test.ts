import { describe, it, expect, beforeEach } from 'vitest'
import { reactive, effectScope } from 'vue'
import { useFormDraft } from '../useFormDraft'

// 在 effectScope 內跑 composable，回傳 API + stop（讓 onScopeDispose 可被觸發）
function run<T>(fn: () => T): { api: T; stop: () => void } {
  const scope = effectScope()
  let api!: T
  scope.run(() => { api = fn() })
  return { api, stop: () => scope.stop() }
}

describe('useFormDraft：key 與排除', () => {
  beforeEach(() => localStorage.clear())

  it('依 formId / recordId / userScope 組 key，並排除敏感欄位', async () => {
    const form = reactive({ name: '', id_number: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'employee', state: form,
      recordId: () => null, userScope: () => 7,
      exclude: ['id_number'], debounceMs: 0,
    }))
    void api
    form.name = '王小明'
    form.id_number = 'A123456789'
    await new Promise((r) => setTimeout(r, 0))
    const raw = localStorage.getItem('ivy.draft.v1.employee.7')
    expect(raw).toBeTruthy()
    const env = JSON.parse(raw!)
    expect(env.data.name).toBe('王小明')
    expect(env.data).not.toHaveProperty('id_number') // 敏感欄位不存
    stop()
  })
})

describe('useFormDraft：讀回與過期', () => {
  beforeEach(() => localStorage.clear())

  it('init 時讀到未過期草稿 → hasDraft=true、draftSavedAt 有值', () => {
    const key = 'ivy.draft.v1.leave.5'
    localStorage.setItem(key, JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: 'x' },
    }))
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, debounceMs: 0,
    }))
    expect(api.hasDraft.value).toBe(true)
    expect(api.draftSavedAt.value).toBeInstanceOf(Date)
    stop()
  })

  it('超過 ttlDays 的草稿視為無效 → hasDraft=false', () => {
    const old = new Date(Date.now() - 8 * 86400_000).toISOString() // 8 天前
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: old, data: { reason: 'x' },
    }))
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, ttlDays: 7, debounceMs: 0,
    }))
    expect(api.hasDraft.value).toBe(false)
    stop()
  })
})
