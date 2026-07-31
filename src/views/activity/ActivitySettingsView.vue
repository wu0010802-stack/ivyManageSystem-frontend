<template>
  <div class="activity-settings">
    <h2>{{ PAGE_TERMS.activitySettings }}</h2>

    <el-tabs v-model="activeTab" class="settings-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="課程管理" name="courses">
        <ActivityCourseView v-if="activeTab === 'courses'" />
      </el-tab-pane>

      <el-tab-pane label="用品管理" name="supplies">
        <ActivitySupplyView v-if="activeTab === 'supplies'" />
      </el-tab-pane>

      <el-tab-pane v-if="canWrite" label="報名設定" name="registration">
        <el-card style="max-width: 720px" v-loading="loading">
          <el-alert
            class="gate-status"
            :type="gateStatus.type"
            :title="gateStatus.title"
            :description="gateStatus.description"
            show-icon
            :closable="false"
          />
          <el-form :model="form" label-width="120px">
            <el-divider content-position="left">報名開關與期間</el-divider>

            <el-form-item label="啟用報名">
              <el-switch v-model="form.is_open" active-text="啟用" inactive-text="停用" />
              <div class="field-hint">
                總開關：只決定報名功能是否啟用；實際開放時段以下方開放／截止時間為準，
                時間到會自動開放／自動截止。
              </div>
            </el-form-item>
            <el-form-item label="開放學期">
              <el-select
                v-model="termKey"
                placeholder="依系統日期自動判斷"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="opt in termOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
              <div class="field-hint">
                前台報名頁會顯示「這個學期」的課程與用品。留空則依系統日期自動判斷當期，
                在學期交界時容易與實際開放的學期對不上，建議明確指定。
              </div>
            </el-form-item>
            <el-form-item label="開放時間">
              <el-date-picker
                v-model="form.open_at"
                type="datetime"
                placeholder="選擇開放時間"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DDTHH:mm"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item label="截止時間">
              <el-date-picker
                v-model="form.close_at"
                type="datetime"
                placeholder="選擇截止時間"
                format="YYYY-MM-DD HH:mm"
                value-format="YYYY-MM-DDTHH:mm"
                style="width: 100%"
              />
            </el-form-item>

            <el-divider content-position="left">前台顯示文字</el-divider>

            <el-form-item label="頁面主標題">
              <el-input
                v-model="form.page_title"
                maxlength="200"
                show-word-limit
                placeholder="例：114 下藝童趣｜課後才藝報名"
              />
            </el-form-item>
            <el-form-item label="學期徽章">
              <el-input
                v-model="form.term_label"
                maxlength="50"
                show-word-limit
                :placeholder="autoTermLabel || '例：114 下學期'"
              />
              <div v-if="!form.term_label && autoTermLabel" class="field-hint">
                留空時前台自動顯示「{{ autoTermLabel }}」，與上方開放學期一致。
              </div>
            </el-form-item>
            <el-form-item label="活動日期">
              <el-input
                v-model="form.event_date_label"
                maxlength="50"
                show-word-limit
                placeholder="例：2026-02-23"
              />
            </el-form-item>
            <el-form-item label="對象說明">
              <el-input
                v-model="form.target_audience"
                maxlength="100"
                show-word-limit
                placeholder="例：本園在學幼兒"
              />
            </el-form-item>
            <el-form-item label="表單卡片標題">
              <el-input
                v-model="form.form_card_title"
                maxlength="200"
                show-word-limit
                placeholder="例：114 下藝童趣 · 2026-02-23"
              />
            </el-form-item>

            <el-divider content-position="left">活動海報</el-divider>

            <el-form-item label="目前海報">
              <div class="poster-row">
                <img
                  :src="posterPreview"
                  alt="目前活動海報"
                  class="poster-img"
                  @error="onPosterLoadError"
                />
                <div class="poster-actions">
                  <el-upload
                    :auto-upload="true"
                    :show-file-list="false"
                    :http-request="handlePosterUpload"
                    accept=".jpg,.jpeg,.png,.gif,.webp"
                    :before-upload="beforePosterUpload"
                  >
                    <el-button type="primary" :loading="uploading">
                      上傳新海報
                    </el-button>
                  </el-upload>
                  <div class="poster-hint">
                    支援 jpg / jpeg / png / gif / webp，單檔 ≤ 10MB。
                  </div>
                </div>
              </div>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                @click="handleSave"
                :loading="saving"
                :disabled="!settingsLoaded || saving"
              >
                儲存設定
              </el-button>
              <el-button
                v-if="settingsLoadFailed"
                :loading="loading"
                @click="fetchSettings"
              >
                重新載入
              </el-button>
            </el-form-item>
          </el-form>

          <el-alert
            v-if="savedAt"
            type="success"
            :title="`已於 ${savedAt} 儲存`"
            :closable="false"
            style="margin-top: 8px"
          />
        </el-card>
      </el-tab-pane>

      <el-tab-pane v-if="canWrite" label="候補轉正信模板" name="waitlistEmail">
        <EmailTemplateEditor
          title="候補直升正式通知信樣板"
          hint-text="管理員從報名管理刪除正式報名後，候補依序遞補時會直接升為正式報名（略過家長 48 小時確認）並寄送這封通知信。"
          :placeholders="['student_name', 'course_name', 'query_token', 'edit_url']"
          :loading="emailTemplateLoading"
          v-model:subject="emailTemplate.subject"
          v-model:body="emailTemplate.body"
          :subject-default="emailTemplate.subject_default"
          :body-default="emailTemplate.body_default"
          :email-enabled="emailTemplate.email_enabled"
          :saving="savingEmailTemplate"
          :saved-at="emailTemplateSavedAt"
          v-model:test-email="testSendEmail"
          :test-sending="testSending"
          data-test-prefix="waitlist-email"
          @save="handleSaveEmailTemplate"
          @test-send="handleTestSend"
        />
      </el-tab-pane>

      <el-tab-pane v-if="canWrite" label="報名成功模板" name="successEmail">
        <EmailTemplateEditor
          title="報名成功通知信樣板"
          hint-text="家長於前台完成報名並留下 email 時，系統會寄送這封通知信確認已收到報名資料。"
          :placeholders="[
            'student_name',
            'class_name',
            'school_year',
            'semester',
            'courses_list',
            'supplies_section',
            'total_amount',
            'query_token',
            'edit_url',
          ]"
          :loading="successEmailTemplateLoading"
          v-model:subject="successEmailTemplate.subject"
          v-model:body="successEmailTemplate.body"
          :subject-default="successEmailTemplate.subject_default"
          :body-default="successEmailTemplate.body_default"
          :email-enabled="successEmailTemplate.email_enabled"
          :saving="savingSuccessEmailTemplate"
          :saved-at="successEmailTemplateSavedAt"
          v-model:test-email="successTestSendEmail"
          :test-sending="successTestSending"
          data-test-prefix="success-email"
          @save="handleSaveSuccessEmailTemplate"
          @test-send="handleSuccessTestSend"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { h, ref, computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import type { UploadRawFile } from 'element-plus'
import {
  getRegistrationTime,
  updateRegistrationTime,
  uploadActivityPoster,
  getWaitlistPromotedEmailTemplate,
  updateWaitlistPromotedEmailTemplate,
  testSendWaitlistPromotedEmail,
  getRegistrationSuccessEmailTemplate,
  updateRegistrationSuccessEmailTemplate,
  testSendRegistrationSuccessEmail,
} from '@/api/activity'
import type { ActivityRegistrationSettingsPayload } from '@/api/activity'
import {
  buildSaveConfirmLines,
  computeGateStatus,
  taipeiNowMinuteString,
} from './registrationSettingsConfirm'
import EmailTemplateEditor from './EmailTemplateEditor.vue'
// 課程／用品兩支頁面很重（課程頁近千行），靜態 import 會把它們併進設定頁 chunk；
// 併入前它們各自是 route-level chunk，改 async 才維持原本的分包與首屏成本。
const ActivityCourseView = defineAsyncComponent(() => import('./ActivityCourseView.vue'))
const ActivitySupplyView = defineAsyncComponent(() => import('./ActivitySupplyView.vue'))
import { hasPermission } from '@/utils/auth'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import { getCurrentAcademicTerm } from '@/utils/academic'

interface SettingsForm {
  is_open: boolean
  open_at: string | null
  close_at: string | null
  // 本次開放報名的學期：決定前台報名頁看到哪個學期的課程與用品（2026-07-31）。
  // null 代表未指定，前台沿用系統日期推算當期（舊行為）。
  school_year: number | null
  semester: number | null
  page_title: string
  term_label: string
  event_date_label: string
  target_audience: string
  form_card_title: string
  poster_url: string
}

interface EmailTemplateForm {
  subject: string | null
  body: string | null
  subject_default: string
  body_default: string
  email_enabled: boolean
}

const route = useRoute()
const router = useRouter()

// 課程與用品（原 /activity/catalog）於 2026-07-31 併入本頁；日常使用的品項排前面，
// 低頻的設定與信件模板排後面。設定三個 tab 需 ACTIVITY_WRITE，唯讀角色只看得到品項。
const canWrite = hasPermission('ACTIVITY_WRITE')
const DEFAULT_TAB = 'courses'
const CATALOG_TABS = ['courses', 'supplies']
const SETTINGS_TABS = ['registration', 'waitlistEmail', 'successEmail']
const VALID_TABS = canWrite ? [...CATALOG_TABS, ...SETTINGS_TABS] : CATALOG_TABS
const queryTab = route.query.tab as string | undefined
const initialTab = queryTab && VALID_TABS.includes(queryTab) ? queryTab : DEFAULT_TAB
const activeTab = ref(initialTab)

function handleTabChange(tab: string | number) {
  const tabStr = String(tab)
  const nextQuery = { ...route.query }
  if (tabStr === DEFAULT_TAB) {
    delete nextQuery.tab
  } else {
    nextQuery.tab = tabStr
  }
  router.replace({ query: nextQuery })
}

watch(
  () => route.query.tab,
  (next) => {
    const nextStr = next as string | undefined
    if (nextStr && VALID_TABS.includes(nextStr) && nextStr !== activeTab.value) {
      activeTab.value = nextStr
    } else if (!nextStr && activeTab.value !== DEFAULT_TAB) {
      activeTab.value = DEFAULT_TAB
    }
  }
)

const DEFAULT_POSTER = '/images/activity-poster.jpg'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const savedAt = ref('')
// 初次 GET 失敗時不可讓預設空表單回寫，否則會把既有模板清成 null，甚至關閉報名。
// 只有完整載入成功後才開放儲存；失敗時提供同頁重試。
const settingsLoaded = ref(false)
const settingsLoadFailed = ref(false)

// 常駐狀態列的「現在」：30 秒 tick 一次，長開頁面時「自動開放／截止」的狀態才會跟上
const GATE_NOW_TICK_MS = 30_000
const gateNowStr = ref(taipeiNowMinuteString())
let gateNowTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  gateNowTimer = setInterval(() => {
    gateNowStr.value = taipeiNowMinuteString()
  }, GATE_NOW_TICK_MS)
})
onUnmounted(() => {
  if (gateNowTimer) clearInterval(gateNowTimer)
})

const form = ref<SettingsForm>({
  is_open: false,
  open_at: null,
  close_at: null,
  school_year: null,
  semester: null,
  page_title: '',
  term_label: '',
  event_date_label: '',
  target_audience: '',
  form_card_title: '',
  poster_url: '',
})

const gateStatus = computed(() => computeGateStatus(form.value, gateNowStr.value))

// ── 開放學期 ────────────────────────────────────────────────────────
// 這裡刻意不用全域 AcademicTermSelector：那顆綁 useAcademicTermStore，動它會連帶
// 切掉整個後台正在檢視的學期。此處只是表單上的一個欄位，狀態必須留在 form 內。
const TERM_LABEL_SUFFIX: Record<number, string> = { 1: '上學期', 2: '下學期' }

function formatTermLabel(schoolYear: number | null, semester: number | null): string {
  if (schoolYear === null || semester === null) return ''
  return `${schoolYear} ${TERM_LABEL_SUFFIX[semester] ?? ''}`
}

/** 當期前後各一學期，涵蓋「提前開放下學期報名」與「補設定上學期」兩種實務情境。 */
const termOptions = computed(() => {
  const { school_year: cy, semester: cs } = getCurrentAcademicTerm()
  const prev = cs === 1 ? { school_year: cy - 1, semester: 2 } : { school_year: cy, semester: 1 }
  const next = cs === 1 ? { school_year: cy, semester: 2 } : { school_year: cy + 1, semester: 1 }
  const list = [prev, { school_year: cy, semester: cs }, next]
  // 已存的學期若落在這三期之外（例如很久以前設定的），仍要能顯示出來而非變空白
  const saved = form.value.school_year !== null && form.value.semester !== null
    ? { school_year: form.value.school_year, semester: form.value.semester }
    : null
  if (saved && !list.some((t) => t.school_year === saved.school_year && t.semester === saved.semester)) {
    list.unshift(saved)
  }
  return list.map((t) => {
    const isCurrent = t.school_year === cy && t.semester === cs
    return {
      value: `${t.school_year}-${t.semester}`,
      label: `${t.school_year} 學年度 ${TERM_LABEL_SUFFIX[t.semester]}${isCurrent ? '（本學期）' : ''}`,
      school_year: t.school_year,
      semester: t.semester,
    }
  })
})

const termKey = computed<string | null>({
  get: () =>
    form.value.school_year !== null && form.value.semester !== null
      ? `${form.value.school_year}-${form.value.semester}`
      : null,
  set: (val) => {
    // 兩欄同進同退：後端 schema 也擋半套學期（只填一半會靜默退回日期推算當期）
    if (!val) {
      form.value.school_year = null
      form.value.semester = null
      return
    }
    const [sy, sem] = val.split('-').map(Number)
    form.value.school_year = sy
    form.value.semester = sem
  },
})

/** 學期徽章留空時前台會自動顯示的文字，讓管理員先看到再決定要不要自訂。 */
const autoTermLabel = computed(() =>
  formatTermLabel(form.value.school_year, form.value.semester)
)

const posterBroken = ref(false)

const posterPreview = computed(() => {
  if (posterBroken.value) return DEFAULT_POSTER
  const url = form.value.poster_url
  if (!url) return DEFAULT_POSTER
  // 後端路徑以 /api 開頭，前端可能已設 baseURL 另外指向後端 host
  if (url.startsWith('/api/') && API_BASE && API_BASE !== '/api') {
    return API_BASE.replace(/\/api\/?$/, '') + url
  }
  return url
})

function onPosterLoadError() {
  posterBroken.value = true
}

async function fetchSettings() {
  loading.value = true
  settingsLoaded.value = false
  settingsLoadFailed.value = false
  try {
    const res = await getRegistrationTime()
    const d = res.data as Partial<SettingsForm>
    form.value = {
      is_open: d.is_open ?? false,
      open_at: d.open_at || null,
      close_at: d.close_at || null,
      school_year: d.school_year ?? null,
      semester: d.semester ?? null,
      page_title: d.page_title || '',
      term_label: d.term_label || '',
      event_date_label: d.event_date_label || '',
      target_audience: d.target_audience || '',
      form_card_title: d.form_card_title || '',
      poster_url: d.poster_url || '',
    }
    posterBroken.value = false
    settingsLoaded.value = true
  } catch (e) {
    settingsLoadFailed.value = true
    ElMessage.error(friendlyError('載入才藝設定失敗', e))
  } finally {
    loading.value = false
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const detail = (
    error as { response?: { data?: { detail?: unknown } } }
  )?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          const msg = (item as { msg?: unknown }).msg
          return typeof msg === 'string' ? msg : ''
        }
        return ''
      })
      .filter(Boolean)
    if (messages.length) return messages.join('；')
  }
  return fallback
}

function beforePosterUpload(file: UploadRawFile) {
  const okType = /\.(jpe?g|png|gif|webp)$/i.test(file.name)
  if (!okType) {
    ElMessage.error('僅支援 jpg / jpeg / png / gif / webp')
    return false
  }
  const okSize = file.size <= 10 * 1024 * 1024
  if (!okSize) {
    ElMessage.error('檔案不能超過 10MB')
    return false
  }
  return true
}

async function handlePosterUpload({ file }: { file: UploadRawFile }) {
  uploading.value = true
  try {
    const res = await uploadActivityPoster(file)
    form.value.poster_url = (res.data as { poster_url?: string })?.poster_url || ''
    posterBroken.value = false
    ElMessage.success('海報已更新')
  } catch (e) {
    ElMessage.error(apiErrorMessage(e, '上傳失敗'))
  } finally {
    uploading.value = false
  }
}

async function handleSave() {
  if (!settingsLoaded.value) {
    ElMessage.error('設定尚未載入完成，請先重新載入後再儲存')
    return
  }
  if (form.value.open_at && form.value.close_at && form.value.close_at <= form.value.open_at) {
    ElMessage.error('截止時間必須晚於開放時間')
    return
  }

  // 確認框攤開實際生效的時間窗與異常警告（曾有年份誤存 2021/2029 未被發現，
  // 導致時間窗形同永遠開放；見 registrationSettingsConfirm.ts）
  const confirmLines = buildSaveConfirmLines(
    {
      is_open: form.value.is_open,
      open_at: form.value.open_at,
      close_at: form.value.close_at,
      school_year: form.value.school_year,
      semester: form.value.semester,
    },
    taipeiNowMinuteString()
  )
  try {
    await ElMessageBox.confirm(
      h('div', null, [
        ...confirmLines.map((line) => h('p', { style: 'margin: 4px 0' }, line)),
        h('p', { style: 'margin: 8px 0 0' }, '確定要儲存以上設定並更新前台顯示內容？'),
      ]),
      '確認儲存',
      { type: 'warning', confirmButtonText: '確定儲存', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  saving.value = true
  try {
    const payload: ActivityRegistrationSettingsPayload = {
      is_open: form.value.is_open,
      open_at: form.value.open_at,
      close_at: form.value.close_at,
      school_year: form.value.school_year,
      semester: form.value.semester,
      page_title: form.value.page_title.trim() || null,
      term_label: form.value.term_label.trim() || null,
      event_date_label: form.value.event_date_label.trim() || null,
      target_audience: form.value.target_audience.trim() || null,
      form_card_title: form.value.form_card_title.trim() || null,
      poster_url: form.value.poster_url || null,
    }
    await updateRegistrationTime(payload)
    ElMessage.success('設定已儲存')
    savedAt.value = new Date().toLocaleString('zh-TW')
  } catch (e) {
    ElMessage.error(apiErrorMessage(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

// ── 候補直升正式通知信樣板 ─────────────────────────────────────────
const emailTemplateLoading = ref(false)
const savingEmailTemplate = ref(false)
const testSending = ref(false)
const emailTemplateSavedAt = ref('')
const testSendEmail = ref('')
const emailTemplate = ref<EmailTemplateForm>({
  subject: null,
  body: null,
  subject_default: '',
  body_default: '',
  email_enabled: false,
})

async function fetchEmailTemplate() {
  emailTemplateLoading.value = true
  try {
    const res = await getWaitlistPromotedEmailTemplate()
    emailTemplate.value = res.data as EmailTemplateForm
  } catch {
    ElMessage.error('載入候補直升正式通知信樣板失敗')
  } finally {
    emailTemplateLoading.value = false
  }
}

async function handleSaveEmailTemplate() {
  savingEmailTemplate.value = true
  try {
    const res = await updateWaitlistPromotedEmailTemplate({
      subject: emailTemplate.value.subject || null,
      body: emailTemplate.value.body || null,
    })
    emailTemplate.value = res.data as EmailTemplateForm
    ElMessage.success('樣板已儲存')
    emailTemplateSavedAt.value = new Date().toLocaleString('zh-TW')
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '儲存失敗')
  } finally {
    savingEmailTemplate.value = false
  }
}

async function handleTestSend() {
  if (!testSendEmail.value.trim()) {
    ElMessage.warning('請輸入測試收件信箱')
    return
  }
  testSending.value = true
  try {
    const res = await testSendWaitlistPromotedEmail({
      to_email: testSendEmail.value.trim(),
      subject: emailTemplate.value.subject || undefined,
      body: emailTemplate.value.body || undefined,
    })
    ElMessage.success((res.data as { message: string }).message)
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '測試寄送失敗')
  } finally {
    testSending.value = false
  }
}

// ── 報名成功通知信樣板 ───────────────────────────────────────────────
const successEmailTemplateLoading = ref(false)
const savingSuccessEmailTemplate = ref(false)
const successTestSending = ref(false)
const successEmailTemplateSavedAt = ref('')
const successTestSendEmail = ref('')
const successEmailTemplate = ref<EmailTemplateForm>({
  subject: null,
  body: null,
  subject_default: '',
  body_default: '',
  email_enabled: false,
})

async function fetchSuccessEmailTemplate() {
  successEmailTemplateLoading.value = true
  try {
    const res = await getRegistrationSuccessEmailTemplate()
    successEmailTemplate.value = res.data as EmailTemplateForm
  } catch {
    ElMessage.error('載入報名成功通知信樣板失敗')
  } finally {
    successEmailTemplateLoading.value = false
  }
}

async function handleSaveSuccessEmailTemplate() {
  savingSuccessEmailTemplate.value = true
  try {
    const res = await updateRegistrationSuccessEmailTemplate({
      subject: successEmailTemplate.value.subject || null,
      body: successEmailTemplate.value.body || null,
    })
    successEmailTemplate.value = res.data as EmailTemplateForm
    ElMessage.success('樣板已儲存')
    successEmailTemplateSavedAt.value = new Date().toLocaleString('zh-TW')
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '儲存失敗')
  } finally {
    savingSuccessEmailTemplate.value = false
  }
}

async function handleSuccessTestSend() {
  if (!successTestSendEmail.value.trim()) {
    ElMessage.warning('請輸入測試收件信箱')
    return
  }
  successTestSending.value = true
  try {
    const res = await testSendRegistrationSuccessEmail({
      to_email: successTestSendEmail.value.trim(),
      subject: successEmailTemplate.value.subject || undefined,
      body: successEmailTemplate.value.body || undefined,
    })
    ElMessage.success((res.data as { message: string }).message)
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '測試寄送失敗')
  } finally {
    successTestSending.value = false
  }
}

onMounted(() => {
  // 唯讀角色進來只為了看課程與用品，設定三支 API 需 ACTIVITY_WRITE，打了必 403 並跳錯誤提示。
  if (!canWrite) return
  fetchSettings()
  fetchEmailTemplate()
  fetchSuccessEmailTemplate()
})
</script>

<style scoped>
.activity-settings { padding: 16px; }
.activity-settings h2 { margin-bottom: 16px; font-size: 20px; font-weight: 600; }

.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: 8px;
}
.settings-tabs :deep(.el-tabs__item) {
  font-size: 15px;
  font-weight: 600;
}

.poster-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.poster-img {
  width: 180px;
  height: 240px;
  object-fit: cover;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.poster-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.poster-hint {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.field-hint {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.gate-status {
  margin-bottom: 16px;
}
</style>
