import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { publicUpdateRegistration } from '@/api/activityPublic'
import type { ApiBody } from '@/api/_generated/typed'
import { computeNoticeState, type RegistrationTimeSettings } from './useRegistrationWindow'
import { toggleArrayItem } from '@/utils/arrayUtils'
import { estimateCourseStatus } from '@/utils/activityDisplay'
import {
  priceFromList,
  buildSupplySnapshotMap,
  resolveSupplyPrice,
  sumCourseFees,
  sumSupplyFees,
} from '@/utils/activityPricing'
import { TW_MOBILE_RE, normalizeMobile } from '@/utils/phone'
import type {
  QueryCredentials,
  QueryHydrationGuard,
  QueryResult,
} from './usePublicRegistrationQuery'

interface CourseOption { name: string; price?: string | number; [key: string]: unknown }
interface SupplyOption { name: string; price?: string | number; [key: string]: unknown }
interface EditForm {
  class_name: string
  selectedCourses: string[]
  selectedSupplies: string[]
  new_parent_phone: string
  new_name: string
  new_birthday: string
}

export interface RotatedCredentialRecovery {
  registrationId: number
  token: string
  parentPhone: string
}

/**
 * F4（2026-07-12）：從 ActivityPublicQueryView 抽出的「編修草稿費用試算 + 儲存」。
 *
 * feePreview 與後端 /public/update 的 diff 更新行為對齊（code review P2）：既有
 * 課程/用品用 queryResult 回的 price_snapshot 估算，新增品項才用目前 option 價
 * ——否則後台調價後，家長即使保留原品項也會被誤判 newTotal < paid → 誤擋儲存。
 * promoted_pending 佔位保留但未確認，不計費（audit C-1，2026-07-02）。
 *
 * handleSaveChanges 內含 409 stale-retry：後端以 if_unmodified_since 樂觀鎖偵測
 * 資料已被校方更新時回 409，前端自動重抓最新狀態但不自動重送（家長需重新確認
 * 新狀態下的修改是否仍合理）。
 */
export function useRegistrationEditSave({
  editForm,
  queryResult,
  queryForm,
  activeQueryCredentials,
  activeQueryToken,
  courses,
  supplies,
  availability,
  editorReady = computed(() => true),
  isRegistrationOpen = computed(() => true),
  timeInfo,
  createHydrationGuard,
  hydrateResult,
  refetchCurrent,
  showToast,
}: {
  editForm: EditForm
  queryResult: Ref<QueryResult | null>
  queryForm: { token: string; name: string; birthday: string; parent_phone: string }
  activeQueryCredentials: Ref<QueryCredentials | null>
  activeQueryToken: ComputedRef<string | null>
  courses: Ref<CourseOption[]>
  supplies: Ref<SupplyOption[]>
  availability: Ref<Record<string, number> | null>
  editorReady?: Readonly<Ref<boolean>>
  // 報名時段守衛（F5）：預設 fail-open（永遠 true / undefined），既有呼叫端
  // 不傳這兩個參數時行為完全不變。timeInfo 用於 handleSaveChanges 內以
  // 真實 Date.now() 二次確認（見下方說明），isRegistrationOpen 疊加進 saveBlocked。
  isRegistrationOpen?: Readonly<Ref<boolean>>
  timeInfo?: Ref<RegistrationTimeSettings | null | undefined>
  createHydrationGuard: () => QueryHydrationGuard | null
  hydrateResult: (
    data: QueryResult,
    credentials?: QueryCredentials,
    guard?: QueryHydrationGuard,
  ) => boolean
  refetchCurrent: (
    phoneOverride?: string,
    credentialsOverride?: QueryCredentials,
  ) => Promise<QueryResult>
  showToast: (message: string, type?: string, duration?: number) => void
}) {
  const editSubmitting = ref(false)
  const rotatedCredentialRecovery = ref<RotatedCredentialRecovery | null>(null)
  const clearRotatedCredentialRecovery = () => {
    rotatedCredentialRecovery.value = null
  }
  const newPhoneTouched = ref(false)
  const newPhoneValid = computed(() => {
    const raw = normalizeMobile(editForm.new_parent_phone)
    return raw === '' || TW_MOBILE_RE.test(raw)
  })

  // 估算修改後課程狀態 — 與後端 _attach_courses 對齊：刪後重插時依「現有名額」決定。
  // 當課程額滿（availability===0）且本生原本已 enrolled/promoted_pending 時，
  // 後端 update 排除本生自己重新計算，本生座位必然保留 → 估為 enrolled（修 P2 bug）。
  // availability[name]：>0 有名額（enrolled）、=0 無名額但開候補（依本生原狀態判定）、<0 已滿不開候補。
  function estimatedCourseStatus(courseName: string): string {
    const availabilityMap = (availability.value as Record<string, number> | null) ?? {}
    const existingCourses = queryResult.value?.courses ?? []
    return estimateCourseStatus(courseName, availabilityMap, existingCourses)
  }

  // 滿額且不開放候補（availability===-1）的課程鎖定（修 P2）：
  // 後端 _attach_courses 對「滿額且 allow_waitlist=false」fail-closed raise 400，
  // 純前端契約缺口。此處 disable checkbox + 標示，避免家長勾了注定 400 的課。
  // **保留本生既有選擇例外**：本生原 enrolled/promoted_pending 的課後端 update 排除自己、
  // 座位保留，不可鎖（否則家長一存就被自己原課 400 卡死）。
  function courseLocked(courseName: string): boolean {
    const availabilityMap = (availability.value as Record<string, number> | null) ?? {}
    const orig = (queryResult.value?.courses ?? []).find((c) => c.name === courseName)
    // 名額尚未取得、學期不相符或 catalog 載入失敗時，未知不可視為可新增；
    // 既有課仍可取消，避免把使用者卡死。
    if (!editorReady.value || availabilityMap[courseName] === undefined) return !orig
    if (availabilityMap[courseName] !== -1) return false
    if (orig?.status === 'enrolled' || orig?.status === 'promoted_pending') return false
    return true
  }

  // checkbox change 守衛：鎖定且尚未勾選的課不可加入（已勾的可取消，避免卡死）
  function onToggleCourse(courseName: string): void {
    if (courseLocked(courseName) && !editForm.selectedCourses.includes(courseName)) return
    toggleArrayItem(editForm.selectedCourses, courseName)
  }

  // 儲存前費用預覽：估算新應繳並比對已繳，及早警示退費場景。
  // 價格來源須與後端 /public/update 的 diff 更新對齊（code review P2）：未變更的課程/用品
  // 後端保留原列與 price_snapshot（不重抓價），新增品項才以目前 DB 價建立 snapshot。因此
  // 既有品項用 queryResult 回的 snapshot（courses[].price / supplies[].price）估算，新增品項
  // 才用目前 option 價——否則後台調價後，家長保留原品項也會被誤判退費而擋下儲存。
  // 候補/promoted_pending 不計費；退費警告以「已繳 > 估算新應繳」為準（與後端 409 一致）。
  const feePreview = computed(() => {
    if (!queryResult.value) return null
    const existingCourses = queryResult.value.courses ?? []
    // 既有用品的 snapshot 價 map（物件型保留、舊資料 string 跳過）；編修模式既有品項優先用此價。
    const existingSupplyPrice = buildSupplySnapshotMap(queryResult.value.supplies ?? [])
    // 課程：只算 enrolled；既有課用 snapshot 價（courses[].price），新增課才用目前 option 價。
    const newCourseTotal = sumCourseFees(editForm.selectedCourses, {
      // promoted_pending 佔位保留但未確認：後端 diff-keep 保留原 status 且計費只算
      // enrolled；estimateCourseStatus 對本生原 pending 課回 'enrolled' 是「座位保留」
      // 語意非計費語意，直接以原狀態排除。否則零改動即虛報「需補繳」、wouldOverpay
      // 用虛胖 newTotal 漏擋退費場景吃後端 409（audit C-1，2026-07-02）。
      isEnrolled: (name) => {
        const orig = existingCourses.find((c) => c.name === name)
        if (orig?.status === 'promoted_pending') return false
        return estimatedCourseStatus(name) === 'enrolled'
      },
      resolvePrice: (name) => {
        const existing = existingCourses.find((c) => c.name === name)
        return existing
          ? priceFromList(name, existingCourses)
          : priceFromList(name, courses.value)
      },
    })
    // 用品：既有品項用 snapshot 價、新增品項用目前 option 價。
    const newSupplyTotal = sumSupplyFees(editForm.selectedSupplies, {
      resolvePrice: (name) => resolveSupplyPrice(name, existingSupplyPrice, supplies.value),
    })
    const newTotal = newCourseTotal + newSupplyTotal
    const originalTotal = Number(queryResult.value.total_amount || 0)
    const paidAmount = Number(queryResult.value.paid_amount || 0)
    const wouldOverpay = newTotal < paidAmount
    return {
      originalTotal,
      newTotal,
      paidAmount,
      diff: newTotal - originalTotal,
      additionalDue: newTotal > paidAmount ? newTotal - paidAmount : 0,
      refundNeeded: wouldOverpay ? paidAmount - newTotal : 0,
      wouldOverpay,
      hasChange: newTotal !== originalTotal,
    }
  })

  const saveBlocked = computed(
    () => !editorReady.value || Boolean(feePreview.value?.wouldOverpay) || !isRegistrationOpen.value,
  )

  async function handleSaveChanges() {
    // F5：報名時段二次確認（先於既有欄位檢查）。isRegistrationOpen 依賴
    // useRegistrationWindow 的 30s reactive tick，家長開著分頁很久時可能還沒
    // 反映最新截止狀態；此處用真實 Date.now() 重新算一次 timeInfo，攔下「畫面
    // 尚未鎖但實際已截止」的邊界情況。timeInfo 未傳（呼叫端未接線）時跳過，
    // 完全 fail-open、不影響既有呼叫端行為。
    if (timeInfo && computeNoticeState(timeInfo.value || {}, Date.now())?.blocking) {
      showToast('報名時段已變更（可能已截止），請重新查詢以確認目前狀態。', 'warning', 6000)
      return
    }
    if (!editForm.class_name) {
      showToast('請選擇班級', 'error')
      return
    }
    // 姓名/生日欄位與顯示合併（比照 class_name）：不可編輯時單純唯讀顯示現值，
    // 一定非空；可編輯時使用者可能手滑清空，此時不可靜默視為「不變更」，否則
    // 畫面顯示空白但儲存後又跳回舊值，會讓人誤以為送出失敗。
    if (!editForm.new_name.trim()) {
      showToast('請填寫學生姓名', 'error')
      return
    }
    if (!editForm.new_birthday) {
      showToast('請選擇學生生日', 'error')
      return
    }
    if (!editorReady.value) {
      showToast('課程與名額資料尚未就緒，請稍後再試', 'warning', 6000)
      return
    }
    if (saveBlocked.value) {
      showToast('此修改會產生退費，請聯繫校方協助處理', 'warning', 6000)
      return
    }

    const credentials = activeQueryCredentials.value
    if (!credentials) {
      showToast('查詢憑證已失效，請重新查詢', 'error')
      return
    }
    const guard = createHydrationGuard()
    if (!guard) {
      showToast('查詢結果已變更，請重新操作', 'error')
      return
    }
    const oldPhone = credentials.parent_phone
    const newPhoneRaw = normalizeMobile(editForm.new_parent_phone)
    if (newPhoneRaw && !TW_MOBILE_RE.test(newPhoneRaw)) {
      newPhoneTouched.value = true
      showToast('新手機號碼格式錯誤', 'error')
      return
    }
    const phoneWillChange = newPhoneRaw && newPhoneRaw !== oldPhone

    // 待審核期間家長自助更正姓名/生日（field_state.identity_editable 才會出現這兩個
    // 輸入框；後端仍會以 pending_review 權威覆核，前端這裡只做「有無填寫且與現值
    // 不同」的判斷，不重複做審核狀態檢查）。
    const newNameRaw = editForm.new_name.trim()
    const nameWillChange = Boolean(newNameRaw && newNameRaw !== queryResult.value!.name)
    const newBirthdayRaw = editForm.new_birthday
    const birthdayWillChange = Boolean(
      newBirthdayRaw && newBirthdayRaw !== queryResult.value!.birthday,
    )

    editSubmitting.value = true
    try {
      // 契約 PublicCourseItem/PublicSupplyItem 只收 name（價格後端以 DB price_snapshot 為準）
      const coursesPayload = editForm.selectedCourses.map((name) => ({ name }))
      const suppliesPayload = editForm.selectedSupplies.map((name) => ({ name }))

      const payload: ApiBody<'/activity/public/update', 'post'> = {
        id: queryResult.value!.id,
        name: queryResult.value!.name,
        birthday: queryResult.value!.birthday || credentials.birthday,
        parent_phone: oldPhone,
        class: editForm.class_name,
        courses: coursesPayload,
        supplies: suppliesPayload,
        remark: '',
      }
      if (phoneWillChange) {
        payload.new_parent_phone = newPhoneRaw
      }
      if (nameWillChange) {
        payload.new_name = newNameRaw
      }
      if (birthdayWillChange) {
        payload.new_birthday = newBirthdayRaw
      }
      // 樂觀鎖：把當前查詢回來的 updated_at 帶回去，後端比對不符即拒（409）
      if (queryResult.value!.updated_at) {
        payload.if_unmodified_since = queryResult.value!.updated_at
      }
      // 資安 #5：token-bearing 報名修改需帶 query_token（舊報名為 null，後端沿用三欄）
      if (activeQueryToken.value) {
        payload.query_token = activeQueryToken.value
      }
      const res = await publicUpdateRegistration(payload)

      showToast((res as { data?: { message?: string } })?.data?.message || '資料更新成功！', 'success')
      // 查詢碼由三欄位 + server secret 派生；換手機或改姓名/生日後後端重派生並回
      // 新明文 token（rotated_query_token，僅此一次），立即替換手上舊 token，否則
      // 後續 mutation 全 404。（無 token 的舊報名不重派生，見後端 helper docstring）
      const rotatedToken = (res as { data?: { rotated_query_token?: string | null } })?.data?.rotated_query_token
      // 後端 update response 已含完整 registration（含 field_state 與新 updated_at），
      // 直接 hydrate 即可，不需再打一次 publicQueryRegistration。hydrateResult 內部
      // 已用 response 的 name/birthday 覆寫 credentials，姓名/生日異動不需要在這裡
      // 額外處理；只有 parent_phone 需要在此手動接手（hydrateResult 不會從 data
      // 覆寫 phone，沿用呼叫端傳入值）。
      const hydrated = hydrateResult((res as { data: QueryResult }).data, {
        ...credentials,
        token: rotatedToken || credentials.token,
        parent_phone: phoneWillChange ? newPhoneRaw : oldPhone,
      }, guard)
      if (hydrated) {
        if (phoneWillChange) queryForm.parent_phone = newPhoneRaw
        if (nameWillChange) queryForm.name = newNameRaw
        if (birthdayWillChange) queryForm.birthday = newBirthdayRaw
        if (rotatedToken) queryForm.token = rotatedToken
        rotatedCredentialRecovery.value = null
      } else if (rotatedToken && (phoneWillChange || nameWillChange || birthdayWillChange)) {
        // mutation 已成功但使用者已切到另一筆查詢：不能覆蓋新畫面，亦不能丟掉
        // 僅回傳一次的新 token。獨立保存並由 view 顯示，讓家長可複製後再關閉。
        // parentPhone 沿用實際生效的手機（電話沒變時仍是 oldPhone，token 是因姓名/
        // 生日異動而重派生，並非電話變了）。
        rotatedCredentialRecovery.value = {
          registrationId: guard.registrationId,
          token: rotatedToken,
          parentPhone: phoneWillChange ? newPhoneRaw : oldPhone,
        }
        showToast('上一筆報名的查詢碼已更新，請先保存畫面上的新查詢碼', 'warning', 10000)
      }
    } catch (err) {
      const apiErr = err as { response?: { status?: number; data?: { detail?: string } } }
      const status = apiErr.response?.status
      const detail = apiErr.response?.data?.detail
      // 409 stale：資料已被校方更新。提示家長 + 自動重抓最新狀態，但不自動重送
      // （家長要重新確認新狀態下的修改是否仍合理）。
      if (status === 409 && typeof detail === 'string' && detail.includes('資料已被校方更新')) {
        showToast('資料已被校方更新，已為您重新整理最新狀態', 'warning', 6000)
        // stale 時 update 並未成功，後端 reg.parent_phone 仍是舊號，重新查詢用 oldPhone
        try {
          const refreshed = await refetchCurrent(oldPhone, guard.credentials)
          hydrateResult(refreshed, undefined, guard)
        } catch (refreshErr) {
          showToast((refreshErr as { response?: { data?: { detail?: string } } }).response?.data?.detail || '重新整理失敗，請手動重新查詢', 'error')
        }
        return
      }
      showToast(detail || '更新失敗', 'error')
    } finally {
      editSubmitting.value = false
    }
  }

  return {
    editSubmitting,
    rotatedCredentialRecovery,
    clearRotatedCredentialRecovery,
    newPhoneTouched,
    newPhoneValid,
    estimatedCourseStatus,
    courseLocked,
    onToggleCourse,
    feePreview,
    saveBlocked,
    handleSaveChanges,
  }
}
