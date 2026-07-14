import { reactive, ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { publicQueryRegistration, publicQueryByToken } from '@/api/activityPublic'
import { parseLocalISODate, todayTaipeiISO } from '@/utils/format'
import { TW_MOBILE_RE, normalizeMobile } from '@/utils/phone'

export interface CourseEntry {
  name: string
  status: string
  waitlist_position?: number | null
  waitlist_total?: number | null
  confirm_deadline?: string | null
  course_id?: number
  price?: number | string
}

export interface QueryResult {
  id: number
  name: string
  birthday: string
  class_name?: string
  parent_phone?: string
  total_amount?: number | string
  paid_amount?: number | string
  updated_at?: string
  courses?: CourseEntry[]
  // P2：supplies 回 {name, price}（price=報名當下 price_snapshot）；舊資料容錯為 string。
  supplies?: Array<string | { name: string; price?: number }>
  field_state?: {
    class_source?: string
    class_editable?: boolean
    review_state?: string
    // 待審核期間（pending_review=true）可由家長自行修改姓名/生日；審核完成後鎖定。
    identity_editable?: boolean
  }
  // 資安 #5：此報名是否需帶 query_token 才能做破壞性 mutation（=後端有 query_token_hash）。
  // 三欄查詢（無 token）載入 token-bearing 報名時，前端據此顯示唯讀。
  query_token_required?: boolean
  // 是否已完成付款（含超繳），後端即時計算後回傳（非快取值）；true 時整單唯讀鎖定。
  is_paid?: boolean
}

export interface QueryCredentials {
  mode: 'fields' | 'token'
  token: string
  name: string
  birthday: string
  parent_phone: string
}

export interface QueryHydrationGuard {
  requestId: number
  registrationId: number
  credentials: QueryCredentials
}

/**
 * F4（2026-07-12）：從 ActivityPublicQueryView 抽出的「查詢 + 編修草稿」狀態。
 *
 * queryResult（查詢結果）與 editForm（編修草稿）刻意放在同一個 composable：
 * hydrateResult 收到新查詢結果時必須同步覆寫 editForm，兩者是同一筆報名的
 * 一體兩面，拆到不同 composable 反而要另外做跨 composable 同步（event bus /
 * watch），得不償失。usePromotionActions／useRegistrationEditSave 對兩者皆只
 * 讀取或透過 hydrateResult/refetchCurrent 間接寫入。
 *
 * ensureAvailabilityPolling 由呼叫端注入 refreshAvailability/startPolling
 * （來自 useActivityAvailability）：只有查詢命中、進入編輯介面時才起 30s 輪詢
 * （查詢階段不輪詢，避免查詢頁背景空轉）。
 */
export function usePublicRegistrationQuery({
  refreshAvailability,
  startPolling,
}: {
  refreshAvailability: () => Promise<void> | void
  startPolling: (intervalMs?: number) => void
}) {
  const route = useRoute()

  // 查詢模式：'token' 用查詢碼+手機（Phase 3）；'fields' 用姓名+生日+手機（向後相容）
  // 預設 'fields'（最小驚訝：既有家長進來看到熟悉 UI）；URL 帶 ?token= 時 initFromRoute 切到 token 模式
  const queryMode = ref<'fields' | 'token'>('fields')

  const queryForm = reactive({ token: '', name: '', birthday: '', parent_phone: '' })
  const queryLoading = ref(false)
  const queryResult = ref<QueryResult | null>(null)
  const activeQueryCredentials = ref<QueryCredentials | null>(null)
  const searchError = ref('')
  let latestQueryRequestId = 0
  const nameTouched = ref(false)
  const birthdayTouched = ref(false)
  const phoneTouched = ref(false)
  const tokenTouched = ref(false)
  const tokenValid = computed(() => queryForm.token.trim().length >= 8)

  const phoneValid = computed(() =>
    TW_MOBILE_RE.test(normalizeMobile(queryForm.parent_phone))
  )

  // 成功查詢所使用的 credentials 與仍可編輯的搜尋欄分離。mutation 必須使用
  // activeQueryCredentials，不能在結果已載入後又讀 queryForm 而混到另一筆條件。
  const activeQueryToken = computed(() =>
    activeQueryCredentials.value?.mode === 'token'
      ? activeQueryCredentials.value.token
      : null,
  )
  // 可否進行破壞性 mutation（修改/確認/放棄）：
  // - 後端標 query_token_required（token-bearing 報名）→ 必須手上有 token
  // - 否則（舊報名 query_token_required=false）→ 沿用三欄，永遠可改
  const canMutate = computed(
    () => !queryResult.value?.query_token_required || !!activeQueryToken.value,
  )

  // 已付款完結（含超繳）整單鎖定：後端 public_update 對此情境一律 409，
  // 前端直接改渲染純文字唯讀摘要（不渲染表單控制項與儲存按鈕）。
  const isPaymentLocked = computed(() => Boolean(queryResult.value?.is_paid))

  // 鎖定唯讀摘要用：supplies 容錯舊資料 string，正規化成 {name, price?}
  const lockedSummarySupplies = computed(() =>
    (queryResult.value?.supplies ?? []).map((s) =>
      typeof s === 'string' ? { name: s, price: undefined } : s,
    ),
  )

  const editForm = reactive({
    class_name: '',
    selectedCourses: [] as string[],
    selectedSupplies: [] as string[],
    new_parent_phone: '',
    new_name: '',
    new_birthday: '',
  })

  const nameValid = computed(() => queryForm.name.trim().length > 0)
  const birthdayErrorMsg = ref('請選擇幼兒生日')
  const birthdayValid = computed(() => {
    if (!queryForm.birthday) {
      birthdayErrorMsg.value = '請選擇幼兒生日'
      return false
    }
    const date = parseLocalISODate(queryForm.birthday)
    const today = parseLocalISODate(todayTaipeiISO())
    if (!date) {
      birthdayErrorMsg.value = '生日格式不正確'
      return false
    }
    if (!today) {
      birthdayErrorMsg.value = '無法判定今日日期，請稍後再試'
      return false
    }
    if (date > today) {
      birthdayErrorMsg.value = '生日不能是未來的日期'
      return false
    }
    // 與後端 20 年窗口同步：查詢時也擋明顯不合理的生日，避免 round-trip 才失敗
    const earliest = new Date(today)
    earliest.setFullYear(earliest.getFullYear() - 20)
    if (date < earliest) {
      birthdayErrorMsg.value = '生日超出合理範圍'
      return false
    }
    return true
  })

  function statusBadgeFor(name: string): string {
    if (!queryResult.value) return ''
    const entry = (queryResult.value.courses || []).find((c) => c.name === name)
    if (!entry) return ''
    if (entry.status === 'waitlist') {
      return `候補第 ${entry.waitlist_position ?? '?'} 位`
    }
    if (entry.status === 'promoted_pending') {
      return '已升正式（待確認）'
    }
    return ''
  }

  // 候補位次清單：供獨立候補摘要區塊使用（不依賴 options 列表）
  const waitlistCourses = computed(() => {
    if (!queryResult.value) return []
    return (queryResult.value.courses || []).filter((c) => c.status === 'waitlist')
  })

  // field_state 由後端決定。Fallback 預設為「已比對」，保守鎖住班級欄位避免
  // 舊版後端漏回此欄位時 UI 出現可改 → 後端覆寫的不一致。
  const fieldState = computed(() => {
    const fs = queryResult.value?.field_state
    return {
      class_source: fs?.class_source ?? 'student_record',
      class_editable: fs?.class_editable ?? false,
      review_state: fs?.review_state ?? 'confirmed',
      identity_editable: fs?.identity_editable ?? false,
    }
  })
  const classEditable = computed(() => fieldState.value.class_editable === true)
  const identityEditable = computed(() => fieldState.value.identity_editable === true)

  function currentQueryCredentials(): QueryCredentials {
    return {
      mode: queryMode.value,
      token: queryForm.token.trim(),
      name: queryForm.name.trim(),
      birthday: queryForm.birthday,
      parent_phone: normalizeMobile(queryForm.parent_phone),
    }
  }

  function credentialsStillCurrent(credentials: QueryCredentials): boolean {
    const current = currentQueryCredentials()
    return credentials.mode === current.mode
      && credentials.token === current.token
      && credentials.name === current.name
      && credentials.birthday === current.birthday
      && credentials.parent_phone === current.parent_phone
  }

  function credentialsEqual(a: QueryCredentials, b: QueryCredentials): boolean {
    return a.mode === b.mode
      && a.token === b.token
      && a.name === b.name
      && a.birthday === b.birthday
      && a.parent_phone === b.parent_phone
  }

  function createHydrationGuard(): QueryHydrationGuard | null {
    if (!queryResult.value || !activeQueryCredentials.value) return null
    return {
      requestId: latestQueryRequestId,
      registrationId: queryResult.value.id,
      credentials: { ...activeQueryCredentials.value },
    }
  }

  function hydrationGuardStillCurrent(guard: QueryHydrationGuard): boolean {
    return guard.requestId === latestQueryRequestId
      && queryResult.value?.id === guard.registrationId
      && activeQueryCredentials.value !== null
      && credentialsEqual(activeQueryCredentials.value, guard.credentials)
  }

  async function handleQuery() {
    // 兩種模式分流驗證 + 不同 API
    phoneTouched.value = true
    if (!phoneValid.value) return

    if (queryMode.value === 'token') {
      tokenTouched.value = true
      if (!tokenValid.value) return
      const credentials = currentQueryCredentials()
      const requestId = ++latestQueryRequestId
      queryLoading.value = true
      searchError.value = ''
      queryResult.value = null
      activeQueryCredentials.value = null
      try {
        const res = await publicQueryByToken(
          credentials.token,
          credentials.parent_phone,
        )
        if (requestId === latestQueryRequestId && credentialsStillCurrent(credentials)) {
          hydrateResult((res as { data: QueryResult }).data, credentials)
        }
      } catch (err) {
        if (requestId === latestQueryRequestId && credentialsStillCurrent(credentials)) {
          searchError.value = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
            || '查無對應報名，請確認查詢碼與手機號碼是否正確。'
        }
      } finally {
        if (requestId === latestQueryRequestId) queryLoading.value = false
      }
      return
    }

    // 三欄模式（fields）— 向後相容
    nameTouched.value = true
    birthdayTouched.value = true
    if (!nameValid.value || !birthdayValid.value) return

    const credentials = currentQueryCredentials()
    const requestId = ++latestQueryRequestId
    queryLoading.value = true
    searchError.value = ''
    queryResult.value = null
    activeQueryCredentials.value = null
    try {
      const res = await publicQueryRegistration(
        credentials.name,
        credentials.birthday,
        credentials.parent_phone,
      )
      if (requestId === latestQueryRequestId && credentialsStillCurrent(credentials)) {
        hydrateResult((res as { data: QueryResult }).data, credentials)
      }
    } catch (err) {
      // 通用錯誤：404 / 403 均一律顯示同樣訊息，不透露哪一欄錯
      if (requestId === latestQueryRequestId && credentialsStillCurrent(credentials)) {
        searchError.value = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          || '查無對應報名，請確認三項資料是否與報名時一致。'
      }
    } finally {
      if (requestId === latestQueryRequestId) queryLoading.value = false
    }
  }

  function hydrateResult(
    data: QueryResult,
    credentials?: QueryCredentials,
    guard?: QueryHydrationGuard,
  ): boolean {
    if (guard && !hydrationGuardStillCurrent(guard)) return false
    queryResult.value = data
    if (credentials) {
      activeQueryCredentials.value = {
        ...credentials,
        name: data.name,
        birthday: data.birthday,
      }
    }
    editForm.class_name = data.class_name || ''
    editForm.selectedCourses = (data.courses || []).map((c) => c.name)
    editForm.selectedSupplies = Array.isArray(data.supplies)
      ? data.supplies.map((s) => (typeof s === 'string' ? s : s.name))
      : []
    editForm.new_parent_phone = ''
    // 比照 class_name：欄位與顯示合併，一律預填目前值（不可編輯時單純唯讀顯示
    // 這個值；可編輯時直接在原地修改，是否送出 new_name/new_birthday 由送出時
    // 與 queryResult 原值比對決定，不是「留空=不變更」的獨立欄位）。
    editForm.new_name = data.name || ''
    editForm.new_birthday = data.birthday || ''
    // availability 只有「編輯課程」介面才用；查詢階段不輪詢。查詢命中→進入編輯介面時
    // 才首次抓 availability 並起 30s 輪詢（avoid 查詢頁背景空轉）。
    ensureAvailabilityPolling()
    return true
  }

  // availability 輪詢只起一次（家長可能多次重查，prevent 疊加 interval）
  const availabilityPollingStarted = ref(false)
  function ensureAvailabilityPolling() {
    if (availabilityPollingStarted.value) return
    availabilityPollingStarted.value = true
    refreshAvailability()
    startPolling(30000)
  }

  // 用當前 mode 重新查一次（給 stale 409 / 儲存後 refresh 共用）
  async function refetchCurrent(
    phoneOverride?: string,
    credentialsOverride?: QueryCredentials,
  ): Promise<QueryResult> {
    const credentials = credentialsOverride ?? activeQueryCredentials.value
    if (!credentials) throw new Error('查詢憑證已失效，請重新查詢')
    const phone = phoneOverride || credentials.parent_phone
    if (credentials.mode === 'token' && credentials.token) {
      const r = await publicQueryByToken(credentials.token, phone)
      return (r as { data: QueryResult }).data
    }
    const r = await publicQueryRegistration(
      credentials.name,
      credentials.birthday,
      phone,
    )
    return (r as { data: QueryResult }).data
  }

  // Clear error once user edits inputs again
  watch(
    () => [queryForm.token, queryForm.name, queryForm.birthday, queryForm.parent_phone, queryMode.value],
    () => {
      searchError.value = ''
      if (queryLoading.value) {
        latestQueryRequestId += 1
        queryLoading.value = false
      }
    },
    { flush: 'sync' },
  )

  // 編修連結上的 ?token= 會出現在 referer / 連結預覽縮圖等周邊；加 noindex 與
  // no-referrer，避免搜尋引擎索引 / 點外連結時把 token 帶到第三方站。
  function applyTokenPagePrivacyMeta() {
    const ensureMeta = (name: string, content: string) => {
      let m = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
      if (!m) {
        m = document.createElement('meta')
        m.setAttribute('name', name)
        document.head.appendChild(m)
      }
      m.setAttribute('content', content)
    }
    ensureMeta('robots', 'noindex,nofollow')
    ensureMeta('referrer', 'no-referrer')
  }

  // URL ?token= 直接帶入 token 模式（家長從報名 success 頁的編修連結進來的常見情境）。
  // 呼叫端於 onMounted 呼叫一次。
  function initFromRoute() {
    applyTokenPagePrivacyMeta()
    const tokenFromUrl = typeof route.query.token === 'string' ? route.query.token.trim() : ''
    if (tokenFromUrl) {
      queryForm.token = tokenFromUrl
      queryMode.value = 'token'
    }
  }

  return {
    queryMode,
    queryForm,
    queryLoading,
    queryResult,
    activeQueryCredentials,
    searchError,
    nameTouched,
    birthdayTouched,
    phoneTouched,
    tokenTouched,
    tokenValid,
    phoneValid,
    nameValid,
    birthdayErrorMsg,
    birthdayValid,
    activeQueryToken,
    canMutate,
    isPaymentLocked,
    lockedSummarySupplies,
    editForm,
    statusBadgeFor,
    waitlistCourses,
    fieldState,
    classEditable,
    identityEditable,
    handleQuery,
    createHydrationGuard,
    hydrateResult,
    refetchCurrent,
    ensureAvailabilityPolling,
    initFromRoute,
  }
}
