import { watch, ref, toValue, onScopeDispose, type Ref, type MaybeRefOrGetter } from 'vue'

const PREFIX = 'ivy.draft.'
const VERSION = 1

export interface UseFormDraftOptions<T extends object> {
  formId: string
  state: T
  recordId?: MaybeRefOrGetter<string | number | null>
  userScope?: MaybeRefOrGetter<string | number | null>
  exclude?: string[]
  enabled?: MaybeRefOrGetter<boolean>
  debounceMs?: number
  ttlDays?: number // 後續 Task 使用
}

export interface UseFormDraftReturn {
  hasDraft: Ref<boolean>
  draftSavedAt: Ref<Date | null>
  maybePromptRestore: () => Promise<boolean>
  clear: () => void
  discard: () => void
  flush: () => void
}

interface DraftEnvelope {
  v: number
  savedAt: string
  data: Record<string, unknown>
}

export function useFormDraft<T extends object>(opts: UseFormDraftOptions<T>): UseFormDraftReturn {
  const { formId, state, exclude = [], debounceMs = 800 } = opts
  const hasDraft = ref(false) // 後續 Task 使用
  const draftSavedAt = ref<Date | null>(null) // 後續 Task 使用
  let snapshot = ''
  let timer: ReturnType<typeof setTimeout> | null = null

  const buildKey = (): string => {
    const rid = toValue(opts.recordId)
    const scope = toValue(opts.userScope)
    let k = `${PREFIX}v${VERSION}.${formId}`
    if (rid != null && rid !== '') k += `.${rid}`
    if (scope != null && scope !== '') k += `.${scope}`
    return k
  }

  const pick = (obj: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    if (!obj) return out
    for (const [k, v] of Object.entries(obj)) {
      if (!exclude.includes(k)) out[k] = v
    }
    return out
  }

  const isDirty = (): boolean =>
    JSON.stringify(pick(state as Record<string, unknown>)) !== snapshot

  const write = (): void => {
    try {
      const env: DraftEnvelope = {
        v: VERSION,
        savedAt: new Date().toISOString(),
        data: pick(state as Record<string, unknown>),
      }
      localStorage.setItem(buildKey(), JSON.stringify(env))
    } catch {
      // 無痕模式 / quota 滿 — 不影響主流程
    }
  }

  const schedule = (): void => {
    if (debounceMs === 0) {
      // debounceMs=0 時直接同步寫入（測試用途 / immediate flush），不走 setTimeout
      if (isDirty()) write()
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (isDirty()) write()
    }, debounceMs)
  }

  const takeSnapshot = (): void => {
    snapshot = JSON.stringify(pick(state as Record<string, unknown>))
  }

  const clear = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    try { localStorage.removeItem(buildKey()) } catch { /* */ }
    hasDraft.value = false
    draftSavedAt.value = null
  }

  // 暫時佔位，後續 Task 補完
  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    if (toValue(opts.enabled) === false) return
    if (isDirty()) write()
  }
  const maybePromptRestore = async (): Promise<boolean> => false
  const discard = clear

  // 監看表單變動 → debounce 寫入
  // 注意：直接傳 reactive 物件（非 getter）+ deep:true，才能正確追蹤 nested 變動
  takeSnapshot()
  const stopWatch = watch(
    state,
    () => { if (toValue(opts.enabled) !== false) schedule() },
    { deep: true }
  )

  onScopeDispose(() => {
    stopWatch()
    if (timer) clearTimeout(timer)
  })

  return { hasDraft, draftSavedAt, maybePromptRestore, clear, discard, flush }
}
