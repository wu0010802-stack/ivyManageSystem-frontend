<template>
  <div class="portfolio-tab">
    <div class="toolbar">
      <el-button type="primary" :disabled="!canWrite" @click="openCreate">
        新增觀察
      </el-button>
      <el-select
        v-model="filters.domain"
        placeholder="全部領域"
        clearable
        style="width: 180px"
        @change="reload"
      >
        <el-option
          v-for="d in DOMAINS"
          :key="d"
          :label="d"
          :value="d"
        />
      </el-select>
      <el-checkbox v-model="filters.highlightOnly" @change="reload">
        僅顯示里程碑
      </el-checkbox>
    </div>

    <el-empty v-if="!loading && items.length === 0" description="尚無觀察紀錄" />

    <div v-loading="loading" class="observation-list">
      <el-card
        v-for="obs in items"
        :key="obs.id"
        class="observation-card"
        shadow="hover"
      >
        <div class="obs-header">
          <span class="date">{{ obs.observation_date }}</span>
          <el-tag v-if="obs.domain" size="small">{{ obs.domain }}</el-tag>
          <el-tag v-if="obs.is_highlight" size="small" type="warning">
            🌟 里程碑
          </el-tag>
          <el-rate
            v-if="obs.rating"
            :model-value="obs.rating"
            disabled
            show-score
            :colors="['#F7BA2A', '#F7BA2A', '#F7BA2A']"
            style="margin-left: auto"
          />
        </div>
        <div class="obs-narrative">{{ obs.narrative }}</div>

        <!-- 照片附件（縮圖 grid） -->
        <div v-if="obs.attachments?.length" class="attachment-grid">
          <div
            v-for="att in obs.attachments"
            :key="att.id"
            class="attachment-thumb"
            @click="openLightbox(att)"
          >
            <img :src="att.thumb_url || att.url" :alt="att.original_filename" />
          </div>
        </div>

        <div class="obs-actions">
          <el-button
            size="small"
            link
            :disabled="!canWrite"
            @click="openEdit(obs)"
          >
            編輯
          </el-button>
          <el-button
            size="small"
            link
            :disabled="!canWrite"
            @click="openUpload(obs)"
          >
            加照片
          </el-button>
          <el-button
            size="small"
            link
            type="danger"
            :disabled="!canWrite"
            @click="confirmDelete(obs)"
          >
            刪除
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 新增 / 編輯 對話框 -->
    <el-dialog
      v-model="editor.visible"
      :title="editor.mode === 'create' ? '新增觀察' : '編輯觀察'"
      width="560px"
    >
      <el-form :model="editor.form" label-width="90px">
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="editor.form.observation_date"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="領域">
          <el-select v-model="editor.form.domain" clearable placeholder="選擇（可空）">
            <el-option v-for="d in DOMAINS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="觀察內容" required>
          <el-input
            v-model="editor.form.narrative"
            type="textarea"
            :rows="4"
            placeholder="紀錄今日觀察..."
            maxlength="5000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="評分">
          <el-rate v-model="editor.form.rating" :max="5" clearable />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="editor.form.is_highlight">
            標示為成長里程碑（納入學期報告精選）
          </el-checkbox>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editor.visible = false">取消</el-button>
        <el-button type="primary" :loading="editor.saving" @click="save">
          {{ editor.mode === 'create' ? '建立' : '儲存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 上傳照片對話框 -->
    <el-dialog v-model="upload.visible" title="上傳照片" width="420px">
      <p class="upload-hint">將掛到觀察：{{ upload.obsDate }}</p>
      <el-upload
        drag
        multiple
        :auto-upload="false"
        :file-list="upload.fileList"
        accept="image/jpeg,image/png,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">拖曳檔案或<em>點擊上傳</em></div>
        <template #tip>
          <div class="upload-tip">支援 JPG/PNG/GIF/HEIC（≤10MB）、MP4/MOV/WEBM（≤50MB）</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="upload.visible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="upload.uploading"
          :disabled="upload.fileList.length === 0"
          @click="doUpload"
        >
          上傳 {{ upload.fileList.length }} 個檔案
        </el-button>
      </template>
    </el-dialog>

    <!-- Lightbox -->
    <el-dialog v-model="lightbox.visible" :title="lightbox.filename" width="80%">
      <img
        v-if="lightbox.url"
        :src="lightbox.url"
        :alt="lightbox.filename"
        style="max-width: 100%; max-height: 70vh; display: block; margin: auto"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import {
  listObservations,
  createObservation,
  updateObservation,
  deleteObservation,
  uploadAttachment,
} from '@/api/portfolio'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { todayISO } from '@/utils/format'

const DOMAINS = [
  '身體動作與健康',
  '語文',
  '認知',
  '社會',
  '情緒',
  '美感',
  '綜合',
]

const props = defineProps({
  studentId: { type: Number, required: true },
})

const loading = ref(false)
const items = ref([])
const canWrite = ref(hasPermission('PORTFOLIO_WRITE'))

const filters = reactive({
  domain: '',
  highlightOnly: false,
})

const editor = reactive({
  visible: false,
  mode: 'create',
  saving: false,
  editingId: null,
  form: {
    observation_date: todayISO(),
    domain: '',
    narrative: '',
    rating: 0,
    is_highlight: false,
  },
})

const upload = reactive({
  visible: false,
  uploading: false,
  obsId: null,
  obsDate: '',
  fileList: [],
})

const lightbox = reactive({
  visible: false,
  url: '',
  filename: '',
})

async function reload() {
  loading.value = true
  try {
    const params = {}
    if (filters.domain) params.domain = filters.domain
    if (filters.highlightOnly) params.highlight_only = true
    const r = await listObservations(props.studentId, params)
    items.value = r.data.items || []
  } catch (e) {
    apiError(e, '載入觀察紀錄失敗')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editor.mode = 'create'
  editor.editingId = null
  editor.form = {
    observation_date: todayISO(),
    domain: '',
    narrative: '',
    rating: 0,
    is_highlight: false,
  }
  editor.visible = true
}

function openEdit(obs) {
  editor.mode = 'edit'
  editor.editingId = obs.id
  editor.form = {
    observation_date: obs.observation_date,
    domain: obs.domain || '',
    narrative: obs.narrative,
    rating: obs.rating || 0,
    is_highlight: obs.is_highlight,
  }
  editor.visible = true
}

async function save() {
  if (!editor.form.narrative?.trim()) {
    ElMessage.warning('請輸入觀察內容')
    return
  }
  editor.saving = true
  try {
    const payload = {
      observation_date: editor.form.observation_date,
      narrative: editor.form.narrative.trim(),
      domain: editor.form.domain || null,
      rating: editor.form.rating || null,
      is_highlight: editor.form.is_highlight,
    }
    if (editor.mode === 'create') {
      await createObservation(props.studentId, payload)
      ElMessage.success('已新增')
    } else {
      await updateObservation(props.studentId, editor.editingId, payload)
      ElMessage.success('已更新')
    }
    editor.visible = false
    await reload()
  } catch (e) {
    apiError(e, '儲存失敗')
  } finally {
    editor.saving = false
  }
}

async function confirmDelete(obs) {
  try {
    await ElMessageBox.confirm(
      '確定刪除這筆觀察紀錄？附件也會一併軟刪除。',
      '刪除觀察',
      { type: 'warning' }
    )
    await deleteObservation(props.studentId, obs.id)
    ElMessage.success('已刪除')
    await reload()
  } catch (e) {
    if (e !== 'cancel') apiError(e, '刪除失敗')
  }
}

function openUpload(obs) {
  upload.obsId = obs.id
  upload.obsDate = obs.observation_date
  upload.fileList = []
  upload.visible = true
}

function handleFileChange(_, fileList) {
  upload.fileList = fileList
}

function handleFileRemove(_, fileList) {
  upload.fileList = fileList
}

async function doUpload() {
  upload.uploading = true
  let ok = 0
  let fail = 0
  try {
    for (const wrapper of upload.fileList) {
      try {
        await uploadAttachment(
          wrapper.raw,
          'observation',
          upload.obsId
        )
        ok += 1
      } catch (e) {
        fail += 1
        apiError(e, `上傳 ${wrapper.name} 失敗`)
      }
    }
    if (ok > 0) ElMessage.success(`成功上傳 ${ok} 張${fail ? `（${fail} 失敗）` : ''}`)
    upload.visible = false
    await reload()
  } finally {
    upload.uploading = false
  }
}

function openLightbox(att) {
  lightbox.url = att.display_url || att.url
  lightbox.filename = att.original_filename
  lightbox.visible = true
}

watch(() => props.studentId, () => reload(), { immediate: false })
onMounted(reload)
</script>

<style scoped>
.portfolio-tab {
  padding-top: 12px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.observation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.observation-card .obs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.obs-header .date {
  font-weight: 600;
  color: #606266;
}
.obs-narrative {
  white-space: pre-wrap;
  color: #303133;
  line-height: 1.6;
  margin: 8px 0;
}
.attachment-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.attachment-thumb {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 6px;
  cursor: pointer;
  background: #f5f7fa;
}
.attachment-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}
.attachment-thumb:hover img {
  transform: scale(1.05);
}
.obs-actions {
  margin-top: 8px;
  display: flex;
  gap: 4px;
}
.upload-hint {
  color: #909399;
  font-size: 13px;
  margin-bottom: 12px;
}
.upload-tip {
  color: #909399;
  font-size: 12px;
}
</style>
