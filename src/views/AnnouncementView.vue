<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncementParentRecipients,
  replaceAnnouncementParentRecipients,
  getAnnouncementRecipients,
  getAnnouncementReaders,
  uploadAnnouncementAttachment,
  deleteAnnouncementAttachment,
} from '@/api/announcements'
import { useEmployeeStore } from '@/stores/employee'
import { useClassroomStore } from '@/stores/classroom'
import { Top, Document } from '@element-plus/icons-vue'
import { apiError } from '@/utils/error'
import { useTableFilters } from '@/composables/useTableFilters'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'

type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

type AttachmentItem = {
  id: number
  filename: string
  mime_type: string
  size_bytes: number
  url: string
  thumb_url: string | null
}

interface AnnouncementItem {
  id: number
  title: string
  content: string
  priority: string
  is_pinned: boolean
  recipient_count?: number
  read_count?: number
  read_preview?: { employee_id: number; name: string }[]
  created_by_name?: string
  created_at?: string
  publish_at?: string | null
  expires_at?: string | null
  status?: 'scheduled' | 'active' | 'expired'
  attachments?: AttachmentItem[]
  [key: string]: unknown
}

const {
  searchQuery: annSearch,
  items: rawAnnouncements,
  total: annTotal,
  page: annPage,
  pageSize: annPageSize,
  loading,
  fetch: fetchAnnouncements,
  setPage: annSetPage,
  setExtraParams,
} = useTableFilters({ apiFunc: (params) => getAnnouncements(params), initialPageSize: 50 })

const announcements = computed(() => rawAnnouncements.value as AnnouncementItem[])

const annFilterValues = ref<Record<string, unknown>>({})
const onAnnFilterChange = (v: Record<string, unknown>) => {
  annFilterValues.value = v
  return setExtraParams({ priority: v.priority })
}
const dialogVisible = ref(false)
const isEdit = ref(false)
const employeeStore = useEmployeeStore()
const classroomStore = useClassroomStore()
const employeeOptions = computed(() =>
  (employeeStore.employees as { id: number; name: string; department?: string; job_title?: string }[]).map(e => ({
    value: e.id,
    label: `${e.name}（${e.department || e.job_title || ''}）`,
  }))
)
const classroomOptions = computed(() =>
  ((classroomStore.classrooms || []) as { id: number; name: string }[]).map(c => ({
    value: c.id,
    label: c.name,
  }))
)

const priorityOptions: { value: string; label: string; type: ElTagType }[] = [
  { value: 'normal', label: '一般', type: 'info' },
  { value: 'important', label: '重要', type: 'warning' },
  { value: 'urgent', label: '緊急', type: 'danger' },
]

const priorityMap: Record<string, { value: string; label: string; type: ElTagType }> = Object.fromEntries(priorityOptions.map(p => [p.value, p]))

const annFilterGroups = computed(() => [
  { key: 'priority', label: '優先級', options: priorityOptions.map((o) => ({ label: o.label, value: o.value })) },
])

// ── Attachment state ──────────────────────────────────────────────────────
type PendingAttachment = { file: File; uid: number }

const pendingAttachments = ref<PendingAttachment[]>([])
const existingAttachments = ref<AttachmentItem[]>([])
const attachmentsToDelete = ref<number[]>([])

const ATTACHMENT_MAX = 5
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const attachmentSlotsLeft = computed(
  () => ATTACHMENT_MAX - existingAttachments.value.length,
)

const handleAttachmentChange = (uploadFile: { uid: number; raw?: File }) => {
  if (!uploadFile.raw) return
  pendingAttachments.value.push({ file: uploadFile.raw, uid: uploadFile.uid })
}

const handleAttachmentExceed = () => {
  ElMessage.warning(`附件上限 ${ATTACHMENT_MAX} 個`)
}

const handleAttachmentBefore = (file: File) => {
  if (file.size > ATTACHMENT_MAX_BYTES) {
    ElMessage.warning(`單檔上限 10MB（${file.name} 超過）`)
    return false
  }
  return true
}

const markAttachmentForDelete = (attId: number) => {
  existingAttachments.value = existingAttachments.value.filter(a => a.id !== attId)
  attachmentsToDelete.value.push(attId)
}
// ─────────────────────────────────────────────────────────────────────────

type ReaderRow = { employee_id: number; name: string; read_at: string | null }

const readersCache = ref<Record<number, { items: ReaderRow[]; total: number; loaded: boolean }>>({})
const readersLoading = ref<Record<number, boolean>>({})

const ensureReadersLoaded = async (annId: number, force = false) => {
  if (!force && readersCache.value[annId]?.loaded) return
  readersLoading.value[annId] = true
  try {
    const res = await getAnnouncementReaders(annId, { page: 1, page_size: 50 })
    const data = res.data as { items?: ReaderRow[]; total?: number }
    readersCache.value[annId] = {
      items: data.items || [],
      total: data.total ?? 0,
      loaded: true,
    }
  } catch (error) {
    ElMessage.error(apiError(error, '載入已讀名單失敗'))
  } finally {
    readersLoading.value[annId] = false
  }
}

// parent_visibility: 'off' | 'all' | 'classroom'
// 後端 scope 支援 all/classroom/student/guardian；前端先涵蓋常用三種，
// student/guardian 細粒度待後續補（model 已就位，PUT 結構可向下相容）
const form = reactive<{
  id: number | null
  title: string
  content: string
  priority: string
  is_pinned: boolean
  restrict_recipients: boolean
  target_employee_ids: number[]
  parent_visibility: string
  parent_target_classroom_ids: number[]
  publish_at: string | null
  expires_at: string | null
}>({
  id: null,
  title: '',
  content: '',
  priority: 'normal',
  is_pinned: false,
  restrict_recipients: false,
  target_employee_ids: [],
  parent_visibility: 'off',
  parent_target_classroom_ids: [],
  publish_at: null,
  expires_at: null,
})

const resetForm = () => {
  form.id = null
  form.title = ''
  form.content = ''
  form.priority = 'normal'
  form.is_pinned = false
  form.restrict_recipients = false
  form.target_employee_ids = []
  form.parent_visibility = 'off'
  form.parent_target_classroom_ids = []
  form.publish_at = null
  form.expires_at = null
  pendingAttachments.value = []
  existingAttachments.value = []
  attachmentsToDelete.value = []
}

const openAdd = () => {
  resetForm()
  isEdit.value = false
  dialogVisible.value = true
}

const openEdit = async (row: AnnouncementItem) => {
  form.id = row.id
  form.title = row.title
  form.content = row.content
  form.priority = row.priority
  form.is_pinned = row.is_pinned
  form.publish_at = (row.publish_at as string | null) ?? null
  form.expires_at = (row.expires_at as string | null) ?? null
  // 先以預設值打開（顯示 loading 期間可互動）
  form.target_employee_ids = []
  form.restrict_recipients = false
  form.parent_visibility = 'off'
  form.parent_target_classroom_ids = []
  pendingAttachments.value = []
  attachmentsToDelete.value = []
  existingAttachments.value = (row.attachments as AttachmentItem[]) ?? []
  isEdit.value = true
  dialogVisible.value = true

  try {
    const [recRes, parentRes] = await Promise.all([
      getAnnouncementRecipients(row.id),
      getAnnouncementParentRecipients(row.id),
    ])
    const empIds: number[] = (recRes.data as { employee_ids?: number[] })?.employee_ids || []
    form.target_employee_ids = empIds
    form.restrict_recipients = empIds.length > 0

    const items: { scope: string; classroom_id?: number }[] = (parentRes.data as { items?: { scope: string; classroom_id?: number }[] })?.items || []
    if (items.length === 0) {
      form.parent_visibility = 'off'
    } else if (items.some(it => it.scope === 'all')) {
      form.parent_visibility = 'all'
    } else if (items.every(it => it.scope === 'classroom' && it.classroom_id)) {
      form.parent_visibility = 'classroom'
      form.parent_target_classroom_ids = items.map(it => it.classroom_id as number)
    } else {
      // 含 student/guardian scope 的進階設定，前端 UI 暫無對應，視為「自訂」唯讀
      form.parent_visibility = 'custom'
    }
  } catch (error) {
    ElMessage.warning('讀取設定失敗，部分欄位可能未填入')
    form.parent_visibility = 'unchanged'
  }
}

const buildParentRecipients = () => {
  if (form.parent_visibility === 'off') return []
  if (form.parent_visibility === 'all') return [{ scope: 'all' }]
  if (form.parent_visibility === 'classroom') {
    return form.parent_target_classroom_ids.map(cid => ({
      scope: 'classroom',
      classroom_id: cid,
    }))
  }
  return null // 'custom' / 'unchanged'：不變更
}

const submitLoading = ref(false)

const handleSubmit = async () => {
  if (!form.title.trim() || !form.content.trim()) {
    ElMessage.warning('請填寫標題和內容')
    return
  }
  if (
    form.parent_visibility === 'classroom'
    && form.parent_target_classroom_ids.length === 0
  ) {
    ElMessage.warning('已選「指定班級」對家長公開，請至少勾選一個班級')
    return
  }
  submitLoading.value = true
  try {
    const recipientIds = form.restrict_recipients ? form.target_employee_ids : []
    let announcementId = form.id
    if (isEdit.value) {
      await updateAnnouncement(form.id!, {
        title: form.title,
        content: form.content,
        priority: form.priority,
        is_pinned: form.is_pinned,
        target_employee_ids: recipientIds,
        publish_at: form.publish_at,
        expires_at: form.expires_at,
      })
    } else {
      const res = await createAnnouncement({
        title: form.title,
        content: form.content,
        priority: form.priority,
        is_pinned: form.is_pinned,
        target_employee_ids: recipientIds.length > 0 ? recipientIds : null,
        publish_at: form.publish_at,
        expires_at: form.expires_at,
      })
      const resData = res.data as { id?: number; announcement?: { id?: number } }
      announcementId = resData?.id ?? resData?.announcement?.id ?? null
    }

    // 附件操作（刪除 + 上傳）
    if (announcementId) {
      if (attachmentsToDelete.value.length > 0) {
        await Promise.allSettled(
          attachmentsToDelete.value.map(attId =>
            deleteAnnouncementAttachment(announcementId as number, attId),
          ),
        )
      }
      if (pendingAttachments.value.length > 0) {
        await Promise.all(
          pendingAttachments.value.map(p =>
            uploadAnnouncementAttachment(announcementId as number, p.file),
          ),
        )
      }
    }

    // 家長端 scope 同步（plan A.5）
    if (announcementId) {
      const parentRecipients = buildParentRecipients()
      if (parentRecipients !== null) {
        try {
          await replaceAnnouncementParentRecipients(announcementId, parentRecipients)
        } catch (e) {
          ElMessage.warning(apiError(e, '公告已存檔，但家長端對象設定失敗，請稍後重試'))
        }
      }
    }

    ElMessage.success(isEdit.value ? '公告已更新' : '公告已發佈')
    dialogVisible.value = false
    fetchAnnouncements()
  } catch (error) {
    ElMessage.error(apiError(error, '操作失敗'))
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (row: AnnouncementItem) => {
  try {
    await ElMessageBox.confirm(`確定要刪除公告「${row.title}」嗎？`, '確認刪除', {
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteAnnouncement(row.id)
    ElMessage.success('公告已刪除')
    fetchAnnouncements()
  } catch (e) {
    if (e !== 'cancel' && (e as { message?: string })?.message !== 'cancel') {
      ElMessage.error('刪除失敗')
    }
  }
}

const togglePin = async (row: AnnouncementItem) => {
  try {
    await updateAnnouncement(row.id, { is_pinned: !row.is_pinned })
    ElMessage.success(row.is_pinned ? '已取消置頂' : '已置頂')
    fetchAnnouncements()
  } catch (error) {
    ElMessage.error('操作失敗')
  }
}

const formatDate = (isoStr: string | null | undefined) => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const getReadPreview = (row: AnnouncementItem) => row.read_preview || []

onMounted(() => {
  fetchAnnouncements()
  employeeStore.fetchEmployees()
  classroomStore.fetchClassrooms()
})
</script>

<template>
  <div class="announcement-view">
    <div class="page-header">
      <h2>公告管理</h2>
      <el-button type="primary" @click="openAdd">新增公告</el-button>
    </div>

    <AdminListToolbar
      v-model:search="annSearch"
      search-placeholder="搜尋公告標題"
      :filters="annFilterGroups"
      :filter-values="annFilterValues"
      :total="annTotal"
      @update:filter-values="onAnnFilterChange"
    />

    <el-table :data="announcements" v-loading="loading" stripe border style="width: 100%" max-height="600">
      <el-table-column label="置頂" width="70" align="center">
        <template #default="{ row }">
          <el-button
            :type="row.is_pinned ? 'warning' : 'default'"
            size="small"
            circle
            @click="togglePin(row)"
            :title="row.is_pinned ? '取消置頂' : '置頂'"
          >
            <el-icon><Top /></el-icon>
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="優先級" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="priorityMap[row.priority]?.type || 'info'" size="small">
            {{ priorityMap[row.priority]?.label || row.priority }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="狀態" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'scheduled'" type="info" size="small">預定</el-tag>
          <el-tag v-else-if="row.status === 'expired'" size="small">已過期</el-tag>
          <el-tag v-else type="success" size="small">進行中</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="標題" prop="title" min-width="200">
        <template #default="{ row }">
          <span style="font-weight: 600;">{{ row.title }}</span>
        </template>
      </el-table-column>

      <el-table-column label="內容預覽" min-width="250">
        <template #default="{ row }">
          <span style="color: var(--text-secondary);">{{ row.content.length > 60 ? row.content.slice(0, 60) + '...' : row.content }}</span>
        </template>
      </el-table-column>

      <el-table-column label="發佈者" prop="created_by_name" width="100" />

      <el-table-column label="對象" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="!row.recipient_count" type="primary" size="small">全員</el-tag>
          <el-tag v-else type="warning" size="small">{{ row.recipient_count }} 位員工</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="已讀預覽" min-width="220">
        <template #default="{ row }">
          <div class="read-preview-cell">
            <template v-if="row.read_count > 0">
              <div class="read-preview-tags">
                <el-tag
                  v-for="reader in getReadPreview(row)"
                  :key="reader.employee_id"
                  type="success"
                  size="small"
                  effect="plain"
                >
                  {{ reader.name }}
                </el-tag>
              </div>
              <el-popover
                placement="top-start"
                trigger="click"
                width="280"
                @show="ensureReadersLoaded(row.id)"
              >
                <template #reference>
                  <el-button link type="success" class="read-preview-button">
                    已讀 {{ row.read_count }} 人
                  </el-button>
                </template>
                <div v-loading="readersLoading[row.id]" class="reader-popover">
                  <div class="reader-popover-title">已讀名單</div>
                  <div
                    v-for="reader in readersCache[row.id]?.items || []"
                    :key="`${row.id}-${reader.employee_id}`"
                    class="reader-row"
                  >
                    <span>{{ reader.name }}</span>
                    <span class="reader-read-at">{{ formatDate(reader.read_at) }}</span>
                  </div>
                  <div v-if="!readersLoading[row.id] && (readersCache[row.id]?.items || []).length === 0" class="text-muted">
                    尚未有人已讀
                  </div>
                </div>
              </el-popover>
            </template>
            <span v-else class="text-muted">尚未有人已讀</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="發佈時間" width="160">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>

      <el-table-column label="操作" width="140" align="center">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="openEdit(row)">編輯</el-button>
          <el-button type="danger" size="small" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="annTotal > annPageSize"
      style="margin-top: 16px; justify-content: flex-end;"
      background
      layout="total, prev, pager, next"
      :total="annTotal"
      :page-size="annPageSize"
      :current-page="annPage"
      @current-change="annSetPage"
    />

    <!-- Add/Edit Dialog -->
    <el-dialog
      :title="isEdit ? '編輯公告' : '新增公告'"
      v-model="dialogVisible"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form label-width="80px">
        <el-form-item label="標題">
          <el-input v-model="form.title" placeholder="請輸入公告標題" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="優先級">
          <el-select v-model="form.priority" style="width: 100%;">
            <el-option
              v-for="opt in priorityOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="置頂">
          <el-switch v-model="form.is_pinned" />
        </el-form-item>
        <el-form-item label="限制對象">
          <el-switch v-model="form.restrict_recipients" active-text="指定員工" inactive-text="全員可見" />
        </el-form-item>
        <el-form-item v-if="form.restrict_recipients" label="指定員工">
          <el-select
            v-model="form.target_employee_ids"
            multiple
            filterable
            placeholder="請選擇員工"
            style="width: 100%;"
          >
            <el-option
              v-for="emp in employeeOptions"
              :key="emp.value"
              :label="emp.label"
              :value="emp.value"
            />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">排程</el-divider>

        <el-form-item label="發佈時間">
          <el-date-picker
            v-model="form.publish_at"
            type="datetime"
            placeholder="留空＝立即發佈"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="到期時間">
          <el-date-picker
            v-model="form.expires_at"
            type="datetime"
            placeholder="留空＝永久"
            value-format="YYYY-MM-DDTHH:mm:ss"
            style="width: 100%;"
          />
        </el-form-item>

        <el-divider content-position="left">附件</el-divider>

        <el-form-item label="附件">
          <div class="attachments-block">
            <div v-if="existingAttachments.length" class="existing-attachments">
              <div v-for="att in existingAttachments" :key="att.id" class="att-row">
                <img v-if="att.thumb_url" :src="att.thumb_url" class="att-thumb" alt="" />
                <el-icon v-else><Document /></el-icon>
                <span class="att-filename">{{ att.filename }}</span>
                <el-button
                  link
                  type="danger"
                  size="small"
                  @click="markAttachmentForDelete(att.id)"
                >移除</el-button>
              </div>
            </div>
            <el-upload
              :auto-upload="false"
              :multiple="true"
              :limit="attachmentSlotsLeft"
              :on-change="handleAttachmentChange"
              :on-exceed="handleAttachmentExceed"
              :before-upload="handleAttachmentBefore"
              accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.pdf"
            >
              <el-button>選擇檔案（圖片/PDF，最多 5 個、單檔 10MB）</el-button>
            </el-upload>
          </div>
        </el-form-item>

        <el-divider content-position="left">家長端</el-divider>

        <el-form-item label="家長端">
          <el-radio-group v-model="form.parent_visibility">
            <el-radio value="off">不對家長公開</el-radio>
            <el-radio value="all">全部家長</el-radio>
            <el-radio value="classroom">指定班級</el-radio>
            <el-radio v-if="form.parent_visibility === 'custom'" value="custom" disabled>
              進階（細粒度，含學生/監護人）
            </el-radio>
            <el-radio v-if="form.parent_visibility === 'unchanged'" value="unchanged" disabled>
              讀取失敗，將不變更
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.parent_visibility === 'classroom'" label="指定班級">
          <el-select
            v-model="form.parent_target_classroom_ids"
            multiple
            filterable
            placeholder="請選擇班級"
            style="width: 100%;"
          >
            <el-option
              v-for="opt in classroomOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.parent_visibility === 'custom'" label="提示">
          <span class="text-muted">
            此公告對家長端的發送對象包含學生或監護人精細設定，目前介面尚未支援編輯；
            可透過後端 API 維護，或選擇上方選項覆蓋既有設定。
          </span>
        </el-form-item>

        <el-form-item label="內容">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="8"
            placeholder="請輸入公告內容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">
          {{ isEdit ? '更新' : '發佈' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.announcement-view {
  padding: 0;
}

.read-preview-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.read-preview-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.read-preview-button {
  padding: 0;
  justify-content: flex-start;
  height: auto;
}

.reader-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reader-popover-title {
  font-weight: 600;
  color: var(--text-primary);
}

.reader-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.reader-read-at {
  color: var(--text-tertiary);
  white-space: nowrap;
}

.text-muted {
  color: var(--text-tertiary);
}

.attachments-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.existing-attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.att-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.att-thumb {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
}

.att-filename {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
