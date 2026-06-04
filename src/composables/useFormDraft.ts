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
  const { formId, state, exclude = [], debounceMs = 800, ttlDays = 7 } = opts
  const hasDraft = ref(false) // 後續 Task 使用
  const draftSavedAt = ref<Date | null>(null) // 後續 Task 使用
  let snapshot: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const buildKey = (): string => {
    const rid = toValue(opts.recordId)
    const scope = toValue(opts.userScope)
    let k = `${PREFIX}v${VERSION}.${formId}`
    if (rid != null && rid !== '') k += `.r${rid}`
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

  const isDirty = (): boolean => {
    if (snapshot === null) return false
    return JSON.stringify(pick(state as Record<string, unknown>)) !== snapshot
  }

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

  const read = (): DraftEnvelope | null => {
    try {
      const raw = localStorage.getItem(buildKey())
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      if (parsed.v !== VERSION) return null
      if (typeof parsed.savedAt !== 'string' || typeof parsed.data !== 'object' || !parsed.data) return null
      const age = Date.now() - new Date(parsed.savedAt).getTime()
      if (!(age >= 0) || age > ttlDays * 86400_000) return null
      return parsed as DraftEnvelope
    } catch {
      return null
    }
  }

  const refreshHasDraft = (): void => {
    const env = read()
    hasDraft.value = !!env
    draftSavedAt.value = env ? new Date(env.savedAt) : null
  }

  // flush：清掉 debounce 並立即寫入未存的 dirty 變更（enabled 門檻在 watcher 上，這裡只看 isDirty）
  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    if (isDirty()) write()
  }
  const maybePromptRestore = (): Promise<boolean> => Promise.resolve(false)
  const discard = clear

  // 監看表單變動 → debounce 寫入（enabled=false 時 watch callback 直接 return）
  const stopWatch = watch(
    state,
    () => { if (toValue(opts.enabled) !== false) schedule() },
    { deep: true }
  )

  // enabled 轉換：轉 true 拍快照 + 偵測草稿；轉 false flush
  let stopEnabled = () => {}
  if (opts.enabled !== undefined) {
    stopEnabled = watch(
      () => toValue(opts.enabled),
      (on, was) => {
        if (on && !was) { takeSnapshot(); refreshHasDraft() }
        else if (!on && was) { flush() }
      },
      { immediate: true }
    )
  } else {
    takeSnapshot()
    refreshHasDraft()
  }

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') flush()
  }
  const onBeforeUnload = (): void => { flush() }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('beforeunload', onBeforeUnload)

  onScopeDispose(() => {
    flush()
    stopWatch()
    stopEnabled()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('beforeunload', onBeforeUnload)
    if (timer) clearTimeout(timer)
  })

  return { hasDraft, draftSavedAt, maybePromptRestore, clear, discard, flush }
}
