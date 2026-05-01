<template>
  <div class="public-query-page">
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        :role="t.type === 'error' ? 'alert' : 'status'"
      >
        <div class="toast-icon" v-html="TOAST_ICONS[t.type] || TOAST_ICONS.info" />
        <div class="toast-content">
          <div class="toast-message">{{ t.message }}</div>
        </div>
        <button type="button" class="toast-close" aria-label="關閉通知" @click="dismissToast(t.id)">&times;</button>
      </div>
    </div>

    <div class="page-wrapper">
      <header class="page-header">
        <div class="page-title-main">查詢 / 修改報名資料</div>
        <div class="page-subtitle">Query &amp; Edit Registration</div>
      </header>

      <!-- 搜尋區 -->
      <section class="search-section">
        <div class="search-box">
          <div class="mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              :aria-selected="queryMode === 'token'"
              :class="['mode-tab', { active: queryMode === 'token' }]"
              @click="queryMode = 'token'"
            >查詢碼 + 手機</button>
            <button
              type="button"
              role="tab"
              :aria-selected="queryMode === 'fields'"
              :class="['mode-tab', { active: queryMode === 'fields' }]"
              @click="queryMode = 'fields'"
            >姓名 + 生日 + 手機</button>
          </div>

          <template v-if="queryMode === 'token'">
            <div class="field-group">
              <label for="searchToken">查詢碼 <span class="required-mark">*</span></label>
              <input
                id="searchToken"
                v-model="queryForm.token"
                type="text"
                class="input-text"
                :class="{ valid: tokenValid, invalid: tokenTouched && !tokenValid }"
                placeholder="請貼上報名後收到的查詢碼"
                autocomplete="off"
                @keyup.enter="handleQuery"
                @blur="tokenTouched = true"
              />
              <div v-if="tokenTouched && !tokenValid" class="validation-msg error">
                請輸入查詢碼
              </div>
            </div>
            <div class="field-group">
              <label for="searchPhone">家長手機 <span class="required-mark">*</span></label>
              <input
                id="searchPhone"
                v-model="queryForm.parent_phone"
                type="tel"
                class="input-text"
                :class="{ valid: phoneValid, invalid: phoneTouched && !phoneValid }"
                placeholder="09xx-xxx-xxx"
                maxlength="15"
                @keyup.enter="handleQuery"
                @blur="phoneTouched = true"
              />
              <div v-if="phoneTouched && !phoneValid" class="validation-msg error">
                請輸入 09 開頭的 10 碼手機號碼
              </div>
            </div>
          </template>

          <template v-else>
            <div class="field-group">
              <label for="searchName">幼兒姓名 <span class="required-mark">*</span></label>
              <input
                id="searchName"
                v-model="queryForm.name"
                type="text"
                class="input-text"
                :class="{ valid: nameValid, invalid: nameTouched && !nameValid }"
                placeholder="請輸入幼兒姓名"
                @keyup.enter="handleQuery"
                @blur="nameTouched = true"
              />
              <div v-if="nameTouched && !nameValid" class="validation-msg error">請輸入幼兒姓名</div>
            </div>
            <div class="field-group">
              <label for="searchBirthday">幼兒生日 <span class="required-mark">*</span></label>
              <input
                id="searchBirthday"
                v-model="queryForm.birthday"
                type="date"
                class="input-text"
                :class="{ valid: birthdayValid, invalid: birthdayTouched && !birthdayValid }"
                @blur="birthdayTouched = true"
              />
              <div v-if="birthdayTouched && !birthdayValid" class="validation-msg error">
                {{ birthdayErrorMsg }}
              </div>
            </div>
            <div class="field-group">
              <label for="searchPhoneFields">家長手機 <span class="required-mark">*</span></label>
              <input
                id="searchPhoneFields"
                v-model="queryForm.parent_phone"
                type="tel"
                class="input-text"
                :class="{ valid: phoneValid, invalid: phoneTouched && !phoneValid }"
                placeholder="09xx-xxx-xxx"
                maxlength="15"
                @keyup.enter="handleQuery"
                @blur="phoneTouched = true"
              />
              <div v-if="phoneTouched && !phoneValid" class="validation-msg error">
                請輸入 09 開頭的 10 碼手機號碼
              </div>
            </div>
          </template>

          <button
            type="button"
            class="btn btn-primary btn-block"
            :disabled="queryLoading"
            @click="handleQuery"
          >
            {{ queryLoading ? '查詢中…' : '查詢 Search' }}
          </button>
        </div>
      </section>

      <section v-if="searchError" class="result-section">
        <div class="error-message">{{ searchError }}</div>
        <div class="not-found-help">
          <div class="not-found-title">常見原因</div>
          <ul class="not-found-list">
            <li>姓名包含全形/半形空格或別字（請與報名表填寫完全一致）</li>
            <li>幼兒生日西元年月日格式錯誤</li>
            <li>家長手機與報名時填寫的不同（如已換號請使用舊號查詢）</li>
            <li>本學期尚未報名，或已由校方取消報名</li>
          </ul>
          <div class="not-found-cta">
            如三項資料皆確認無誤，請於上班時間來電聯繫校方協助查詢。
          </div>
        </div>
      </section>

      <!-- 候補已升正式待確認 -->
      <section v-if="pendingPromotions.length > 0" class="result-section">
        <div class="result-header promotion-header">
          <h2>🎉 您有候補已升為正式</h2>
        </div>
        <div class="info-hint promotion-hint">
          <strong>須於期限前確認：</strong>請於各項目截止時間前完成確認，
          逾期系統將自動釋出給下一位候補。
        </div>
        <div
          v-for="item in pendingPromotions"
          :key="`pending-${item.course_id}`"
          class="promotion-card"
        >
          <div class="promotion-card-header">
            <span class="promotion-course-name">{{ item.name }}</span>
            <span class="promotion-price">${{ item.price }}</span>
          </div>
          <div class="promotion-card-deadline">
            截止：{{ formatDeadline(item.confirm_deadline) }}
            <span class="promotion-countdown">（{{ formatCountdown(item.confirm_deadline) }}）</span>
          </div>
          <div class="promotion-card-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="promotionSubmitting === item.course_id"
              @click="handleConfirmPromotion(item)"
            >
              {{ promotionSubmitting === item.course_id ? '處理中…' : '確認參加' }}
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="promotionSubmitting === item.course_id"
              @click="handleDeclinePromotion(item)"
            >
              放棄此位
            </button>
          </div>
        </div>
      </section>

      <!-- 結果編輯區 -->
      <section v-if="queryResult" class="result-section">
        <div class="result-header">
          <h2>編輯報名資料</h2>
        </div>

        <div class="info-hint">
          <strong>提示：</strong>您可以修改以下資料，完成後請點選「儲存修改」按鈕。
        </div>

        <div class="field-group">
          <label>幼兒姓名</label>
          <input :value="queryResult.name" type="text" class="input-text" readonly />
        </div>

        <div class="field-group">
          <label>幼兒生日</label>
          <input :value="queryResult.birthday" type="date" class="input-text" readonly />
        </div>

        <div class="field-group">
          <label>寶貝班級</label>
          <template v-if="classEditable">
            <select v-model="editForm.class_name" class="input-select">
              <option value="" disabled>請選擇班級</option>
              <option v-for="cls in classes" :key="cls" :value="cls">{{ cls }}</option>
            </select>
            <div class="field-hint">家長填寫班級，校方確認後可能調整</div>
          </template>
          <template v-else>
            <input :value="editForm.class_name" type="text" class="input-text" readonly />
            <div class="field-hint field-hint-locked">
              <span class="field-tag">依園所系統資料</span>
              如班級有誤，請聯繫校方協助調整
            </div>
          </template>
        </div>

        <div class="field-group">
          <label for="editNewPhone">家長手機（如需變更請填寫新號碼）</label>
          <input
            id="editNewPhone"
            v-model="editForm.new_parent_phone"
            type="tel"
            class="input-text"
            :class="{ invalid: newPhoneTouched && !newPhoneValid }"
            placeholder="留空表示不變更"
            maxlength="15"
            @blur="newPhoneTouched = true"
          />
          <div v-if="newPhoneTouched && !newPhoneValid" class="validation-msg error">
            請輸入 09 開頭的 10 碼手機號碼
          </div>
        </div>

        <div class="field-group">
          <label>才藝課班別</label>
          <div class="checkbox-group">
            <div v-if="courses.length === 0" class="empty-hint">目前尚無可選課程</div>
            <label
              v-for="course in courses"
              v-else
              :key="course.name"
              class="course-item"
            >
              <input
                type="checkbox"
                :value="course.name"
                :checked="editForm.selectedCourses.includes(course.name)"
                @change="toggleArrayItem(editForm.selectedCourses, course.name)"
              />
              <span class="course-text">
                {{ course.name }}
                <span class="price-tag">${{ course.price }}</span>
                <span v-if="statusBadgeFor(course.name)" class="qty-display is-waiting">
                  {{ statusBadgeFor(course.name) }}
                </span>
              </span>
            </label>
          </div>
        </div>

        <div class="field-group">
          <label>舞蹈班代辦品</label>
          <div class="checkbox-group">
            <div v-if="supplies.length === 0" class="empty-hint">目前沒有代辦用品</div>
            <label
              v-for="supply in supplies"
              v-else
              :key="supply.name"
              class="course-item"
            >
              <input
                type="checkbox"
                :value="supply.name"
                :checked="editForm.selectedSupplies.includes(supply.name)"
                @change="toggleArrayItem(editForm.selectedSupplies, supply.name)"
              />
              <span class="course-text">
                {{ supply.name }}
                <span class="price-tag">${{ supply.price }}</span>
              </span>
            </label>
          </div>
        </div>

        <div v-if="feePreview" class="fee-preview" :class="{ 'fee-preview-warn': feePreview.wouldOverpay }">
          <div class="fee-preview-title">費用預覽（估算）</div>
          <dl class="fee-preview-list">
            <div class="fee-row">
              <dt>原應繳</dt>
              <dd>NT$ {{ feePreview.originalTotal }}</dd>
            </div>
            <div class="fee-row">
              <dt>新應繳</dt>
              <dd>NT$ {{ feePreview.newTotal }}</dd>
            </div>
            <div class="fee-row">
              <dt>已繳</dt>
              <dd>NT$ {{ feePreview.paidAmount }}</dd>
            </div>
            <div v-if="feePreview.additionalDue > 0" class="fee-row fee-row-due">
              <dt>需補繳</dt>
              <dd>NT$ {{ feePreview.additionalDue }}</dd>
            </div>
            <div v-if="feePreview.wouldOverpay" class="fee-row fee-row-refund">
              <dt>可能退費</dt>
              <dd>NT$ {{ feePreview.refundNeeded }}</dd>
            </div>
          </dl>
          <div v-if="feePreview.wouldOverpay" class="fee-preview-msg">
            <strong>此修改會產生退費</strong>，無法於前台直接沖帳，請聯繫校方協助處理。
          </div>
          <div v-else class="fee-preview-note">
            * 估算值，候補課程升正式時才會計入應繳。
          </div>
        </div>

        <div class="action-buttons">
          <button type="button" class="btn btn-outline" @click="closeWindow">取消 Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="editSubmitting || saveBlocked"
            :title="saveBlocked ? '此修改會產生退費，請聯繫校方' : ''"
            @click="handleSaveChanges"
          >
            {{ editSubmitting ? '儲存中…' : '儲存修改 Save' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  publicQueryRegistration,
  publicQueryByToken,
  publicUpdateRegistration,
  publicConfirmPromotion,
  publicDeclinePromotion,
} from '@/api/activityPublic'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { toggleArrayItem } from '@/utils/arrayUtils'

const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
}

const { courses, supplies, classes, loadOptions } = usePublicActivityOptions()
const { availability, refresh: refreshAvailability, startPolling, stopPolling } =
  useActivityAvailability()

// 查詢模式：'token' 用查詢碼+手機（Phase 3）；'fields' 用姓名+生日+手機（向後相容）
// 預設 'fields'（最小驚訝：既有家長進來看到熟悉 UI）；URL 帶 ?token= 時 onMounted 切到 token 模式
const route = useRoute()
const queryMode = ref('fields')

const queryForm = reactive({ token: '', name: '', birthday: '', parent_phone: '' })
const queryLoading = ref(false)
const queryResult = ref(null)
const searchError = ref('')
const nameTouched = ref(false)
const birthdayTouched = ref(false)
const phoneTouched = ref(false)
const tokenTouched = ref(false)
const tokenValid = computed(() => queryForm.token.trim().length >= 8)

const TW_MOBILE_RE = /^09\d{8}$/
function normalizeMobile(raw) {
  return String(raw || '').replace(/[\s\-().]/g, '')
}
const phoneValid = computed(() =>
  TW_MOBILE_RE.test(normalizeMobile(queryForm.parent_phone))
)

const editForm = reactive({
  class_name: '',
  selectedCourses: [],
  selectedSupplies: [],
  new_parent_phone: '',
})
const editSubmitting = ref(false)
const newPhoneTouched = ref(false)
const newPhoneValid = computed(() => {
  const raw = normalizeMobile(editForm.new_parent_phone)
  return raw === '' || TW_MOBILE_RE.test(raw)
})

const toasts = ref([])
let toastSeq = 0
function showToast(message, type = 'success', duration = 4500) {
  const id = ++toastSeq
  toasts.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), duration)
}
function dismissToast(id) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

const nameValid = computed(() => queryForm.name.trim().length > 0)
const birthdayErrorMsg = ref('請選擇幼兒生日')
const birthdayValid = computed(() => {
  if (!queryForm.birthday) {
    birthdayErrorMsg.value = '請選擇幼兒生日'
    return false
  }
  const date = new Date(queryForm.birthday)
  const now = new Date()
  if (date > now) {
    birthdayErrorMsg.value = '生日不能是未來的日期'
    return false
  }
  // 與後端 20 年窗口同步：查詢時也擋明顯不合理的生日，避免 round-trip 才失敗
  const earliest = new Date(now)
  earliest.setFullYear(earliest.getFullYear() - 20)
  if (date < earliest) {
    birthdayErrorMsg.value = '生日超出合理範圍'
    return false
  }
  return true
})

function statusBadgeFor(name) {
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

// 候補已升正式待確認清單（供獨立確認區塊使用）
const pendingPromotions = computed(() => {
  if (!queryResult.value) return []
  return (queryResult.value.courses || []).filter(
    (c) => c.status === 'promoted_pending' && c.confirm_deadline,
  )
})

// field_state 由後端決定。Fallback 預設為「已比對」，保守鎖住班級欄位避免
// 舊版後端漏回此欄位時 UI 出現可改 → 後端覆寫的不一致。
const fieldState = computed(() => {
  const fs = queryResult.value?.field_state
  return {
    class_source: fs?.class_source ?? 'student_record',
    class_editable: fs?.class_editable ?? false,
    review_state: fs?.review_state ?? 'confirmed',
  }
})
const classEditable = computed(() => fieldState.value.class_editable === true)

// 估算修改後課程狀態 — 與後端 _attach_courses 對齊：刪後重插時依「現有名額」決定。
// 因此 availability 優先於原狀態（例：原本 waitlist、現在退一位空出 → 估為 enrolled）。
// availability[name]：>0 有名額（enrolled）、=0 無名額但開候補（waitlist）、<0 已滿不開候補。
function estimatedCourseStatus(courseName) {
  const remaining = availability.value?.[courseName]
  if (remaining > 0) return 'enrolled'
  if (remaining === 0) return 'waitlist'
  if (remaining === undefined) {
    const orig = (queryResult.value?.courses || []).find((c) => c.name === courseName)
    return orig?.status ?? 'enrolled'
  }
  return 'enrolled'
}

// 儲存前費用預覽：估算新應繳並比對已繳，及早警示退費場景。
// 與後端 /public/update 的 _attach_courses 一致：以「目前」課程/用品價格估算，
// 候補/promoted_pending 不計費。退費警告以「已繳 > 估算新應繳」為準（與後端 409 一致）。
const feePreview = computed(() => {
  if (!queryResult.value) return null
  const newCourseTotal = editForm.selectedCourses.reduce((sum, name) => {
    if (estimatedCourseStatus(name) !== 'enrolled') return sum
    const opt = courses.value.find((c) => c.name === name)
    return sum + Number(opt?.price ?? 0)
  }, 0)
  const newSupplyTotal = editForm.selectedSupplies.reduce((sum, name) => {
    const opt = supplies.value.find((s) => s.name === name)
    return sum + Number(opt?.price ?? 0)
  }, 0)
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

const saveBlocked = computed(() => Boolean(feePreview.value?.wouldOverpay))

function formatDeadline(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

function formatCountdown(iso) {
  if (!iso) return ''
  const diffMs = new Date(iso).getTime() - Date.now()
  if (diffMs <= 0) return '已逾期'
  const hours = Math.floor(diffMs / 3600000)
  const mins = Math.floor((diffMs % 3600000) / 60000)
  return hours >= 1 ? `剩 ${hours} 小時` : `剩 ${mins} 分鐘`
}

const promotionSubmitting = ref(null)

async function handleConfirmPromotion(item) {
  promotionSubmitting.value = item.course_id
  try {
    const phonePayload = normalizeMobile(queryForm.parent_phone)
    const res = await publicConfirmPromotion(queryResult.value.id, item.course_id, {
      name: queryResult.value.name,
      birthday: queryResult.value.birthday || queryForm.birthday,
      parent_phone: phonePayload,
    })
    showToast(res?.data?.message || '已確認升為正式', 'success')
    // 重新查詢以更新狀態
    const refreshed = await publicQueryRegistration(
      queryResult.value.name,
      queryResult.value.birthday || queryForm.birthday,
      phonePayload,
    )
    hydrateResult(refreshed.data)
  } catch (err) {
    showToast(err.response?.data?.detail || '確認失敗', 'error')
  } finally {
    promotionSubmitting.value = null
  }
}

async function handleDeclinePromotion(item) {
  if (!window.confirm(`確定要放棄「${item.name}」的正式名額？\n放棄後將遞補給下一位候補，無法復原。`)) {
    return
  }
  promotionSubmitting.value = item.course_id
  try {
    const phonePayload = normalizeMobile(queryForm.parent_phone)
    const res = await publicDeclinePromotion(queryResult.value.id, item.course_id, {
      name: queryResult.value.name,
      birthday: queryResult.value.birthday || queryForm.birthday,
      parent_phone: phonePayload,
    })
    showToast(res?.data?.message || '已放棄該名額', 'warning')
    const refreshed = await publicQueryRegistration(
      queryResult.value.name,
      queryResult.value.birthday || queryForm.birthday,
      phonePayload,
    )
    hydrateResult(refreshed.data)
  } catch (err) {
    showToast(err.response?.data?.detail || '放棄失敗', 'error')
  } finally {
    promotionSubmitting.value = null
  }
}

async function handleQuery() {
  // 兩種模式分流驗證 + 不同 API
  phoneTouched.value = true
  if (!phoneValid.value) return

  if (queryMode.value === 'token') {
    tokenTouched.value = true
    if (!tokenValid.value) return
    queryLoading.value = true
    searchError.value = ''
    queryResult.value = null
    try {
      const res = await publicQueryByToken(
        queryForm.token.trim(),
        normalizeMobile(queryForm.parent_phone),
      )
      hydrateResult(res.data)
    } catch (err) {
      searchError.value = err.response?.data?.detail
        || '查無對應報名，請確認查詢碼與手機號碼是否正確。'
    } finally {
      queryLoading.value = false
    }
    return
  }

  // 三欄模式（fields）— 向後相容
  nameTouched.value = true
  birthdayTouched.value = true
  if (!nameValid.value || !birthdayValid.value) return

  queryLoading.value = true
  searchError.value = ''
  queryResult.value = null
  try {
    const res = await publicQueryRegistration(
      queryForm.name.trim(),
      queryForm.birthday,
      normalizeMobile(queryForm.parent_phone)
    )
    hydrateResult(res.data)
  } catch (err) {
    // 通用錯誤：404 / 403 均一律顯示同樣訊息，不透露哪一欄錯
    searchError.value = err.response?.data?.detail
      || '查無對應報名，請確認三項資料是否與報名時一致。'
  } finally {
    queryLoading.value = false
  }
}

function hydrateResult(data) {
  queryResult.value = data
  editForm.class_name = data.class_name || ''
  editForm.selectedCourses = (data.courses || []).map((c) => c.name)
  editForm.selectedSupplies = Array.isArray(data.supplies)
    ? data.supplies.map((s) => (typeof s === 'string' ? s : s.name))
    : []
  editForm.new_parent_phone = ''
  newPhoneTouched.value = false
}

// 用當前 mode 重新查一次（給 stale 409 / 儲存後 refresh 共用）
async function refetchCurrent(phoneOverride) {
  const phone = phoneOverride || normalizeMobile(queryForm.parent_phone)
  if (queryMode.value === 'token' && queryForm.token) {
    const r = await publicQueryByToken(queryForm.token.trim(), phone)
    return r.data
  }
  const r = await publicQueryRegistration(
    queryResult.value?.name || queryForm.name.trim(),
    queryResult.value?.birthday || queryForm.birthday,
    phone,
  )
  return r.data
}

async function handleSaveChanges() {
  if (!editForm.class_name) {
    showToast('請選擇班級', 'error')
    return
  }
  if (saveBlocked.value) {
    showToast('此修改會產生退費，請聯繫校方協助處理', 'warning', 6000)
    return
  }

  const oldPhone = normalizeMobile(queryForm.parent_phone)
  const newPhoneRaw = normalizeMobile(editForm.new_parent_phone)
  if (newPhoneRaw && !TW_MOBILE_RE.test(newPhoneRaw)) {
    newPhoneTouched.value = true
    showToast('新手機號碼格式錯誤', 'error')
    return
  }
  const phoneWillChange = newPhoneRaw && newPhoneRaw !== oldPhone

  editSubmitting.value = true
  try {
    const coursesPayload = editForm.selectedCourses.map((name) => {
      const c = courses.value.find((x) => x.name === name)
      return { name, price: String(c?.price ?? 0) }
    })
    const suppliesPayload = editForm.selectedSupplies.map((name) => {
      const s = supplies.value.find((x) => x.name === name)
      return { name, price: String(s?.price ?? 0) }
    })

    const payload = {
      id: queryResult.value.id,
      name: queryResult.value.name,
      birthday: queryResult.value.birthday || queryForm.birthday,
      parent_phone: oldPhone,
      class: editForm.class_name,
      courses: coursesPayload,
      supplies: suppliesPayload,
    }
    if (phoneWillChange) {
      payload.new_parent_phone = newPhoneRaw
    }
    // 樂觀鎖：把當前查詢回來的 updated_at 帶回去，後端比對不符即拒（409）
    if (queryResult.value.updated_at) {
      payload.if_unmodified_since = queryResult.value.updated_at
    }
    const res = await publicUpdateRegistration(payload)

    showToast(res?.data?.message || '資料更新成功！', 'success')
    if (phoneWillChange) {
      queryForm.parent_phone = newPhoneRaw
    }
    // 後端 update response 已含完整 registration（含 field_state 與新 updated_at），
    // 直接 hydrate 即可，不需再打一次 publicQueryRegistration。
    hydrateResult(res.data)
  } catch (err) {
    const status = err.response?.status
    const detail = err.response?.data?.detail
    // 409 stale：資料已被校方更新。提示家長 + 自動重抓最新狀態，但不自動重送
    // （家長要重新確認新狀態下的修改是否仍合理）。
    if (status === 409 && typeof detail === 'string' && detail.includes('資料已被校方更新')) {
      showToast('資料已被校方更新，已為您重新整理最新狀態', 'warning', 6000)
      // stale 時 update 並未成功，後端 reg.parent_phone 仍是舊號，重新查詢用 oldPhone
      try {
        const refreshed = await refetchCurrent(oldPhone)
        hydrateResult(refreshed)
      } catch (refreshErr) {
        showToast(refreshErr.response?.data?.detail || '重新整理失敗，請手動重新查詢', 'error')
      }
      return
    }
    showToast(detail || '更新失敗', 'error')
  } finally {
    editSubmitting.value = false
  }
}

function closeWindow() {
  window.close()
}

// Clear error once user edits inputs again
watch(
  () => [queryForm.token, queryForm.name, queryForm.birthday, queryForm.parent_phone, queryMode.value],
  () => { searchError.value = '' }
)

// 編修連結上的 ?token= 會出現在 referer / 連結預覽縮圖等周邊；加 noindex 與
// no-referrer，避免搜尋引擎索引 / 點外連結時把 token 帶到第三方站。
function applyTokenPagePrivacyMeta() {
  const ensureMeta = (name, content) => {
    let m = document.head.querySelector(`meta[name="${name}"]`)
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

onMounted(async () => {
  applyTokenPagePrivacyMeta()
  // URL ?token= 直接帶入 token 模式（家長從報名 success 頁的編修連結進來的常見情境）
  const tokenFromUrl = typeof route.query.token === 'string' ? route.query.token.trim() : ''
  if (tokenFromUrl) {
    queryForm.token = tokenFromUrl
    queryMode.value = 'token'
  }
  try {
    await Promise.all([loadOptions(), refreshAvailability()])
    startPolling(30000)
  } catch (err) {
    showToast(err?.response?.data?.detail || '無法載入頁面資料', 'error')
  }
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.public-query-page {
  --color-bg: #FFFBEB;
  --color-surface: #FFFFFF;
  --color-surface-muted: #FFF8E1;
  --color-primary: #15803D;
  --color-primary-hover: #166534;
  --color-primary-soft: #DCFCE7;
  --color-primary-contrast: #FFFFFF;
  --color-cta: #EA580C;
  --color-cta-hover: #C2410C;
  --color-cta-contrast: #FFFFFF;
  --color-text: #1F2937;
  --color-text-muted: #4B5563;
  --color-text-subtle: #6B7280;
  --color-border: #F2E6C9;
  --color-border-muted: #E5E7EB;
  --color-danger: #DC2626;
  --color-danger-soft: #FEE2E2;
  --color-warning: #D97706;
  --color-success: #15803D;
  --color-required: #E11D48;
  --font-sans: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 15px; --fs-md: 16px; --fs-lg: 18px; --fs-xl: 22px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 24px; --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(17, 24, 39, 0.06);
  --shadow-lg: 0 12px 32px rgba(17, 24, 39, 0.10);
  --dur-fast: 150ms; --dur-slow: 320ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --focus-ring: 0 0 0 3px rgba(21, 128, 61, 0.28);

  min-height: 100vh;
  padding: clamp(12px, 3vw, 20px);
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.public-query-page *, .public-query-page *::before, .public-query-page *::after { box-sizing: border-box; }

.page-wrapper {
  max-width: 900px;
  margin: 0 auto;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.page-header {
  text-align: center;
  padding: var(--space-6) var(--space-5);
  background: linear-gradient(135deg, #FEF3C7 0%, #DCFCE7 100%);
  border-bottom: 1px solid var(--color-border);
}
.page-title-main {
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: var(--space-1);
}
.page-subtitle { font-size: var(--fs-xs); color: var(--color-text-subtle); letter-spacing: 0.05em; }

.search-section {
  padding: var(--space-6) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}
.search-box { max-width: 520px; margin: 0 auto; }

.mode-tabs {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
  padding: 4px;
  background: var(--color-surface-muted);
  border-radius: var(--radius-md);
}
.mode-tab {
  flex: 1;
  min-height: 40px;
  padding: 8px 12px;
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.mode-tab.active {
  color: var(--color-primary);
  background: var(--color-surface);
  border-color: var(--color-primary);
}
.mode-tab:not(.active):hover { background: var(--color-surface); }

.result-section { padding: var(--space-6); }

.result-header {
  background: linear-gradient(135deg, var(--color-primary) 0%, #3a8a5e 100%);
  color: #fff;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-5);
}
.result-header h2 { margin: 0; font-size: var(--fs-lg); }

.info-hint {
  background: var(--color-surface-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
}

.field-group { margin-bottom: var(--space-4); }
.field-group label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.required-mark { color: var(--color-required); font-weight: 700; }

.input-text, .input-select {
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  font-family: inherit;
  font-size: var(--fs-md);
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.input-text:focus, .input-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}
.input-text:read-only { background-color: #F9FAFB; color: var(--color-text-muted); }
.input-text.valid { border-color: var(--color-success); }
.input-text.invalid { border-color: var(--color-danger); }
.validation-msg { font-size: var(--fs-xs); margin-top: var(--space-1); }
.validation-msg.error { color: var(--color-danger); }

.input-select {
  padding-right: 36px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234B5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-height: 320px;
  overflow-y: auto;
  padding: var(--space-3);
  background: #F9FAFB;
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-md);
}
.course-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}
.course-item:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.course-item:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
.course-item input[type="checkbox"] {
  flex-shrink: 0;
  margin-top: 3px;
  width: 18px; height: 18px;
  accent-color: var(--color-primary);
}
.course-text {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.price-tag { color: var(--color-text-subtle); font-size: var(--fs-sm); font-weight: 500; }
.qty-display {
  font-weight: 600;
  font-size: var(--fs-xs);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background-color: #FEF3C7;
  color: #B45309;
}

.empty-hint {
  padding: var(--space-5);
  color: var(--color-text-subtle);
  font-size: var(--fs-sm);
  text-align: center;
  background-color: var(--color-surface-muted);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: 12px 20px;
  font-family: inherit;
  font-size: var(--fs-md);
  font-weight: 600;
  border: 1.5px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
  white-space: nowrap;
}
.btn-block { width: 100%; margin-top: var(--space-3); }
.btn-primary {
  background-color: var(--color-cta);
  color: var(--color-cta-contrast);
  border-color: var(--color-cta);
  box-shadow: 0 6px 16px rgba(234, 88, 12, 0.25);
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
}
.btn-primary:disabled { background-color: #D1D5DB; border-color: #D1D5DB; color: #6B7280; cursor: not-allowed; box-shadow: none; }
.btn-outline {
  background: var(--color-surface);
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-outline:hover { background: var(--color-primary); color: var(--color-primary-contrast); }

.action-buttons {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--color-border);
}
.action-buttons .btn { flex: 1; max-width: 240px; }

/* 候補升正式待確認區塊 */
.result-header.promotion-header {
  background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
}
.info-hint.promotion-hint {
  background: #FEF3C7;
  border-color: #F59E0B;
  color: #92400E;
}
.promotion-card {
  background: var(--color-surface);
  border: 1.5px solid #F59E0B;
  border-radius: var(--radius-md);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.promotion-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}
.promotion-course-name { font-weight: 700; font-size: var(--fs-md); color: var(--color-text); }
.promotion-price { color: var(--color-text-muted); font-size: var(--fs-sm); }
.promotion-card-deadline {
  font-size: var(--fs-sm);
  color: var(--color-warning);
  margin-bottom: var(--space-3);
}
.promotion-countdown { font-weight: 600; }
.promotion-card-actions {
  display: flex;
  gap: var(--space-3);
}
.btn.btn-sm {
  min-height: 40px;
  padding: 8px 16px;
  font-size: var(--fs-sm);
  flex: 1;
}

.error-message {
  background: var(--color-danger-soft);
  border-left: 4px solid var(--color-danger);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-weight: 500;
}

/* 查無結果引導 */
.not-found-help {
  margin-top: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.not-found-title {
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.not-found-list {
  margin: 0 0 var(--space-3);
  padding-left: 20px;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  line-height: 1.7;
}
.not-found-cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-border);
}
.contact-link {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
}
.contact-link:hover { text-decoration: underline; }

/* 班級欄位提示 */
.field-hint {
  margin-top: var(--space-1);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
}
.field-hint-locked {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.field-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: var(--radius-full);
}

/* 費用預覽 */
.fee-preview {
  margin-top: var(--space-5);
  padding: var(--space-4);
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.fee-preview-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: var(--space-3);
}
.fee-preview-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.fee-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-sm);
  color: var(--color-text-muted);
}
.fee-row dt { margin: 0; font-weight: 500; }
.fee-row dd { margin: 0; font-variant-numeric: tabular-nums; }
.fee-row-due dt, .fee-row-due dd {
  color: var(--color-cta);
  font-weight: 700;
}
.fee-row-refund dt, .fee-row-refund dd {
  color: var(--color-danger);
  font-weight: 700;
}
.fee-preview-warn {
  background: #FEF2F2;
  border-color: var(--color-danger);
}
.fee-preview-msg {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--color-danger);
  font-size: var(--fs-sm);
  color: var(--color-danger);
  line-height: 1.6;
}
.fee-preview-note {
  margin-top: var(--space-2);
  font-size: var(--fs-xs);
  color: var(--color-text-subtle);
}

/* Toast */
.toast-container {
  position: fixed;
  top: var(--space-5);
  right: var(--space-5);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: calc(100vw - 40px);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 280px;
  max-width: 420px;
  padding: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border-left: 4px solid var(--color-primary);
}
.toast.success { border-left-color: var(--color-success); }
.toast.error { border-left-color: var(--color-danger); }
.toast.warning { border-left-color: var(--color-warning); }
.toast-icon { flex-shrink: 0; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; }
.toast-content { flex: 1; min-width: 0; }
.toast-message { font-size: var(--fs-sm); color: var(--color-text-muted); }
.toast-close {
  flex-shrink: 0;
  width: 28px; height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text-subtle);
  font-size: 20px;
  cursor: pointer;
}
.toast-close:hover { background: var(--color-surface-muted); color: var(--color-text); }

@media (max-width: 600px) {
  .public-query-page { padding: 0; }
  .page-wrapper { border-radius: 0; box-shadow: none; }
  .toast-container { top: auto; bottom: var(--space-3); right: var(--space-3); left: var(--space-3); }
  .toast { min-width: 0; max-width: none; }
  .action-buttons { flex-direction: column; }
  .action-buttons .btn { max-width: none; }
}
</style>
