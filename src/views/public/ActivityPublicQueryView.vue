<template>
  <div class="public-query-page">
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <div class="page-wrapper">
      <header class="page-header">
        <div class="page-brand">
          <img
            src="/LOGO.png"
            alt="常春藤幼兒園"
            class="page-brand-logo"
            width="96"
            height="96"
          />
          <div class="page-brand-text">
            <div class="page-brand-prefix">高雄市私立</div>
            <div class="page-brand-zh">常春藤幼兒園</div>
            <div class="page-brand-en">Ivy Kindergarten</div>
          </div>
        </div>
        <div class="page-meta">
          <h1 class="page-title-main">查詢 / 修改報名資料</h1>
          <div class="page-subtitle">Query &amp; Edit Registration</div>
        </div>
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
            data-test="query-submit"
            @click="handleQuery"
          >
            {{ queryLoading ? '查詢中…' : '查詢 Search' }}
          </button>
        </div>
      </section>

      <section
        v-if="rotatedCredentialRecovery"
        class="credential-recovery"
        role="status"
        aria-live="polite"
      >
        <div>
          <strong>上一筆報名的手機已更新，請保存新查詢碼</strong>
          <p>新手機：{{ rotatedCredentialRecovery.parentPhone }}</p>
          <code>{{ rotatedCredentialRecovery.token }}</code>
        </div>
        <div class="credential-recovery-actions">
          <button type="button" class="btn btn-primary" @click="copyRotatedCredential">
            複製查詢碼
          </button>
          <button type="button" class="btn btn-secondary" @click="clearRotatedCredentialRecovery">
            我已保存
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
          <div v-if="canMutate" class="promotion-card-actions">
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
          <!-- 資安 #5：三欄查詢（無 token）載入 token-bearing 報名時，候補確認/放棄須改用查詢連結 -->
          <div v-else class="info-hint mutation-locked-hint">
            🔒 確認 / 放棄候補需使用「報名時取得的查詢連結」。請改用查詢連結開啟本頁，或聯繫校方協助。
          </div>
        </div>
      </section>

      <!-- 結果編輯區 -->
      <section v-if="queryResult" class="result-section">
        <div class="result-header">
          <h2>編輯報名資料</h2>
        </div>

        <!-- 審核中：校方尚未核對就讀資料，課程/班級可能因核對而調整 -->
        <div
          v-if="fieldState.review_state === 'school_review'"
          class="info-hint review-pending-hint"
          role="status"
          data-test="review-pending-hint"
        >
          此報名尚待校方核對就讀資料，課程與班級以校方確認結果為準。
        </div>

        <!-- 已付款完結（含超繳）：整單前台唯讀鎖定，is_paid 由後端即時計算回傳 -->
        <div
          v-if="isPaymentLocked"
          class="info-hint mutation-locked-hint"
          data-test="payment-locked-hint"
        >
          🔒 此筆報名已完成付款，為保障金流與資料一致性，無法於前台直接修改，如需異動請聯繫校方協助處理。
        </div>
        <template v-else>
          <div v-if="canMutate" class="info-hint">
            <strong>提示：</strong>您可以修改以下資料，完成後請點選「儲存修改」按鈕。
          </div>
          <!-- 資安 #5：三欄查詢（無 token）載入 token-bearing 報名時僅供檢視 -->
          <div v-else class="info-hint mutation-locked-hint">
            🔒 此報名需使用「報名時取得的查詢連結」才能修改。目前查詢僅供檢視；
            如需修改，請改用查詢連結開啟本頁，或聯繫校方協助。
          </div>
        </template>

        <!-- 候補位次摘要：依 queryResult.courses 渲染，不依賴 options 列表 -->
        <div
          v-if="waitlistCourses.length > 0"
          class="waitlist-summary"
          data-test="waitlist-summary"
        >
          <div class="waitlist-summary-title">⏳ 候補狀態</div>
          <div
            v-for="wc in waitlistCourses"
            :key="wc.course_id"
            class="waitlist-row"
          >
            <span class="waitlist-course-name">{{ wc.name }}</span>
            <span class="badge badge-waitlist">候補中</span>
            <template v-if="wc.waitlist_position != null">
              <span v-if="wc.waitlist_total === 1" class="waitlist-position waitlist-position--solo">
                您是目前唯一候補者
              </span>
              <span v-else class="waitlist-position">
                目前第 <strong>{{ wc.waitlist_position }}</strong> 位
                <span class="waitlist-total">／共 {{ wc.waitlist_total }} 位</span>
                <small v-if="wc.waitlist_position === 1" class="waitlist-hint">
                  您是下一位候補；如有空位將自動通知
                </small>
              </span>
            </template>
          </div>
        </div>

        <!-- 已付款鎖定：純文字唯讀摘要，不渲染任何表單控制項與動作按鈕 -->
        <div
          v-if="isPaymentLocked"
          class="payment-locked-summary"
          data-test="payment-locked-summary"
        >
          <div class="field-group">
            <label>幼兒姓名</label>
            <div class="readonly-text">{{ queryResult.name }}</div>
          </div>
          <div class="field-group">
            <label>幼兒生日</label>
            <div class="readonly-text">{{ queryResult.birthday || '—' }}</div>
          </div>
          <div class="field-group">
            <label>寶貝班級</label>
            <div class="readonly-text">{{ queryResult.class_name || '—' }}</div>
          </div>
          <div class="field-group">
            <label>家長手機</label>
            <div class="readonly-text">
              {{ queryResult.parent_phone || activeQueryCredentials?.parent_phone || '—' }}
            </div>
          </div>
          <div class="field-group">
            <label>才藝課班別</label>
            <div v-if="(queryResult.courses || []).length === 0" class="readonly-text">無</div>
            <ul v-else class="readonly-list">
              <li v-for="c in queryResult.courses" :key="c.name">
                {{ c.name }}
                <span v-if="c.price != null" class="price-tag">${{ c.price }}</span>
                <span v-if="c.status === 'waitlist'" class="badge badge-waitlist">候補中</span>
                <span v-else-if="c.status === 'promoted_pending'" class="qty-display is-waiting">
                  已升正式（待確認）
                </span>
              </li>
            </ul>
          </div>
          <div class="field-group">
            <label>舞蹈班代辦品</label>
            <div v-if="lockedSummarySupplies.length === 0" class="readonly-text">無</div>
            <ul v-else class="readonly-list">
              <li v-for="s in lockedSummarySupplies" :key="s.name">
                {{ s.name }}
                <span v-if="s.price != null" class="price-tag">${{ s.price }}</span>
              </li>
            </ul>
          </div>
        </div>

        <template v-else>
        <div class="field-group">
          <label>幼兒姓名</label>
          <input :value="queryResult.name" type="text" class="input-text" readonly />
          <template v-if="identityEditable">
            <label for="editNewName" class="field-sublabel">修改姓名（如有誤請填寫正確姓名）</label>
            <input
              id="editNewName"
              v-model="editForm.new_name"
              type="text"
              class="input-text"
              placeholder="留空表示不變更"
              maxlength="50"
            />
          </template>
          <div v-else class="field-hint field-hint-locked">
            <span class="field-tag">已完成審核</span>
            如姓名有誤，請聯繫校方協助更正
          </div>
        </div>

        <div class="field-group">
          <label>幼兒生日</label>
          <input :value="queryResult.birthday" type="date" class="input-text" readonly />
          <template v-if="identityEditable">
            <label for="editNewBirthday" class="field-sublabel">修改生日（如有誤請填寫正確生日）</label>
            <input
              id="editNewBirthday"
              v-model="editForm.new_birthday"
              type="date"
              class="input-text"
            />
          </template>
          <div v-else class="field-hint field-hint-locked">
            <span class="field-tag">已完成審核</span>
            如生日有誤，請聯繫校方協助更正
          </div>
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
                :disabled="courseLocked(course.name) && !editForm.selectedCourses.includes(course.name)"
                @change="onToggleCourse(course.name)"
              />
              <span class="course-text">
                {{ course.name }}
                <span class="price-tag">${{ course.price }}</span>
                <span v-if="statusBadgeFor(course.name)" class="qty-display is-waiting">
                  {{ statusBadgeFor(course.name) }}
                </span>
                <span
                  v-if="courseLocked(course.name) && !editForm.selectedCourses.includes(course.name)"
                  class="qty-display is-locked"
                >
                  已額滿（不開放候補）
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
              <dd>{{ formatCurrency(feePreview.originalTotal) }}</dd>
            </div>
            <div class="fee-row">
              <dt>新應繳</dt>
              <dd>{{ formatCurrency(feePreview.newTotal) }}</dd>
            </div>
            <div class="fee-row">
              <dt>已繳</dt>
              <dd>{{ formatCurrency(feePreview.paidAmount) }}</dd>
            </div>
            <div v-if="feePreview.additionalDue > 0" class="fee-row fee-row-due">
              <dt>需補繳</dt>
              <dd>{{ formatCurrency(feePreview.additionalDue) }}</dd>
            </div>
            <div v-if="feePreview.wouldOverpay" class="fee-row fee-row-refund">
              <dt>可能退費</dt>
              <dd>{{ formatCurrency(feePreview.refundNeeded) }}</dd>
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
            :disabled="editSubmitting || saveBlocked || !canMutate"
            :title="
              !canMutate
                ? '此報名需使用報名時取得的查詢連結才能修改'
                : saveBlocked
                  ? '此修改會產生退費，請聯繫校方'
                  : ''
            "
            @click="handleSaveChanges"
          >
            {{ editSubmitting ? '儲存中…' : '儲存修改 Save' }}
          </button>
        </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { getPublicBootstrap } from '@/api/activityPublic'
import { usePublicActivityOptions } from '@/composables/usePublicActivityOptions'
import { useActivityAvailability } from '@/composables/useActivityAvailability'
import { usePublicRegistrationQuery } from '@/composables/usePublicRegistrationQuery'
import { useRegistrationEditSave } from '@/composables/useRegistrationEditSave'
import { usePromotionActions } from '@/composables/usePromotionActions'
import { toggleArrayItem } from '@/utils/arrayUtils'
// FE-3（2026-06-23 audit）：費用預覽改用全站 canonical 金額格式化（千分位 + NaN→「—」），
// 不再各自 `NT$ {{ x }}`（後端回非數字時會顯示「NT$ NaN」、且無千分位）。
import { formatCurrency } from '@/utils/currency'
import ToastStack from './components/ToastStack.vue'

interface Toast { id: number; message: string; type: string }

interface CourseOption { name: string; price?: string | number; [key: string]: unknown }
interface SupplyOption { name: string; price?: string | number; [key: string]: unknown }

const { courses: _courses, supplies: _supplies, classes: _classes, applyOptions } = usePublicActivityOptions()

// 此頁僅需 courses/supplies/classes（不用 videos）。用 bootstrap 單支 GET 取代
// loadOptions 的 4 支並行 GET，削報名尖峰對單 worker 後端的請求放大。
async function loadOptions() {
  const res = await getPublicBootstrap()
  const b = res.data
  applyOptions({
    courses: b.courses,
    supplies: b.supplies,
    classes: b.classes,
    videos: b.course_videos,
  })
}
const { availability, refresh: refreshAvailability, startPolling, stopPolling } =
  useActivityAvailability()

// 強型別轉換：composable 回傳 unknown[]，view 以強型別 computed 供模板 / 函式使用
const courses = computed(() => _courses.value as CourseOption[])
const supplies = computed(() => _supplies.value as SupplyOption[])
const classes = computed(() => (_classes.value as unknown[]).map(String))

const toasts = ref<Toast[]>([])
let toastSeq = 0
function showToast(message: string, type = 'success', duration = 4500) {
  const id = ++toastSeq
  toasts.value.push({ id, message, type })
  setTimeout(() => dismissToast(id), duration)
}
function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

// F4（2026-07-12）：查詢 / 編修草稿 / 費用試算 / 候補動作分別抽至 3 個 composable
// （src/composables/usePublicRegistrationQuery.ts / useRegistrationEditSave.ts /
// usePromotionActions.ts），詳細職責見各檔頂部說明。此檔只保留 options 載入、
// toast、生命週期，其餘綁定名稱與拆分前完全相同，template 不需改動。
const {
  queryMode, queryForm, queryLoading, queryResult, searchError,
  nameTouched, birthdayTouched, phoneTouched, tokenTouched,
  tokenValid, phoneValid, nameValid, birthdayErrorMsg, birthdayValid,
  activeQueryCredentials, activeQueryToken, canMutate, isPaymentLocked, lockedSummarySupplies,
  editForm, statusBadgeFor, waitlistCourses, fieldState, classEditable, identityEditable,
  handleQuery, createHydrationGuard, hydrateResult, refetchCurrent, initFromRoute,
} = usePublicRegistrationQuery({ refreshAvailability, startPolling })

const {
  editSubmitting, newPhoneTouched, newPhoneValid,
  rotatedCredentialRecovery, clearRotatedCredentialRecovery,
  estimatedCourseStatus, courseLocked, onToggleCourse,
  feePreview, saveBlocked, handleSaveChanges,
} = useRegistrationEditSave({
  editForm,
  queryResult,
  queryForm,
  activeQueryCredentials,
  activeQueryToken,
  courses,
  supplies,
  availability,
  createHydrationGuard,
  hydrateResult,
  refetchCurrent,
  showToast,
})

async function copyRotatedCredential() {
  const token = rotatedCredentialRecovery.value?.token
  if (!token) return
  try {
    await navigator.clipboard.writeText(token)
    showToast('新查詢碼已複製')
  } catch {
    showToast('無法自動複製，請手動選取查詢碼', 'error')
  }
}
// estimatedCourseStatus 未在 template 直接使用（內部由 feePreview 消費），但既有測試
// 透過 wrapper.vm.estimatedCourseStatus 檢視估算結果，需維持頂層綁定；void 只為滿足
// noUnusedLocals，不影響 runtime（wrapper.vm 存取不受此列是否「被使用」影響）。
void estimatedCourseStatus

const {
  pendingPromotions, promotionSubmitting,
  formatDeadline, formatCountdown,
  handleConfirmPromotion, handleDeclinePromotion,
} = usePromotionActions({
  queryResult,
  activeQueryCredentials,
  activeQueryToken,
  refetchCurrent,
  createHydrationGuard,
  hydrateResult,
  showToast,
})

function closeWindow() {
  window.close()
}

onMounted(async () => {
  initFromRoute()
  try {
    // 僅載入課程/用品/班級選項；availability 輪詢延到查詢命中、進入編輯介面才啟動
    // （ensureAvailabilityPolling，於 hydrateResult），查詢階段不輪詢。
    await loadOptions()
  } catch (err) {
    showToast((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '無法載入頁面資料', 'error')
  }
})

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.public-query-page {
  --color-bg: #fffbeb;
  --color-surface: #ffffff;
  --color-surface-muted: #fff8e1;
  --color-primary: #15803d;
  --color-primary-hover: #166534;
  --color-primary-soft: #dcfce7;
  --color-primary-contrast: #ffffff;
  --color-cta: #ea580c;
  --color-cta-hover: #c2410c;
  --color-cta-contrast: #ffffff;
  --color-text: #1f2937;
  --color-text-muted: #4b5563;
  --color-text-subtle: #6b7280;
  --color-border: #f2e6c9;
  --color-border-muted: #e5e7eb;
  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;
  --color-warning: #d97706;
  --color-success: #15803d;
  --color-required: #e11d48;
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
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.page-header {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  align-items: center;
  margin: 0;
  padding: var(--space-6) var(--space-8);
  background: #fff;
  border-bottom: 1px solid var(--color-border);
}
.page-brand {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  margin: 0;
  padding-right: var(--space-8);
  border-right: 1px solid var(--color-border);
}
.page-brand-logo {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  object-fit: contain;
  user-select: none;
}
.page-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.page-brand-prefix {
  font-size: var(--fs-sm);
  letter-spacing: 0.4em;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}
.page-brand-zh {
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--color-text);
  line-height: 1.15;
}
.page-brand-en {
  font-size: var(--fs-sm);
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-top: 4px;
}
.page-meta {
  min-width: 0;
}
.page-title-main {
  margin: 0;
  font-size: clamp(20px, 3vw, 24px);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
  line-height: 1.3;
}
.page-subtitle {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  letter-spacing: 0.08em;
  margin-top: var(--space-1);
}

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

.credential-recovery {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin: var(--space-5) var(--space-6) 0;
  padding: var(--space-4);
  color: #78350f;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
}
.credential-recovery p { margin: var(--space-1) 0; }
.credential-recovery code {
  display: inline-block;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--color-text);
}
.credential-recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-shrink: 0;
}

.result-section { padding: var(--space-6); }

.result-header {
  background: var(--color-primary);
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
.field-sublabel {
  display: block;
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  margin-top: var(--space-2);
  margin-bottom: var(--space-1);
}

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
.input-text:read-only { background-color: #f9fafb; color: var(--color-text-muted); }
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
  background: #f9fafb;
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
  background-color: var(--color-warning-soft);
  color: var(--color-warning-darker);
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
}
.btn-primary:hover:not(:disabled) {
  background-color: var(--color-cta-hover);
  border-color: var(--color-cta-hover);
  transform: translateY(-1px);
}
.btn-primary:disabled { background-color: var(--neutral-300); border-color: var(--neutral-300); color: var(--text-secondary); cursor: not-allowed; box-shadow: none; }
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
  background: var(--color-warning-hover);
}
.info-hint.promotion-hint {
  background: var(--color-warning-soft);
  border-color: var(--color-warning);
  color: var(--color-warning-darker);
}
.promotion-card {
  background: var(--color-surface);
  border: 1.5px solid #f59e0b;
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

/* 已付款鎖定：純文字唯讀摘要 */
.readonly-text {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  font-size: var(--fs-md);
  color: var(--color-text-muted);
  background: #f9fafb;
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
}
.readonly-list {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  list-style: none;
  background: #f9fafb;
  border: 1.5px solid var(--color-border-muted);
  border-radius: var(--radius-sm);
}
.readonly-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: var(--space-1) 0;
  font-size: var(--fs-md);
  color: var(--color-text-muted);
}

/* 候補位次摘要 */
.waitlist-summary {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: #fff7e6;
  border: 1px solid #f59e0b;
  border-radius: var(--radius-md);
}
.waitlist-summary-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #92400e;
  margin-bottom: var(--space-2);
}
.waitlist-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  border-top: 1px dashed #f59e0b;
}
.waitlist-row:first-of-type { border-top: none; }
.waitlist-course-name {
  font-weight: 600;
  font-size: var(--fs-sm);
  color: var(--color-text);
  margin-right: var(--space-1);
}
.badge-waitlist {
  background: #fef3c7;
  color: #b45309;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
}
.waitlist-position {
  font-size: var(--fs-sm);
  color: var(--color-text);
}
.waitlist-position strong {
  font-weight: 700;
  color: var(--color-warning);
}
.waitlist-position--solo {
  font-weight: 600;
  color: #92400e;
}
.waitlist-total {
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
}
.waitlist-hint {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-xs);
  color: var(--color-primary);
  font-weight: 500;
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
  background: var(--color-danger-soft);
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

@media (max-width: 700px) {
  .page-header {
    grid-template-columns: 1fr;
    gap: var(--space-5);
    padding: var(--space-5);
  }
  .page-brand {
    padding-right: 0;
    padding-bottom: var(--space-5);
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
@media (max-width: 600px) {
  .public-query-page { padding: 0; }
  .page-wrapper { border-radius: 0; box-shadow: none; }
  .page-brand { gap: var(--space-4); padding-bottom: var(--space-4); }
  .page-brand-logo { width: 72px; height: 72px; }
  .page-brand-prefix { font-size: var(--fs-xs); letter-spacing: 0.3em; }
  .action-buttons { flex-direction: column; }
  .action-buttons .btn { max-width: none; }
}
</style>
