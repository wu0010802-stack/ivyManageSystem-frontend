<template>
  <div class="activity-settings">
    <h2>{{ PAGE_TERMS.activitySettings }}</h2>

    <el-tabs v-model="activeTab" class="settings-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="報名設定" name="registration">
        <el-card style="max-width: 720px" v-loading="loading">
          <el-form :model="form" label-width="120px">
            <el-divider content-position="left">報名開關</el-divider>

            <el-form-item label="開放報名">
              <el-switch v-model="form.is_open" active-text="開放" inactive-text="關閉" />
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
                placeholder="例：114 下學期"
              />
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

      <el-tab-pane label="候補轉正信模板" name="waitlistEmail">
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

      <el-tab-pane label="報名成功模板" name="successEmail">
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
import { h, ref, computed, onMounted, watch } from 'vue'
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
  taipeiNowMinuteString,
} from './registrationSettingsConfirm'
import EmailTemplateEditor from './EmailTemplateEditor.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'

interface SettingsForm {
  is_open: boolean
  open_at: string | null
  close_at: string | null
  page_title: string
  term_label: string
  event_date_label: string
  target_audience: string
  form_card_title: string
  poster_url: string
  registration_success_email_subject: string
  registration_success_email_body: string
  waitlist_promoted_email_subject: string
  waitlist_promoted_email_body: string
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

const VALID_TABS = ['registration', 'waitlistEmail', 'successEmail']
const queryTab = route.query.tab as string | undefined
const initialTab = queryTab && VALID_TABS.includes(queryTab) ? queryTab : 'registration'
const activeTab = ref(initialTab)

function handleTabChange(tab: string | number) {
  const tabStr = String(tab)
  const nextQuery = { ...route.query }
  if (tabStr === 'registration') {
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
    } else if (!nextStr && activeTab.value !== 'registration') {
      activeTab.value = 'registration'
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

const form = ref<SettingsForm>({
  is_open: false,
  open_at: null,
  close_at: null,
  page_title: '',
  term_label: '',
  event_date_label: '',
  target_audience: '',
  form_card_title: '',
  poster_url: '',
  registration_success_email_subject: '',
  registration_success_email_body: '',
  waitlist_promoted_email_subject: '',
  waitlist_promoted_email_body: '',
})

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
      page_title: d.page_title || '',
      term_label: d.term_label || '',
      event_date_label: d.event_date_label || '',
      target_audience: d.target_audience || '',
      form_card_title: d.form_card_title || '',
      poster_url: d.poster_url || '',
      registration_success_email_subject: d.registration_success_email_subject || '',
      registration_success_email_body: d.registration_success_email_body || '',
      waitlist_promoted_email_subject: d.waitlist_promoted_email_subject || '',
      waitlist_promoted_email_body: d.waitlist_promoted_email_body || '',
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
      page_title: form.value.page_title.trim() || null,
      term_label: form.value.term_label.trim() || null,
      event_date_label: form.value.event_date_label.trim() || null,
      target_audience: form.value.target_audience.trim() || null,
      form_card_title: form.value.form_card_title.trim() || null,
      poster_url: form.value.poster_url || null,
      registration_success_email_subject:
        form.value.registration_success_email_subject.trim() || null,
      registration_success_email_body:
        form.value.registration_success_email_body.trim() || null,
      waitlist_promoted_email_subject:
        form.value.waitlist_promoted_email_subject.trim() || null,
      waitlist_promoted_email_body:
        form.value.waitlist_promoted_email_body.trim() || null,
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

.template-group {
  margin-bottom: 18px;
}
.template-group__title {
  margin: 0 0 6px 120px;
  font-size: 15px;
  font-weight: 600;
}
.template-hint {
  margin: 0 0 12px 120px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.8;
}
.template-hint code {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
</style>
