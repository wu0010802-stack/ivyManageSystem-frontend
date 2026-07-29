<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadUserFile } from 'element-plus'
import { getMyStudents } from '@/api/portal'
import {
  listWorkSamples,
  createWorkSample,
  updateWorkSample,
  deleteWorkSample,
  uploadWorkSamplePhoto,
} from '@/api/workSamples'
import { getUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { todayISO } from '@/utils/format'
import { usePortalFromHub } from '@/composables/usePortalFromHub'
import EmptyState from '@/components/common/EmptyState.vue'

const { fromHub, backToHub } = usePortalFromHub()

// 7 領域對齊台灣課綱（同 PortalObservationView / 後端 OBSERVATION_DOMAINS）
const DOMAINS = [
  { value: '身體動作與健康', short: '動作' },
  { value: '語文', short: '語文' },
  { value: '認知', short: '認知' },
  { value: '社會', short: '社會' },
  { value: '情緒', short: '情緒' },
  { value: '美感', short: '美感' },
  { value: '綜合', short: '綜合' },
]

// 僅接受影像；成長冊/作品典藏不收影片（與 PortfolioTab 觀察附件不同）
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/heic,image/heif'

interface ClassroomEntry {
  classroom_id?: number
  classroom_name?: string
  students?: { id: number; name: string }[]
  [key: string]: unknown
}
interface StudentOption {
  id: number
  name: string
  classroom_name: string
}
interface WorkSampleAttachment {
  id: number
  url: string
  display_url?: string | null
  thumb_url?: string | null
  original_filename?: string
}
interface WorkSampleItem {
  id: number
  student_id: number
  title: string
  description?: string | null
  work_date: string
  domain?: string | null
  created_by?: number | null
  created_at?: string | null
  updated_at?: string | null
  attachments?: WorkSampleAttachment[]
}

const classrooms = ref<ClassroomEntry[]>([])
const allStudents = ref<StudentOption[]>([])

const form = reactive({
  studentId: null as number | null,
  title: '',
  description: '',
  workDate: todayISO(),
  domain: '' as string,
})
const fileList = ref<UploadUserFile[]>([])
const submitting = ref(false)

const recent = ref<WorkSampleItem[]>([])
const loadingRecent = ref(false)

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

// getUserInfo()?.id 慣例同 PortalStudentAttendanceView.vue::currentUserId
const currentUserId = (): number | null => (getUserInfo()?.id as number | undefined) ?? null

const selectedStudent = computed(() => allStudents.value.find((s) => s.id === form.studentId))

async function loadStudents() {
  try {
    const { data } = await getMyStudents()
    classrooms.value = data?.classrooms || []
    allStudents.value = ((data?.classrooms || []) as ClassroomEntry[]).flatMap((c) =>
      ((c.students || []) as { id: number; name: string }[]).map((s) => ({
        id: s.id,
        name: s.name,
        classroom_name: c.classroom_name ?? '',
      })),
    )
  } catch (e) {
    ElMessage.error(apiError(e, '讀取學生失敗'))
  }
}

async function loadRecent() {
  if (!form.studentId) {
    recent.value = []
    return
  }
  loadingRecent.value = true
  try {
    const { data } = await listWorkSamples(form.studentId, { limit: 20 })
    // 後端未標 response_model，型別退化為 unknown dict
    const body = data as { items?: WorkSampleItem[] } // TODO(ts-strict): waiting on backend response_model
    recent.value = body?.items || []
  } catch (e) {
    recent.value = []
  } finally {
    loadingRecent.value = false
  }
}

onMounted(async () => {
  await loadStudents()
  await loadRecent()
})

watch(() => form.studentId, loadRecent)

function resetForm() {
  form.title = ''
  form.description = ''
  form.workDate = todayISO()
  form.domain = ''
  fileList.value = []
}

function handleFileChange(_: unknown, files: UploadUserFile[]) {
  fileList.value = files
}

function handleFileRemove(_: unknown, files: UploadUserFile[]) {
  fileList.value = files
}

async function submit() {
  if (!form.studentId || !form.title.trim()) {
    ElMessage.warning('請選擇學生並填寫作品名稱')
    return
  }
  submitting.value = true
  try {
    const { data } = await createWorkSample(form.studentId, {
      title: form.title.trim(),
      description: form.description.trim() || null,
      work_date: form.workDate,
      domain: form.domain || null,
    })
    const wsId = (data as { id: number }).id // TODO(ts-strict): waiting on backend response_model
    let fail = 0
    for (const f of fileList.value) {
      try {
        await uploadWorkSamplePhoto(f.raw!, wsId)
      } catch {
        fail += 1
      }
    }
    ElMessage.success(fail ? `作品已建立（${fail} 張照片失敗）` : '作品已上傳')
    resetForm()
    await loadRecent()
  } catch (e) {
    ElMessage.error(apiError(e, '送出失敗'))
  } finally {
    submitting.value = false
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
  if (!form.studentId || !editor.editingId) return
  editor.saving = true
  try {
    await updateWorkSample(form.studentId, editor.editingId, {
      title: editor.form.title.trim(),
      description: editor.form.description.trim() || null,
      work_date: editor.form.workDate,
      domain: editor.form.domain || null,
    })
    ElMessage.success('已更新')
    editor.visible = false
    await loadRecent()
  } catch (e) {
    ElMessage.error(apiError(e, '更新失敗'))
  } finally {
    editor.saving = false
  }
}

async function confirmDelete(item: WorkSampleItem) {
  if (!form.studentId) return
  try {
    await ElMessageBox.confirm('確定刪除這件作品？附件也會一併軟刪除。', '刪除作品', {
      type: 'warning',
    })
    await deleteWorkSample(form.studentId, item.id)
    ElMessage.success('已刪除')
    await loadRecent()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  }
}

</script>

<template>
  <div class="ws-view">
    <div v-if="fromHub" class="from-hub-bar">
      <el-button type="primary" link @click="backToHub"> ← 返回今日工作台 </el-button>
    </div>
    <header class="page-header">
      <h2>作品上傳</h2>
    </header>

    <!-- 選擇學生：行動優先用可點選 chip，不用下拉（避免多層點擊） -->
    <div class="pt-card form-card">
      <h3>選擇學生</h3>
      <div v-if="!classrooms.length" class="empty">讀取中…</div>
      <div v-else class="student-groups">
        <div v-for="c in classrooms" :key="c.classroom_name" class="student-group">
          <span class="group-label">{{ c.classroom_name }}</span>
          <div class="domain-chips">
            <button
              v-for="s in c.students || []"
              :key="s.id"
              type="button"
              class="chip-btn"
              :class="{ active: form.studentId === s.id }"
              @click="form.studentId = s.id"
            >
              {{ s.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 作品表單 -->
    <div class="pt-card form-card">
      <h3>新增作品</h3>
      <el-form label-width="80px" :inline="false">
        <el-form-item label="作品名稱">
          <el-input v-model="form.title" placeholder="例如：恐龍樂園" maxlength="200" show-word-limit />
        </el-form-item>

        <el-form-item label="日期">
          <el-date-picker v-model="form.workDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>

        <el-form-item label="領域">
          <div class="domain-chips">
            <button
              type="button"
              class="chip-btn"
              :class="{ active: !form.domain }"
              @click="form.domain = ''"
            >
              不指定
            </button>
            <button
              v-for="d in DOMAINS"
              :key="d.value"
              type="button"
              class="chip-btn"
              :class="{ active: form.domain === d.value }"
              @click="form.domain = d.value"
            >
              {{ d.short }}
            </button>
          </div>
        </el-form-item>

        <el-form-item label="說明">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            placeholder="（選填）作品說明…"
          />
        </el-form-item>

        <el-form-item label="照片">
          <el-upload
            drag
            multiple
            :auto-upload="false"
            :file-list="fileList"
            :accept="IMAGE_ACCEPT"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">拖曳照片或<em>點擊上傳</em></div>
            <template #tip>
              <div class="upload-tip">支援 JPG/PNG/GIF/HEIC</div>
            </template>
          </el-upload>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="submit">送出</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 近期作品：選了學生後才顯示 -->
    <div v-if="form.studentId" class="pt-card recent-card">
      <h3>{{ selectedStudent?.name }} — 近期作品</h3>
      <p v-if="loadingRecent" class="empty">讀取中…</p>
      <EmptyState v-else-if="!recent.length" variant="default" title="尚無作品" />
      <ul v-else class="ws-list">
        <li v-for="item in recent" :key="item.id">
          <div class="ws-thumbs" v-if="item.attachments?.length">
            <img
              v-for="att in item.attachments"
              :key="att.id"
              :src="att.thumb_url || att.url"
              :alt="item.title"
            />
          </div>
          <div class="ws-meta">
            <strong>{{ item.title }}</strong>
            <span class="ws-date">{{ item.work_date }}</span>
            <span v-if="item.domain" class="domain-tag">{{ item.domain }}</span>
          </div>
          <p v-if="item.description" class="ws-desc">{{ item.description }}</p>
          <div v-if="item.created_by === currentUserId()" class="ws-actions">
            <el-button size="small" link @click="openEdit(item)">編輯</el-button>
            <el-button size="small" link type="danger" @click="confirmDelete(item)">刪除</el-button>
          </div>
        </li>
      </ul>
    </div>

    <!-- 編輯對話框 -->
    <el-dialog v-model="editor.visible" title="編輯作品" width="480px">
      <el-form label-width="80px">
        <el-form-item label="作品名稱" required>
          <el-input v-model="editor.form.title" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="日期" required>
          <el-date-picker v-model="editor.form.workDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item label="領域">
          <el-select v-model="editor.form.domain" clearable placeholder="選擇（可空）">
            <el-option v-for="d in DOMAINS" :key="d.value" :label="d.value" :value="d.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="editor.form.description" type="textarea" :rows="3" maxlength="2000" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editor.visible = false">取消</el-button>
        <el-button type="primary" :loading="editor.saving" @click="saveEdit">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ws-view { max-width: 800px; margin: 0 auto; }
.from-hub-bar { margin: 0 0 12px; padding: 4px 0; }
.page-header { margin-bottom: var(--space-3); }
.page-header h2 { margin: 0; color: var(--pt-text-strong); }

.form-card, .recent-card {
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}
.form-card h3, .recent-card h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  color: var(--pt-text-strong);
}

.student-groups { display: flex; flex-direction: column; gap: var(--space-2); }
.group-label {
  display: block;
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  margin-bottom: 4px;
}

.domain-chips { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.chip-btn {
  padding: 4px var(--space-3);
  border-radius: 999px;
  border: 1px solid var(--pt-border);
  background: var(--pt-surface-card);
  cursor: pointer;
  font-size: var(--text-sm);
}
.chip-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.upload-tip { color: var(--pt-text-muted); font-size: var(--text-xs); }

.ws-list { padding: 0; margin: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-3); }
.ws-list li { padding: var(--space-2) 0; border-bottom: var(--pt-hairline); }
.ws-list li:last-child { border-bottom: none; }

.ws-thumbs { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-2); }
.ws-thumbs img {
  width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius-md);
  background: var(--pt-surface-mute);
}

.ws-meta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ws-date { font-size: var(--text-xs); color: var(--pt-text-muted); }
.domain-tag {
  display: inline-block;
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  background: var(--pt-tint-event);
  color: var(--pt-tint-event-fg);
}
.ws-desc { margin: var(--space-1) 0 0; color: var(--pt-text-muted); font-size: var(--text-sm); }
.ws-actions { margin-top: var(--space-1); display: flex; gap: var(--space-2); }

.empty { text-align: center; color: var(--pt-text-muted); padding: var(--space-4) 0; }
</style>
