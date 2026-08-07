import { watch, ref, toValue, onScopeDispose, type Ref, type MaybeRefOrGetter } from 'vue'
import { tenantKey, tenantGetItem, tenantSetItem, tenantRemoveItem } from '@/utils/tenantStorage'

const PREFIX = 'ivy.draft.'
const VERSION = 1

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小時前`
  const day = Math.floor(hr / 24)
  return `${day} 天前`
}

export type DraftRestoreChoice = 'restore' | 'discard' | 'dismiss'
export interface DraftPromptInfo {
  message: string
  title: string
  relativeTime: string
  hasExcluded: boolean
}

export interface UseFormDraftOptions<T extends object> {
  formId: string
  state: MaybeRefOrGetter<T>
  recordId?: MaybeRefOrGetter<string | number | null>
  userScope?: MaybeRefOrGetter<string | number | null>
  exclude?: string[]
  enabled?: MaybeRefOrGetter<boolean>
  debounceMs?: number
  ttlDays?: number
  confirmRestore?: (info: DraftPromptInfo) => DraftRestoreChoice | Promise<DraftRestoreChoice>
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
  const { formId, exclude = [], debounceMs = 800, ttlDays = 7 } = opts
  const hasDraft = ref(false)
  const draftSavedAt = ref<Date | null>(null)
  let snapshot: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  // Resolve the current form object via toValue (supports reactive object, ref, or getter)
  const cur = (): Record<string, unknown> => toValue(opts.state) as Record<string, unknown>

  // 未加租戶前綴的原始 key（= 改造前的形狀，也是 legacy fallback 要讀的 key）。
  // tenantStorage 的 helper 都吃這個 base，由它們自己算 `t/<slug>/…`。
  const buildBaseKey = (): string => {
    const rid = toValue(opts.recordId)
    const scope = toValue(opts.userScope)
    let k = `${PREFIX}v${VERSION}.${formId}`
    if (rid != null && rid !== '') k += `.r${rid}`
    if (scope != null && scope !== '') k += `.${scope}`
    return k
  }

  // 註：不另留 `buildKey()`。單一草稿的讀/寫/刪三處都吃 base key 走 tenantStorage
  // wrapper（由它自己算 `t/<slug>/…`）；只有 gcExpired() 需要「完整 key 前綴」，
  // 它在下方自行以 tenantKey(PREFIX) 取得。

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
    return JSON.stringify(pick(cur())) !== snapshot
  }

  const write = (): void => {
    try {
      const env: DraftEnvelope = {
        v: VERSION,
        savedAt: new Date().toISOString(),
        data: pick(cur()),
      }
      tenantSetItem(buildBaseKey(), JSON.stringify(env))
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
    snapshot = JSON.stringify(pick(cur()))
  }

  const clear = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    // 連 legacy key 一併刪：否則使用者「捨棄草稿」後，read() 的 legacy fallback
    // 會把同一份草稿再撈回來復活。
    tenantRemoveItem(buildBaseKey())
    hasDraft.value = false
    draftSavedAt.value = null
    snapshot = JSON.stringify(pick(cur())) // 重拍快照：clear 後不再 dirty，避免關閉時 flush 復活草稿
  }

  const read = (): DraftEnvelope | null => {
    try {
      // tenantGetItem：新 key miss 時讀一次 legacy key（改造前形狀），命中則搬移到新 key
      // 並刪 legacy（一次性遷移；DEV `?tenant=` override 下只讀不搬，CT-F-07(2)）。
      // 草稿 TTL 7 天，legacy 殘留會自然收斂。單租戶模式下兩者同 key，等同原本的 getItem。
      const raw = tenantGetItem(buildBaseKey())
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

  const gcExpired = (): void => {
    try {
      const cutoff = ttlDays * 86400_000
      // 掃新舊兩組前綴：PREFIX 是改造前的裸 key（legacy 殘留），tenantKey(PREFIX) 是本租戶
      // 的新前綴。單租戶模式下兩者相同，去重避免同一 key 判斷兩次。其他租戶的
      // `t/<other>/ivy.draft.…` 不以任一前綴開頭，不會被本租戶誤刪。
      const prefixes = Array.from(new Set([PREFIX, tenantKey(PREFIX)]))
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !prefixes.some((p) => k.startsWith(p))) continue
        try {
          const parsed = JSON.parse(localStorage.getItem(k) || '')
          const ageMs = Date.now() - new Date(parsed?.savedAt).getTime()
          if (!(ageMs >= 0) || ageMs > cutoff || parsed?.v !== VERSION) toRemove.push(k)
        } catch {
          toRemove.push(k) // 損壞也清掉
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k))
    } catch {
      // localStorage 不可用 — 略過
    }
  }

  // flush：清掉 debounce 並立即寫入未存的 dirty 變更（enabled 門檻在 watcher 上，這裡只看 isDirty）
  const flush = (): void => {
    if (timer) { clearTimeout(timer); timer = null }
    if (isDirty()) write()
  }

  // 預設提示：動態載入 Element Plus（避免公開端 bundle 被拉進整個套件）
  const defaultConfirm = async (info: DraftPromptInfo): Promise<DraftRestoreChoice> => {
    const { ElMessageBox } = await import('element-plus')
    try {
      await ElMessageBox.confirm(info.message, info.title, {
        confirmButtonText: '還原',
        cancelButtonText: '捨棄',
        type: 'info',
        distinguishCancelAndClose: true,
      })
      return 'restore'
    } catch (action) {
      return action === 'cancel' ? 'discard' : 'dismiss'
    }
  }

  const maybePromptRestore = async (): Promise<boolean> => {
    const env = read()
    if (!env) { hasDraft.value = false; draftSavedAt.value = null; return false }
    const rel = formatRelative(new Date(env.savedAt))
    const warn = exclude.length
      ? '\n（敏感欄位如電話、身分證、薪資、銀行帳號不會還原，請重新確認）'
      : ''
    const info: DraftPromptInfo = {
      message: `偵測到您 ${rel} 未完成的草稿，要還原嗎？${warn}`,
      title: '繼續填寫上次的草稿？',
      relativeTime: rel,
      hasExcluded: exclude.length > 0,
    }
    const choice = await (opts.confirmRestore ? opts.confirmRestore(info) : defaultConfirm(info))
    if (choice === 'restore') {
      Object.assign(cur(), env.data)
      hasDraft.value = false
      draftSavedAt.value = null
      return true
    }
    if (choice === 'discard') clear()
    return false
  }

  const discard = clear

  // 監看表單變動 → debounce 寫入（enabled=false 時 watch callback 直接 return）
  // state 為 MaybeRefOrGetter → 用 getter 形式讓 Vue 追蹤 ref reassign
  const stopWatch = watch(
    () => toValue(opts.state),
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

  gcExpired()

  return { hasDraft, draftSavedAt, maybePromptRestore, clear, discard, flush }
}
