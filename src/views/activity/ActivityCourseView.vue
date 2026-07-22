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
      <!-- G8（年終批次2）：課程負責老師，年終教課獎勵金依此歸屬自動計算 -->
      <el-table-column label="負責老師" width="100" align="center">
        <template #default="{ row }">
          <span v-if="instructorName(row)">{{ instructorName(row) }}</span>
          <span v-else style="color: var(--text-tertiary);">未設定</span>
        </template>
      </el-table-column>
      <!-- 容量以佔位數（enrolled + promoted_pending）計：後端容量閘同口徑擋
           手動升位，只顯示 enrolled 會出現「看似有位、升位卻 400 容量已滿」
           的矛盾（audit C-5，2026-07-02） -->
      <el-table-column label="容量" width="90" align="center">
        <template #default="{ row }">
          <el-button
            v-if="occupying(row) > 0"
            link type="primary" size="small"
            @click="openEnrolled(row)"
          >{{ occupying(row) }}/{{ row.capacity }}</el-button>
          <span v-else>0/{{ row.capacity }}</span>
          <div v-if="(row.promoted_pending || 0) > 0" class="pending-occupancy-hint">
            含 {{ row.promoted_pending }} 待確認
          </div>
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
          <a v-if="sanitizeHref(row.video_url)" :href="sanitizeHref(row.video_url)" target="_blank" rel="noopener">
            <el-icon><VideoPlay /></el-icon>
          </a>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column v-if="canWrite" label="操作" width="160" align="center" fixed="right">
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
        <el-form-item label="講師">
          <el-input v-model="form.instructor_name" maxlength="50" placeholder="講師姓名（選填，前台課程卡顯示）" />
        </el-form-item>
        <el-form-item label="負責老師">
          <el-select
            v-model="form.instructor_employee_id"
            clearable
            filterable
            placeholder="選擇負責老師"
            style="width: 100%"
            data-test="select-instructor-employee"
          >
            <el-option
              v-for="emp in employeeOptions"
              :key="emp.id"
              :label="String(emp.name)"
              :value="emp.id"
            />
          </el-select>
          <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px;">
            年終教課獎勵金依此歸屬自動計算
          </div>
        </el-form-item>

        <el-divider content-position="left">
          <span style="font-size: 12px; color: var(--text-secondary);">
            上課時段（公開報名頁顯示用；空白＝不限制）
          </span>
        </el-divider>
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

    <!-- 手動升位確認 dialog（el-dialog：具 role="dialog"/aria-modal/focus 管理/Esc，
         取代原手刻 backdrop + modal；append-to-body 讓層級疊在 Drawer 之上） -->
    <el-dialog
      v-model="promoteDialog.open"
      title="確認手動升位"
      width="440px"
      append-to-body
      :close-on-click-modal="!promoteDialog.submitting"
      :close-on-press-escape="!promoteDialog.submitting"
      :show-close="!promoteDialog.submitting"
      @close="cancelPromote"
    >
      <p class="promote-modal__body">
        將<strong>跳過順序</strong>，立即升此候補為<strong>正式報名</strong>（不需家長 48h 確認窗）。系統會嘗試以 LINE 通知家長；若家長未綁定 LINE（如校外／未匹配報名），可能收不到通知，屆時請依 staff 通知中的提示改以電話主動告知新增費用。確定？
      </p>
      <p v-if="promoteDialog.error" class="promote-modal__error">{{ promoteDialog.error }}</p>
      <template #footer>
        <el-button @click="cancelPromote">取消</el-button>
        <el-button
          data-test="promote-confirm"
          type="primary"
          :loading="promoteDialog.submitting"
          @click="confirmPromote"
        >確認升位</el-button>
      </template>
    </el-dialog>
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
import { friendlyError } from '@/utils/errorMessages'
import { CopyDocument, VideoPlay } from '@element-plus/icons-vue'
import { copyCoursesFromPrevious, getCourses, createCourse, updateCourse, deleteCourse,
         getCourseWaitlist, getCourseEnrolled, promoteWaitlist } from '@/api/activity'
import { getEmployees } from '@/api/employees'
import type { ApiBody } from '@/api/_generated/typed'
import AcademicTermSelector from '@/components/common/AcademicTermSelector.vue'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { sanitizeHref } from '@/utils/url'

interface Course {
  id: number; name: string; price: number; sessions?: number | null; capacity: number
  allow_waitlist: boolean; video_url?: string; description?: string
  meeting_weekday?: number | null; meeting_start_time?: string; meeting_end_time?: string
  instructor_name?: string | null
  // G8（年終批次2）：課程負責老師，年終教課獎勵金依此歸屬自動計算
  instructor_employee_id?: number | null
  enrolled?: number; promoted_pending?: number; waitlist_count?: number
}
interface WaitlistItem { registration_id: number; student_name?: string; class_name?: string; waitlist_position?: number }
interface EnrolledItem { position?: number; student_name?: string; class_name?: string }

interface CourseForm {
  name: string; price: number; sessions: number | null; capacity: number; allow_waitlist: boolean
  video_url: string; description: string
  meeting_weekday: number | null; meeting_start_time: string; meeting_end_time: string
  instructor_name: string
  instructor_employee_id: number | null
}

type EmployeeOption = { id: number; name: unknown }

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
  // Phase 3：結構化時段（給家長公開頁前台 advisory 用；nullable 表示不限）
  meeting_weekday: null,
  meeting_start_time: '',
  meeting_end_time: '',
  instructor_name: '',
  instructor_employee_id: null,
})
const form = ref<CourseForm>(defaultForm())

// G8：負責老師下拉選項（在職員工），比照 YearEndRulesPanel.vue 的 fetchEmployeeOptions 慣例
const employeeOptions = ref<EmployeeOption[]>([])
async function fetchEmployeeOptions() {
  try {
    const res = await getEmployees({ is_active: true } as Parameters<typeof getEmployees>[0])
    employeeOptions.value = (res.data as EmployeeOption[]).filter((e) => e.id != null)
  } catch {
    // 非致命：下拉退化但其餘欄位仍可編輯
    ElMessage.warning('員工清單載入失敗，負責老師選擇可能不完整')
  }
}
function instructorName(row: Course): string {
  if (row.instructor_employee_id == null) return ''
  const emp = employeeOptions.value.find((e) => e.id === row.instructor_employee_id)
  return emp ? String(emp.name) : `員工 #${row.instructor_employee_id}`
}

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

// 佔位數 = enrolled + promoted_pending（與後端手動升位容量閘同口徑，
// courses.py 的 remaining 亦以此計）
function occupying(row: Course): number {
  return (row.enrolled || 0) + (row.promoted_pending || 0)
}

// review P1（2026-07-12）：候補/報名 Drawer 的載入需與 fetchCourses 同樣的請求序號守衛，
// 否則快速切換不同課程時較慢的舊課回應會最後覆寫較新課程的清單 → Drawer 標題顯示新課、
// 列卻屬舊課；此時 confirmPromote 以最新 waitlistCourse.id + 舊課列的 registration_id
// 送出，同生同時候補兩課時該 (registration_id, course_id) pair 恰為合法 → 對錯課升位加費。
let waitlistSeq = 0
let enrolledSeq = 0

async function openEnrolled(row: Course) {
  const seq = ++enrolledSeq
  enrolledCourse.value = { id: row.id, name: row.name }
  enrolledItems.value = [] // 切課先清空，避免新課標題下短暫顯示舊課清單
  enrolledDrawer.value = true
  enrolledLoading.value = true
  try {
    const res = await getCourseEnrolled(row.id)
    if (seq !== enrolledSeq) return // 過期回應：已切到別課，丟棄不覆寫
    enrolledItems.value = (res.data as { items: EnrolledItem[] }).items
  } catch (e) {
    if (seq !== enrolledSeq) return
    ElMessage.error(friendlyError('載入報名名單失敗', e))
  } finally {
    if (seq === enrolledSeq) enrolledLoading.value = false
  }
}

async function openWaitlist(row: Course) {
  const seq = ++waitlistSeq
  // 切課時重置殘留的手動升位確認框：el-drawer destroy-on-close 只拆 modal DOM、不清
  // promoteDialog 狀態，換課重開 Drawer 會帶著舊課 registration 重現升位框（見上方 P1 註）。
  cancelPromote()
  waitlistCourse.value = { id: row.id, name: row.name }
  waitlistItems.value = [] // 切課先清空，避免新課標題下短暫顯示舊課候補列
  waitlistDrawer.value = true
  waitlistLoading.value = true
  try {
    const res = await getCourseWaitlist(row.id)
    if (seq !== waitlistSeq) return // 過期回應：已切到別課，丟棄不覆寫（否則標題與清單錯配）
    waitlistItems.value = (res.data as { items: WaitlistItem[] }).items
  } catch (e) {
    if (seq !== waitlistSeq) return
    ElMessage.error(friendlyError('載入候補名單失敗', e))
  } finally {
    if (seq === waitlistSeq) waitlistLoading.value = false
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

// F5：切換學期競態守衛。每次載入遞增序號，回應落地前比對序號；快速切學期時較慢的
// 舊請求後回不得覆寫較新請求的結果（否則頁面顯示新學期但資料屬舊學期）。
let fetchSeq = 0
async function fetchCourses() {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const res = await getCourses({
      school_year: termStore.school_year,
      semester: termStore.semester,
    })
    if (seq !== fetchSeq) return // 過期回應：已有更新的載入，丟棄不覆寫
    courses.value = (res.data as { courses: Course[] }).courses
  } catch (e) {
    if (seq !== fetchSeq) return
    // F4：載入失敗須清空清單，否則切學期失敗時畫面留著上一學期的資料且編輯/停用
    // 按鈕仍可操作（學期選擇器顯示新學期但資料屬舊學期），易誤改到舊學期資料。
    courses.value = []
    ElMessage.error(friendlyError('載入課程失敗', e))
  } finally {
    if (seq === fetchSeq) loading.value = false
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
    } as ApiBody<'/activity/courses/copy-from-previous', 'post'>)
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
    meeting_weekday: row.meeting_weekday ?? null,
    meeting_start_time: row.meeting_start_time || '',
    meeting_end_time: row.meeting_end_time || '',
    instructor_name: row.instructor_name || '',
    instructor_employee_id: row.instructor_employee_id ?? null,
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!form.value.name || form.value.price == null) {
    return ElMessage.warning('請填寫課程名稱和價格')
  }
  // Phase 3 前端驗證：與後端 Pydantic validator 同步
  const f = form.value
  if (f.meeting_start_time && f.meeting_end_time && f.meeting_start_time >= f.meeting_end_time) {
    return ElMessage.warning('上課起始時刻必須早於結束時刻')
  }
  // 後端期望 time field 為 "HH:MM" 字串或 null
  const payload = {
    ...f,
    meeting_start_time: f.meeting_start_time || null,
    meeting_end_time: f.meeting_end_time || null,
    instructor_name: f.instructor_name || null,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateCourse(editingId.value, payload)
      ElMessage.success('課程更新成功')
    } else {
      // 帶上 selector 選定學期：否則後端缺省成當前學期，非當前學期新增會「消失」
      // 並污染當前學期資料（與 fetchCourses 同樣以 termStore 查詢對齊）
      await createCourse({
        ...payload,
        school_year: termStore.school_year,
        semester: termStore.semester,
      })
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

onMounted(() => {
  fetchCourses()
  fetchEmployeeOptions()
})
</script>

<style scoped>
.activity-courses { padding: 16px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 12px; flex-wrap: wrap; }
.toolbar h2 { margin: 0; font-size: 20px; font-weight: 600; }
.toolbar__actions { display: flex; gap: 8px; align-items: center; }
.pending-occupancy-hint { font-size: 11px; color: var(--el-color-warning); line-height: 1.2; }
</style>

<style>
/* 升位 dialog 內容（append-to-body 脫離 scoped 範圍，維持 global；
   backdrop/modal 外殼已改用 el-dialog，僅保留內文樣式） */
.promote-modal__body {
  font-size: 14px;
  color: var(--text-regular, #606266);
  line-height: 1.6;
  margin: 0;
}
.promote-modal__error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--el-color-danger, #f56c6c);
}
</style>
