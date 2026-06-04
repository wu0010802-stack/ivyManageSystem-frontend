import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive, effectScope, ref } from 'vue'
import { useFormDraft } from '../useFormDraft'
import { ElMessageBox } from 'element-plus'
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
}))

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

describe('useFormDraft：dirty 門檻與 enabled', () => {
  beforeEach(() => localStorage.clear())

  it('編輯模式：與初值快照相同 → 不寫草稿', async () => {
    const form = reactive({ reason: '原因', hours: 8 })
    const enabled = ref(true)
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    void api
    // 觸發一次 watch 但值未變
    form.reason = '原因'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull()
    stop()
  })

  it('enabled=false 時不寫草稿', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(false)
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    void api
    form.reason = '變更'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull()
    stop()
  })

  it('enabled 轉 true 後重拍快照，之後變更才寫', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(false)
    const { stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    enabled.value = true
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '填寫中'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeTruthy()
    stop()
  })

  it('關閉表單（enabled 轉 false）時 flush 寫入未存的變更', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(true)
    const { stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 99999, // 不靠 debounce，證明是 flush
    }))
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '最後變更'
    enabled.value = false // true→false 觸發 flush
    await new Promise((r) => setTimeout(r, 0))
    const raw = localStorage.getItem('ivy.draft.v1.leave.5')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).data.reason).toBe('最後變更')
    stop()
  })
})

describe('useFormDraft：flush', () => {
  beforeEach(() => localStorage.clear())

  it('分頁隱藏時立即 flush（不等 debounce）', async () => {
    const form = reactive({ reason: '' })
    const { stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => true, debounceMs: 99999, // debounce 很久，證明是 flush 立即寫
    }))
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '來不及 debounce'
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    const raw = localStorage.getItem('ivy.draft.v1.leave.5')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).data.reason).toBe('來不及 debounce')
    stop()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('clear() 後關閉表單不應「復活」草稿', async () => {
    const form = reactive({ reason: '' })
    const enabled = ref(true)
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => enabled.value, debounceMs: 0,
    }))
    await new Promise((r) => setTimeout(r, 0))
    form.reason = '已送出的內容'
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeTruthy() // 草稿已寫入
    api.clear() // 模擬送出成功後清除
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull()
    enabled.value = false // 關閉表單 → flush；修好後不應復活
    await new Promise((r) => setTimeout(r, 0))
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull() // 仍為 null
    stop()
  })
})

describe('useFormDraft：maybePromptRestore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(ElMessageBox.confirm).mockReset()
  })

  it('選「還原」→ 草稿 data 寫回 state、回傳 true', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5,
      enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(true)
    expect(form.reason).toBe('上次填的')
    stop()
  })

  it('選「捨棄」(reject "cancel") → 清掉草稿、回傳 false', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('cancel')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(form.reason).toBe('')
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeNull() // 已清
    stop()
  })

  it('關閉 (reject "close") → 保留草稿、回傳 false', async () => {
    localStorage.setItem('ivy.draft.v1.leave.5', JSON.stringify({
      v: 1, savedAt: new Date().toISOString(), data: { reason: '上次填的' },
    }))
    vi.mocked(ElMessageBox.confirm).mockRejectedValue('close')
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(localStorage.getItem('ivy.draft.v1.leave.5')).toBeTruthy() // 保留
    stop()
  })

  it('無草稿 → 不跳框、回傳 false', async () => {
    const form = reactive({ reason: '' })
    const { api, stop } = run(() => useFormDraft({
      formId: 'leave', state: form, userScope: () => 5, enabled: () => true, debounceMs: 0,
    }))
    const restored = await api.maybePromptRestore()
    expect(restored).toBe(false)
    expect(vi.mocked(ElMessageBox.confirm)).not.toHaveBeenCalled()
    stop()
  })
})

describe('useFormDraft：過期 GC', () => {
  beforeEach(() => localStorage.clear())

  it('init 時刪除前綴 ivy.draft. 下所有過期草稿', () => {
    const old = new Date(Date.now() - 30 * 86400_000).toISOString()
    const fresh = new Date().toISOString()
    localStorage.setItem('ivy.draft.v1.old.1', JSON.stringify({ v: 1, savedAt: old, data: {} }))
    localStorage.setItem('ivy.draft.v1.fresh.1', JSON.stringify({ v: 1, savedAt: fresh, data: {} }))
    localStorage.setItem('unrelated.key', 'keep-me')
    const form = reactive({ x: '' })
    const { stop } = run(() => useFormDraft({ formId: 'whatever', state: form, ttlDays: 7, debounceMs: 0 }))
    expect(localStorage.getItem('ivy.draft.v1.old.1')).toBeNull()      // 過期被刪
    expect(localStorage.getItem('ivy.draft.v1.fresh.1')).toBeTruthy()  // 未過期保留
    expect(localStorage.getItem('unrelated.key')).toBe('keep-me')      // 非前綴不動
    stop()
  })
})
