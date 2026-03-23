<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getMyLeaves,
  uploadMyLeaveAttachments,
  getMyLeaveAttachment,
} from '@/api/portal'

const props = defineProps({
  refreshTrigger: { type: Number, default: 0 },
})

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const loading = ref(false)
const leaves = ref([])

const substituteStatusLabel = (status) => {
  const map = { not_required: '—', pending: '待回應', accepted: '已接受', rejected: '已拒絕', waived: '主管略過' }
  return map[status] || status
}
const substituteStatusType = (status) => {
  const map = { not_required: 'info', pending: 'warning', accepted: 'success', rejected: 'danger', waived: 'info' }
  return map[status] || ''
}

const fetchLeaves = async () => {
  loading.value = true
  try {
    const res = await getMyLeaves({ year: query.year, month: query.month })
    leaves.value = res.data
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

watch(() => props.refreshTrigger, () => {
  fetchLeaves()
})

// ── 附件預覽 ──
const attachDialogVisible = ref(false)
const attachItems = ref([])
const attachLoading = ref(false)

const viewAttachments = async (row) => {
  attachItems.value = []
  attachDialogVisible.value = true
  attachLoading.value = true
  try {
    for (const filename of row.attachment_paths) {
      const res = await getMyLeaveAttachment(row.id, filename)
      const isImage = /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(filename)
      attachItems.value.push({
        name: filename,
        url: URL.createObjectURL(res.data),
        isImage,
      })
    }
  } catch {
    ElMessage.error('載入附件失敗')
  } finally {
    attachLoading.value = false
  }
}

const closeAttachDialog = () => {
  attachItems.value.forEach(a => URL.revokeObjectURL(a.url))
  attachItems.value = []
  attachDialogVisible.value = false
}

// ── 補充附件 ──
const supplementDialogVisible = ref(false)
const supplementLeave = ref(null)
const supplementFileList = ref([])
const supplementLoading = ref(false)

const openSupplement = (row) => {
  supplementLeave.value = row
  supplementFileList.value = []
  supplementDialogVisible.value = true
}

const handleSupplementChange = (file, newList) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'application/pdf']
  const maxSize = 5 * 1024 * 1024
  if (!allowed.includes(file.raw?.type) && !file.name.match(/\.(heic|heif)$/i)) {
    ElMessage.error(`${file.name}：僅支援 JPG、PNG、GIF、HEIC、PDF`)
    supplementFileList.value = newList.filter(f => f.uid !== file.uid)
    return
  }
  if ((file.raw?.size ?? 0) > maxSize) {
    ElMessage.error(`${file.name} 超過 5 MB 限制`)
    supplementFileList.value = newList.filter(f => f.uid !== file.uid)
  }
}

const handleSupplementExceed = () => {
  const remaining = 5 - (supplementLeave.value?.attachment_paths?.length ?? 0)
  ElMessage.warning(`最多再補充 ${remaining} 個附件`)
}

const submitSupplement = async () => {
  if (!supplementFileList.value.length) return ElMessage.warning('請先選擇附件')
  supplementLoading.value = true
  try {
    const formData = new FormData()
    supplementFileList.value.forEach(f => formData.append('files', f.raw))
    await uploadMyLeaveAttachments(supplementLeave.value.id, formData)
    ElMessage.success('附件已補充')
    supplementDialogVisible.value = false
    fetchLeaves()
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '上傳失敗')
  } finally {
    supplementLoading.value = false
  }
}

// 暴露 fetchLeaves 供父元件 onMounted 調用
defineExpose({ fetchLeaves })
</script>

<template>
  <el-card v-loading="loading">
    <div class="query-row">
      <el-select v-model="query.year" style="width: 100px;" @change="fetchLeaves">
        <el-option v-for="y in [2024,2025,2026,2027]" :key="y" :label="`${y}年`" :value="y" />
      </el-select>
      <el-select v-model="query.month" style="width: 100px;" @change="fetchLeaves">
        <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
      </el-select>
    </div>

    <div style="overflow-x: auto">
      <el-table :data="leaves" border stripe style="margin-top: 12px;" max-height="600">
        <el-table-column prop="leave_type_label" label="假別" width="100" />
        <el-table-column label="開始時間" width="140">
          <template #default="{ row }">{{ row.start_date }} {{ row.start_time || '' }}</template>
        </el-table-column>
        <el-table-column label="結束時間" width="140">
          <template #default="{ row }">{{ row.end_date }} {{ row.end_time || '' }}</template>
        </el-table-column>
        <el-table-column prop="leave_hours" label="時數" width="80" />
        <el-table-column prop="reason" label="原因" />
        <el-table-column label="附件" width="110" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.attachment_paths && row.attachment_paths.length > 0"
              link type="primary" size="small"
              @click="viewAttachments(row)"
            >
              <el-icon><Paperclip /></el-icon>{{ row.attachment_paths.length }}
            </el-button>
            <span v-else class="text-secondary" style="font-size: 12px;">—</span>
            <el-button
              v-if="row.is_approved === null"
              link type="primary" size="small"
              @click="openSupplement(row)"
            >補件</el-button>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.is_approved === true" type="success" size="small">已核准</el-tag>
            <template v-else-if="row.is_approved === false">
              <el-tag type="danger" size="small">已駁回</el-tag>
              <el-tooltip v-if="row.rejection_reason" :content="`駁回原因：${row.rejection_reason}`" placement="top">
                <el-icon style="margin-left:4px;color:var(--el-color-danger);cursor:help;vertical-align:middle;"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
            <el-tag v-else type="warning" size="small">待核准</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="代理狀態" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="row.substitute_status && row.substitute_status !== 'not_required'"
              :type="substituteStatusType(row.substitute_status)"
              size="small"
            >{{ substituteStatusLabel(row.substitute_status) }}</el-tag>
            <span v-else style="color: var(--el-text-color-secondary); font-size: 12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="approved_by" label="核准人" width="100">
          <template #default="{ row }">
            {{ row.approved_by === 'Admin' ? '管理員' : row.approved_by }}
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-empty v-if="!loading && leaves.length === 0" description="本月無請假記錄" />
  </el-card>

  <!-- 附件預覽 Dialog -->
  <el-dialog v-model="attachDialogVisible" title="假單附件" width="640px" :before-close="closeAttachDialog">
    <div v-if="attachLoading" class="attach-loading">
      <el-icon class="is-loading"><Loading /></el-icon> 載入中…
    </div>
    <div v-else-if="attachItems.length === 0" class="text-secondary" style="text-align:center;padding:24px">無附件</div>
    <div v-else class="attach-grid">
      <div v-for="(item, i) in attachItems" :key="i" class="attach-item">
        <el-image
          v-if="item.isImage"
          :src="item.url"
          :preview-src-list="attachItems.filter(a => a.isImage).map(a => a.url)"
          :initial-index="attachItems.filter(a => a.isImage).findIndex(a => a.url === item.url)"
          fit="cover"
          class="attach-thumb"
        />
        <a v-else :href="item.url" :download="item.name" class="attach-file">
          <el-icon :size="32"><Document /></el-icon>
          <span class="attach-file__name">{{ item.name }}</span>
          <span class="attach-file__hint">點擊下載</span>
        </a>
      </div>
    </div>
  </el-dialog>

  <!-- 補充附件 Dialog -->
  <el-dialog v-model="supplementDialogVisible" title="補充附件" width="480px">
    <el-alert type="info" :closable="false" style="margin-bottom:12px">
      目前已有 {{ supplementLeave?.attachment_paths?.length ?? 0 }} 個附件，最多可補充至 5 個
    </el-alert>
    <el-upload
      v-model:file-list="supplementFileList"
      :auto-upload="false"
      :limit="5 - (supplementLeave?.attachment_paths?.length ?? 0)"
      accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.pdf"
      multiple list-type="text"
      :on-change="handleSupplementChange"
      :on-exceed="handleSupplementExceed"
      drag
    >
      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
      <div>拖曳或點擊選擇多個檔案</div>
      <template #tip>
        <div class="el-upload__tip">支援 JPG、PNG、GIF、HEIC、PDF，單檔 ≤5 MB</div>
      </template>
    </el-upload>
    <template #footer>
      <el-button @click="supplementDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="supplementLoading" @click="submitSupplement">上傳</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-row {
  display: flex;
  gap: var(--space-3);
}

.attach-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  padding: 24px;
  justify-content: center;
}

.attach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
}

.attach-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.attach-thumb {
  width: 100%;
  height: 140px;
  display: block;
}

.attach-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--space-5);
  text-decoration: none;
  color: var(--text-primary);
  height: 140px;
  transition: background-color 0.2s;
}

.attach-file:hover {
  background-color: var(--bg-color-soft);
}

.attach-file__name {
  font-size: var(--text-xs);
  text-align: center;
  word-break: break-all;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-file__hint {
  font-size: var(--text-xs);
  color: var(--color-primary);
}

@media (max-width: 767px) {
  .query-row {
    flex-wrap: wrap;
  }
}
</style>
