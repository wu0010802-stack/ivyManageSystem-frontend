<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadUserFile } from 'element-plus'
import {
  listWorkSamples,
  updateWorkSample,
  deleteWorkSample,
  uploadWorkSamplePhoto,
} from '@/api/workSamples'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { todayISO } from '@/utils/format'

// 7 領域對齊台灣課綱（同 PortfolioTab.vue / PortalWorkSampleView.vue）
const DOMAINS = [
  '身體動作與健康',
  '語文',
  '認知',
  '社會',
  '情緒',
  '美感',
  '綜合',
]

const props = defineProps<{
  studentId: number
}>()

interface WorkSampleAttachment {
  id: number
  url?: string
  display_url?: string | null
  thumb_url?: string | null
  original_filename?: string
}

interface WorkSampleItem {
  id: number
  title: string
  description?: string | null
  work_date: string
  domain?: string | null
  created_by?: number | null
  attachments?: WorkSampleAttachment[]
}

const loading = ref<boolean>(false)
const items = ref<WorkSampleItem[]>([])
const canWrite = ref<boolean>(hasPermission('PORTFOLIO_WRITE'))
const deletingId = ref<number | null>(null)

const editor = reactive<{
  visible: boolean
  saving: boolean
  editingId: number | null
  form: { title: string; description: string; workDate: string; domain: string }
}>({
  visible: false,
  saving: false,
  editingId: null,
  form: { title: '', description: '', workDate: todayISO(), domain: '' },
})

const upload = reactive<{
  visible: boolean
  uploading: boolean
  wsId: number | null
  wsTitle: string
  fileList: UploadUserFile[]
}>({
  visible: false,
  uploading: false,
  wsId: null,
  wsTitle: '',
  fileList: [],
})

async function reload() {
  loading.value = true
  try {
    const r = await listWorkSamples(props.studentId, { limit: 100 })
    // 後端未標 response_model，型別退化為 unknown dict
    const body = r.data as { items?: WorkSampleItem[] } // TODO(ts-strict): waiting on backend response_model
    items.value = body?.items || []
  } catch (e) {
    ElMessage.error(apiError(e, '載入作品清單失敗'))
  } finally {
    loading.value = false
  }
}

function openEdit(item: WorkSampleItem) {
  editor.editingId = item.id
  editor.form = {
    title: item.title,
    description: item.description || '',
    workDate: item.work_date,
    domain: item.domain || '',
  }
  editor.visible = true
}

async function saveEdit() {
  if (!editor.form.title.trim()) {
    ElMessage.warning('請輸入作品名稱')
    return
  }
  if (!editor.editingId) return
  editor.saving = true
  try {
    await updateWorkSample(props.studentId, editor.editingId, {
      title: editor.form.title.trim(),
      description: editor.form.description.trim() || null,
      work_date: editor.form.workDate,
      domain: editor.form.domain || null,
    })
    ElMessage.success('已更新')
    editor.visible = false
    await reload()
  } catch (e) {
    ElMessage.error(apiError(e, '更新失敗'))
  } finally {
    editor.saving = false
  }
}

async function confirmDelete(item: WorkSampleItem) {
  if (deletingId.value) return
  try {
    await ElMessageBox.confirm('確定刪除這件作品？附件也會一併軟刪除。', '刪除作品', {
      type: 'warning',
    })
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
    return
  }
  deletingId.value = item.id
  try {
    await deleteWorkSample(props.studentId, item.id)
    ElMessage.success('已刪除')
    await reload()
  } catch (e) {
    ElMessage.error(apiError(e, '刪除失敗'))
  } finally {
    deletingId.value = null
  }
}

function openUpload(item: WorkSampleItem) {
  upload.wsId = item.id
  upload.wsTitle = item.title
  upload.fileList = []
  upload.visible = true
}

function handleFileChange(_: unknown, fileList: UploadUserFile[]) {
  upload.fileList = fileList
}

function handleFileRemove(_: unknown, fileList: UploadUserFile[]) {
  upload.fileList = fileList
}

async function doUpload() {
  upload.uploading = true
  let ok = 0
  let fail = 0
  try {
    for (const wrapper of upload.fileList) {
      try {
        await uploadWorkSamplePhoto(wrapper.raw!, upload.wsId!)
        ok += 1
      } catch (e) {
        fail += 1
        ElMessage.error(apiError(e, `上傳 ${wrapper.name} 失敗`))
      }
    }
    if (ok > 0) ElMessage.success(`成功上傳 ${ok} 張${fail ? `（${fail} 失敗）` : ''}`)
    upload.visible = false
    await reload()
  } finally {
    upload.uploading = false
  }
}

watch(() => props.studentId, () => reload(), { immediate: false })
onMounted(reload)
</script>

<template>
  <div class="work-samples-section">
    <el-empty v-if="!loading && items.length === 0" description="尚無作品紀錄" />

    <div v-loading="loading" class="work-samples-grid">
      <el-card
        v-for="item in items"
        :key="item.id"
        class="work-sample-card"
        shadow="hover"
      >
        <div class="ws-thumb">
          <img
            v-if="item.attachments?.length"
            :src="item.attachments[0].thumb_url || item.attachments[0].display_url || item.attachments[0].url"
            :alt="item.title"
          />
          <div v-else class="ws-thumb-placeholder">無照片</div>
        </div>
        <div class="ws-meta">
          <strong class="ws-title">{{ item.title }}</strong>
          <span class="ws-date">{{ item.work_date }}</span>
          <el-tag v-if="item.domain" size="small">{{ item.domain }}</el-tag>
        </div>
        <p v-if="item.description" class="ws-desc">{{ item.description }}</p>

        <div class="ws-actions">
          <el-button size="small" link :disabled="!canWrite" @click="openEdit(item)">
            編輯
          </el-button>
          <el-button size="small" link :disabled="!canWrite" @click="openUpload(item)">
            補照片
          </el-button>
          <el-button
            size="small"
            link
            type="danger"
            :disabled="!canWrite"
            :loading="deletingId === item.id"
            @click="confirmDelete(item)"
          >
            刪除
          </el-button>
        </div>
      </el-card>
    </div>

    <!-- 編輯對話框 -->
    <el-dialog v-model="editor.visible" title="編輯作品" width="480px">
      <el-form label-width="80px">
        <el-form-item label="作品名稱" required>
          <el-input v-model="editor.form.title" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="editor.form.workDate"
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
        <el-form-item label="說明">
          <el-input
            v-model="editor.form.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editor.visible = false">取消</el-button>
        <el-button type="primary" :loading="editor.saving" @click="saveEdit">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 補照片對話框 -->
    <el-dialog v-model="upload.visible" title="補照片" width="420px">
      <p class="upload-hint">將掛到作品：{{ upload.wsTitle }}</p>
      <el-upload
        drag
        multiple
        :auto-upload="false"
        :file-list="upload.fileList"
        accept="image/jpeg,image/png,image/gif,image/heic,image/heif"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">拖曳照片或<em>點擊上傳</em></div>
        <template #tip>
          <div class="upload-tip">支援 JPG/PNG/GIF/HEIC</div>
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
  </div>
</template>

<style scoped>
.work-samples-section {
  padding-top: 12px;
}
.work-samples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.work-sample-card :deep(.el-card__body) {
  padding: 12px;
}
.ws-thumb {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 6px;
  background: #f5f7fa;
  margin-bottom: 8px;
}
.ws-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ws-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 13px;
}
.ws-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.ws-title {
  color: var(--text-primary);
}
.ws-date {
  font-size: 12px;
  color: var(--text-secondary);
}
.ws-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin: 4px 0 8px;
  white-space: pre-wrap;
}
.ws-actions {
  display: flex;
  gap: 4px;
}
.upload-hint {
  color: var(--text-tertiary);
  font-size: 13px;
  margin-bottom: 12px;
}
.upload-tip {
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
