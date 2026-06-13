<template>
  <div class="activity-courses">
    <div class="toolbar">
      <h2>課程管理</h2>
      <div class="toolbar__actions">
        <AcademicTermSelector />
        <el-button v-if="canWrite" @click="openCopyDialog" :icon="CopyDocument">複製上學期</el-button>
        <el-button v-if="canWrite" type="primary" @click="openCreate">新增課程</el-button>
      </div>
    </div>

    <el-table :data="courses" v-loading="loading" border>
      <el-table-column label="課程名稱" prop="name" min-width="140" />
      <el-table-column label="價格" prop="price" width="90" align="right">
        <template #default="{ row }">${{ row.price?.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="堂數" prop="sessions" width="70" align="center">
        <template #default="{ row }">{{ row.sessions ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="上課時段" min-width="140">
        <template #default="{ row }">
          <span v-if="formatSchedule(row)">{{ formatSchedule(row) }}</span>
          <span v-else style="color: var(--text-tertiary);">-</span>
        </template>
      </el-table-column>
      <el-table-column label="容量" width="70" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.enrolled > 0"
            link type="primary" size="small"
            @click="openEnrolled(row)"
          >{{ row.enrolled }}/{{ row.capacity }}</el-button>
          <span v-else>0/{{ row.capacity }}</span>
        </template>
      </el-table-column>
      <el-table-column label="候補" width="70" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.waitlist_count > 0"
            link type="warning" size="small"
            @click="openWaitlist(row)"
          >{{ row.waitlist_count }}</el-button>
          <span v-else>0</span>
        </template>
      </el-table-column>
      <el-table-column label="允許候補" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.allow_waitlist ? 'success' : 'info'" size="small">
            {{ row.allow_waitlist ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="影片" width="60" align="center">
        <template #default="{ row }">
          <a v-if="row.video_url" :href="row.video_url" target="_blank" rel="noopener">
            <el-icon><VideoPlay /></el-icon>
          </a>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="130" align="center" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)" :loading="deletingId === row.id">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-empty
      v-if="!loading && courses.length === 0"
      description="尚無課程資料"
      style="padding: 40px 0"
    />

    <!-- 新增/編輯對話框 -->
    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯課程' : '新增課程'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="90px" size="default">
        <el-form-item label="課程名稱" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="價格（元）" required>
          <el-input-number v-model="form.price" :min="0" :max="999999" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="堂數">
          <el-input-number v-model="form.sessions" :min="1" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="1" :step="1" :precision="0" style="width: 100%" />
        </el-form-item>
        <el-form-item label="允許候補">
          <el-switch v-model="form.allow_waitlist" />
        </el-form-item>
        <el-form-item label="影片 URL">
          <el-input v-model="form.video_url" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>

        <el-divider content-position="left">
          <span style="font-size: 12px; color: var(--text-secondary);">
            適齡 / 上課時段（公開報名頁顯示用；空白＝不限制）
          </span>
        </el-divider>
        <el-form-item label="建議月齡">
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            <el-input-number
              v-model="form.min_age_months"
              :min="0"
              :max="240"
              :step="6"
              :precision="0"
              placeholder="最小"
              controls-position="right"
              style="flex: 1;"
            />
            <span style="color: var(--text-tertiary);">~</span>
            <el-input-number
              v-model="form.max_age_months"
              :min="0"
              :max="240"
              :step="6"
              :precision="0"
              placeholder="最大"
              controls-position="right"
              style="flex: 1;"
            />
            <span style="color: var(--text-secondary); font-size: 12px; flex-shrink: 0;">月齡</span>
          </div>
        </el-form-item>
        <el-form-item label="上課星期">
          <el-select
            v-model="form.meeting_weekday"
            placeholder="選擇上課星期"
            clearable
            style="width: 100%;"
          >
            <el-option :value="0" label="週一" />
            <el-option :value="1" label="週二" />
            <el-option :value="2" label="週三" />
            <el-option :value="3" label="週四" />
            <el-option :value="4" label="週五" />
            <el-option :value="5" label="週六" />
            <el-option :value="6" label="週日" />
          </el-select>
        </el-form-item>
        <el-form-item label="上課時間">
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            <el-time-picker
              v-model="form.meeting_start_time"
              value-format="HH:mm"
              format="HH:mm"
              placeholder="起始"
              style="flex: 1;"
            />
            <span style="color: var(--text-tertiary);">~</span>
            <el-time-picker
              v-model="form.meeting_end_time"
              value-format="HH:mm"
              format="HH:mm"
              placeholder="結束"
              style="flex: 1;"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving" :disabled="saving">儲存</el-button>
      </template>
    </el-dialog>
  <!-- 候補名單 Drawer -->
  <el-drawer
    v-model="waitlistDrawer"
    :title="`候補名單 — ${waitlistCourse?.name ?? ''}`"
    direction="rtl" size="420px" destroy-on-close
  >
    <el-table :data="waitlistItems" v-loading="waitlistLoading" border size="small">
      <el-table-column label="序號" prop="waitlist_position" width="60" align="center" />
      <el-table-column label="學生姓名" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" width="90" />
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button
            v-if="canWrite"
            :data-test="`promote-waitlist-btn-${row.registration_id}`"
            size="small" type="success"
            @click="openPromoteDialog(row)"
          >升正式</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 手動升位確認 dialog -->
    <div v-if="promoteDialog.open" class="promote-backdrop" @click.self="cancelPromote">
      <div class="promote-modal">
        <h3 class="promote-modal__title">確認手動升位</h3>
        <p class="promote-modal__body">
          將<strong>跳過順序</strong>，立即升此候補為<strong>正式報名</strong>（不需家長 48h 確認窗）。系統會自動推送 LINE 告知家長。確定？
        </p>
        <div class="promote-modal__actions">
          <el-button @click="cancelPromote">取消</el-button>
          <el-button
            data-test="promote-confirm"
            type="primary"
            :loading="promoteDialog.submitting"
            @click="confirmPromote"
          >確認升位</el-button>
        </div>
        <p v-if="promoteDialog.error" class="promote-modal__error">{{ promoteDialog.error }}</p>
      </div>
    </div>
    <div v-if="!waitlistLoading && waitlistItems.length === 0"
         style="text-align:center; padding: 32px; color: var(--text-tertiary);">
      目前無候補學生
    </div>
  </el-drawer>

  <!-- 正式報名名單 Drawer -->
  <el-drawer
    v-model="enrolledDrawer"
    :title="`報名名單 — ${enrolledCourse?.name ?? ''}`"
    direction="rtl" size="420px" destroy-on-close
  >
    <el-table :data="enrolledItems" v-loading="enrolledLoading" border size="small">
      <el-table-column label="序號" prop="position" width="60" align="center" />
      <el-table-column label="學生姓名" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" width="90" />
    </el-table>
    <div v-if="!enrolledLoading && enrolledItems.length === 0"
         style="text-align:center; padding: 32px; color: var(--text-tertiary);">
      目前無正式報名學生
    </div>
  </el-drawer>

  <!-- 複製上學期課程對話框 -->
  <el-dialog v-model="copyDialogVisible" title="複製上學期課程" width="460px" destroy-on-close>
    <el-form :model="copyForm" label-width="100px" size="default">
      <el-form-item label="來源學年度">
        <el-input-number v-model="copyForm.source_school_year" :min="100" :max="200" style="width: 120px" />
      </el-form-item>
      <el-form-item label="來源學期">
        <el-radio-group v-model="copyForm.source_semester">
          <el-radio :value="1">上學期</el-radio>
          <el-radio :value="2">下學期</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="目標學期">
        {{ termStore.school_year }} 學年度
        {{ termStore.semester === 1 ? '上' : '下' }}學期（當前）
      </el-form-item>
      <el-alert
        title="已存在同名課程會自動跳過；不含任何報名、候補或繳費記錄。"
        type="info"
        :closable="false"
        show-icon
      />
    </el-form>
    <template #footer>
      <el-button @click="copyDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="copying" @click="handleCopy">確認複製</el-button>
    </template>
  </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, VideoPlay } from '@element-plus/icons-vue'
import { copyCoursesFromPrevious, getCourses, createCourse, updateCourse, deleteCourse,
         getCourseWaitlist, getCourseEnrolled, promoteWaitlist } from '@/api/activity'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'

interface Course {
  id: number; name: string; price: number; sessions?: number | null; capacity: number
  allow_waitlist: boolean; video_url?: string; description?: string
  min_age_months?: number | null; max_age_months?: number | null
  meeting_weekday?: number | null; meeting_start_time?: string; meeting_end_time?: string
  enrolled?: number; waitlist_count?: number
}
interface WaitlistItem { registration_id: number; student_name?: string; class_name?: string; waitlist_position?: number }
interface EnrolledItem { position?: number; student_name?: string; class_name?: string }

interface CourseForm {
  name: string; price: number; sessions: number | null; capacity: number; allow_waitlist: boolean
  video_url: string; description: string; min_age_months: number | null; max_age_months: number | null
  meeting_weekday: number | null; meeting_start_time: string; meeting_end_time: string
}

const termStore = useAcademicTermStore()

// 對齊 ActivityRegistrationView 慣例：READ-only 使用者隱藏 mutation 入口（後端守衛 ACTIVITY_WRITE）
const canWrite = computed(() => hasPermission('ACTIVITY_WRITE'))

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
function formatSchedule(row: Course) {
  if (row.meeting_weekday == null || !row.meeting_start_time || !row.meeting_end_time) {
    return ''
  }
  return `週${WEEKDAY_LABELS[row.meeting_weekday]} ${row.meeting_start_time}–${row.meeting_end_time}`
}

const courses = ref<Course[]>([])
const loading = ref(false)
const deletingId = ref<number | null>(null)
const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const copyDialogVisible = ref(false)
const copying = ref(false)
const copyForm = ref<{ source_school_year: number | null; source_semester: number }>({ source_school_year: null, source_semester: 1 })

const defaultForm = (): CourseForm => ({
  name: '',
  price: 0,
  sessions: null,
  capacity: 30,
  allow_waitlist: true,
  video_url: '',
  description: '',
  // Phase 3：適齡 + 結構化時段（給家長公開頁前台 advisory 用；nullable 表示不限）
  min_age_months: null,
  max_age_months: null,
  meeting_weekday: null,
  meeting_start_time: '',
  meeting_end_time: '',
})
const form = ref<CourseForm>(defaultForm())

const waitlistDrawer = ref(false)
const waitlistCourse = ref<{ id: number; name: string } | null>(null)
const waitlistItems = ref<WaitlistItem[]>([])
const waitlistLoading = ref(false)

const promoteDialog = reactive<{
  open: boolean
  registration: WaitlistItem | null
  submitting: boolean
  error: string
}>({
  open: false,
  registration: null,
  submitting: false,
  error: '',
})

const enrolledDrawer = ref(false)
const enrolledCourse = ref<{ id: number; name: string } | null>(null)
const enrolledItems = ref<EnrolledItem[]>([])
const enrolledLoading = ref(false)

async function openEnrolled(row: Course) {
  enrolledCourse.value = { id: row.id, name: row.name }
  enrolledDrawer.value = true
  enrolledLoading.value = true
  try {
    const res = await getCourseEnrolled(row.id)
    enrolledItems.value = (res.data as { items: EnrolledItem[] }).items
  } catch {
    ElMessage.error('載入報名名單失敗')
  } finally {
    enrolledLoading.value = false
  }
}

async function openWaitlist(row: Course) {
  waitlistCourse.value = { id: row.id, name: row.name }
  waitlistDrawer.value = true
  waitlistLoading.value = true
  try {
    const res = await getCourseWaitlist(row.id)
    waitlistItems.value = (res.data as { items: WaitlistItem[] }).items
  } catch {
    ElMessage.error('載入候補名單失敗')
  } finally {
    waitlistLoading.value = false
  }
}

function openPromoteDialog(reg: WaitlistItem) {
  promoteDialog.registration = reg
  promoteDialog.error = ''
  promoteDialog.open = true
}

function cancelPromote() {
  promoteDialog.open = false
  promoteDialog.registration = null
  promoteDialog.error = ''
}

async function confirmPromote() {
  if (!promoteDialog.registration) return
  promoteDialog.submitting = true
  promoteDialog.error = ''
  try {
    await promoteWaitlist(
      promoteDialog.registration.registration_id,
      waitlistCourse.value!.id,
    )
    ElMessage.success(`${promoteDialog.registration.student_name} 已升為正式報名`)
    promoteDialog.open = false
    promoteDialog.registration = null
    const res = await getCourseWaitlist(waitlistCourse.value!.id)
    waitlistItems.value = (res.data as { items: WaitlistItem[] }).items
    await fetchCourses()
  } catch (e) {
    promoteDialog.error = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '升位失敗，請稍後再試'
  } finally {
    promoteDialog.submitting = false
  }
}

async function fetchCourses() {
  loading.value = true
  try {
    const res = await getCourses({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    courses.value = (res.data as { courses: Course[] }).courses
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

watch(
  () => [termStore.school_year, termStore.semester],
  () => fetchCourses()
)

function openCopyDialog() {
  // 預設來源=上學期
  const cy = termStore.school_year
  const cs = termStore.semester
  copyForm.value = cs === 1
    ? { source_school_year: cy - 1, source_semester: 2 }
    : { source_school_year: cy, source_semester: 1 }
  copyDialogVisible.value = true
}

async function handleCopy() {
  copying.value = true
  try {
    const res = await copyCoursesFromPrevious({
      source_school_year: copyForm.value.source_school_year,
      source_semester: copyForm.value.source_semester,
      target_school_year: termStore.school_year,
      target_semester: termStore.semester,
    })
    ElMessage.success((res.data as { message: string }).message)
    copyDialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '複製失敗')
  } finally {
    copying.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.value = defaultForm()
  dialogVisible.value = true
}

function openEdit(row: Course) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    price: row.price,
    sessions: row.sessions ?? null,
    capacity: row.capacity,
    allow_waitlist: row.allow_waitlist,
    video_url: row.video_url || '',
    description: row.description || '',
    min_age_months: row.min_age_months ?? null,
    max_age_months: row.max_age_months ?? null,
    meeting_weekday: row.meeting_weekday ?? null,
    meeting_start_time: row.meeting_start_time || '',
    meeting_end_time: row.meeting_end_time || '',
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫課程名稱和價格')
  }
  // Phase 3 前端驗證：與後端 Pydantic validator 同步
  const f = form.value
  if (f.min_age_months != null && f.max_age_months != null && f.min_age_months > f.max_age_months) {
    return ElMessage.warning('最小月齡不可大於最大月齡')
  }
  if (f.meeting_start_time && f.meeting_end_time && f.meeting_start_time >= f.meeting_end_time) {
    return ElMessage.warning('上課起始時刻必須早於結束時刻')
  }
  // 後端期望 time field 為 "HH:MM" 字串或 null
  const payload = {
    ...f,
    meeting_start_time: f.meeting_start_time || null,
    meeting_end_time: f.meeting_end_time || null,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateCourse(editingId.value, payload)
      ElMessage.success('課程更新成功')
    } else {
      await createCourse(payload)
      ElMessage.success('課程新增成功')
    }
    dialogVisible.value = false
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '操作失敗')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Course) {
  try {
    await ElMessageBox.confirm(`確定要停用課程「${row.name}」嗎？`, '確認停用', {
      type: 'warning',
      confirmButtonText: '確定停用',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deleteCourse(row.id)
    ElMessage.success('課程已停用')
    fetchCourses()
  } catch (e) {
    ElMessage.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '停用失敗')
  } finally {
    deletingId.value = null
  }
}

onMounted(fetchCourses)
</script>

<style scoped>
.activity-courses { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.toolbar__actions { display: flex; gap: 8px; align-items: center; }
</style>

<style>
.promote-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2100;
}
.promote-modal {
  background: #fff;
  border-radius: 8px;
  padding: 24px 28px;
  width: 400px;
  max-width: 92vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}
.promote-modal__title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #303133);
}
.promote-modal__body {
  font-size: 14px;
  color: var(--text-regular, #606266);
  line-height: 1.6;
  margin: 0 0 20px;
}
.promote-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.promote-modal__error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-color-danger, #f56c6c);
}
</style>
