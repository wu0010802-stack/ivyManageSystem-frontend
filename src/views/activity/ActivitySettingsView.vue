<template>
  <div class="activity-settings">
    <h2>報名時間 & 前台顯示設定</h2>

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
          <el-button type="primary" @click="handleSave" :loading="saving">
            儲存設定
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRegistrationTime,
  updateRegistrationTime,
  uploadActivityPoster,
} from '@/api/activity'

const DEFAULT_POSTER = '/images/activity-poster.png'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const savedAt = ref('')

const form = ref({
  is_open: false,
  open_at: null,
  close_at: null,
  page_title: '',
  term_label: '',
  event_date_label: '',
  target_audience: '',
  form_card_title: '',
  poster_url: '',
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
  try {
    const res = await getRegistrationTime()
    const d = res.data || {}
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
    }
    posterBroken.value = false
  } catch {
    ElMessage.error('載入設定失敗')
  } finally {
    loading.value = false
  }
}

function beforePosterUpload(file) {
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

async function handlePosterUpload({ file }) {
  uploading.value = true
  try {
    const res = await uploadActivityPoster(file)
    form.value.poster_url = res.data?.poster_url || ''
    posterBroken.value = false
    ElMessage.success('海報已更新')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '上傳失敗')
  } finally {
    uploading.value = false
  }
}

async function handleSave() {
  if (form.value.open_at && form.value.close_at && form.value.close_at <= form.value.open_at) {
    ElMessage.error('截止時間必須晚於開放時間')
    return
  }

  const statusText = form.value.is_open ? '開放報名' : '關閉報名'
  try {
    await ElMessageBox.confirm(
      `確定要將報名設定為「${statusText}」並儲存前台顯示內容？`,
      '確認儲存',
      { type: 'warning', confirmButtonText: '確定儲存', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  saving.value = true
  try {
    const payload = {
      is_open: form.value.is_open,
      open_at: form.value.open_at,
      close_at: form.value.close_at,
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
    ElMessage.error(e?.response?.data?.detail || '儲存失敗')
  } finally {
    saving.value = false
  }
}

onMounted(fetchSettings)
</script>

<style scoped>
.activity-settings { padding: 16px; }
.activity-settings h2 { margin-bottom: 16px; font-size: 20px; font-weight: 600; }

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
  color: #6b7280;
  line-height: 1.5;
}
</style>
