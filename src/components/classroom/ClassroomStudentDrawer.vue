<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Close,
  Edit,
  InfoFilled,
  Plus,
  Search,
  Warning,
  ArrowLeft,
} from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { downloadFile } from '@/utils/download'
import { capacityPercent, capacityStatus } from '@/utils/classroomCapacity'
import { useIsMobile } from '@/composables/useIsMobile'
import { useClassroomProspects } from '@/composables/useClassroomProspects'
import StudentEditDialog from '@/components/student/StudentEditDialog.vue'
import StudentDetailPanel from '@/components/student/StudentDetailPanel.vue'

interface StudentRecord {
  [key: string]: unknown
  id: number
  name?: string
  student_id?: string
  gender?: string
  is_active?: boolean
  status?: string
  allergy?: string
  medication?: string
  special_needs?: string
}

interface ClassroomProp {
  id?: number
  name?: string
  class_code?: string | null
  grade_name?: string
  grade_id?: number
  school_year?: number
  semester?: number
  semester_label?: string
  is_active?: boolean
  capacity?: number
  current_count?: number
  head_teacher_name?: string | null
  assistant_teacher_name?: string | null
  english_teacher_name?: string | null
  art_teacher_name?: string | null
  students?: StudentRecord[]
}

/** 性別篩選值；「未填」＝性別不是「男」也不是「女」（含空字串／null）。 */
type GenderFilter = '' | '男' | '女' | '未填'

const props = withDefaults(defineProps<{
  visible?: boolean
  classroom?: ClassroomProp | null
  loading?: boolean
}>(), {
  visible: false,
  classroom: null,
  loading: false,
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'student-updated': []
}>()

const router = useRouter()

const canWriteStudents = computed(() => hasPermission('STUDENTS_WRITE'))

// ── 準新生／保留座位（呈現用，不計入在學人數/點名/收費）──────
const prospectKey = computed(() => ({
  grade_id: props.classroom?.grade_id ?? null,
  school_year: props.classroom?.school_year ?? null,
  semester: props.classroom?.semester ?? null,
}))
const { reservedCount, prospects, reload: reloadProspects } = useClassroomProspects(prospectKey)
watch(
  () => [props.visible, props.classroom?.id] as const,
  ([v]) => {
    if (v) void reloadProspects()
  },
  { immediate: true },
)

// ── 名冊篩選 ────────────────────────────────────────
const studentSearch = ref('')
const studentGenderFilter = ref<GenderFilter>('')
const showHealthOnly = ref(false)
const showInactive = ref(false)

const isKnownGender = (gender: string | undefined) => gender === '男' || gender === '女'

const activeStudents = computed(() =>
  (props.classroom?.students || []).filter((s) => s.is_active !== false),
)
const inactiveStudents = computed(() =>
  (props.classroom?.students || []).filter((s) => s.is_active === false),
)
const visibleStudents = computed(() => {
  const base = showInactive.value
    ? (props.classroom?.students || [])
    : activeStudents.value
  return base.filter((s) => {
    const matchSearch = !studentSearch.value
      || (s.name || '').includes(studentSearch.value)
      || s.student_id?.includes(studentSearch.value)
    const matchGender = !studentGenderFilter.value
      || (studentGenderFilter.value === '未填' ? !isKnownGender(s.gender) : s.gender === studentGenderFilter.value)
    const matchHealth = !showHealthOnly.value || !!hasHealthAlert(s)
    return matchSearch && matchGender && matchHealth
  })
})

// 統計 pill 兼作快速篩選：再點一次同條件即取消
const toggleGenderFilter = (gender: Exclude<GenderFilter, ''>) => {
  studentGenderFilter.value = studentGenderFilter.value === gender ? '' : gender
}
const toggleHealthFilter = () => {
  showHealthOnly.value = !showHealthOnly.value
}
const clearFilters = () => {
  studentGenderFilter.value = ''
  showHealthOnly.value = false
  studentSearch.value = ''
}

// 容量進度（與班級卡片同一套口徑）
const capacityPct = computed(() => capacityPercent(activeStudents.value.length, props.classroom?.capacity))
// 比照班級卡片：正常不上色（整條綠會稀釋真正的警訊），改由 capacityProgressColor 給中性灰；
// 只有接近額滿（warning）／已滿（exception）才用 el-progress 的狀態色。
const capacityProgressStatus = computed<'' | 'warning' | 'exception'>(() => {
  const s = capacityStatus(activeStudents.value.length, props.classroom?.capacity)
  return s === 'full' ? 'exception' : s === 'warning' ? 'warning' : ''
})
const capacityProgressColor = computed(() => (
  capacityProgressStatus.value === '' ? 'var(--el-text-color-placeholder)' : ''
))

const studentStats = computed(() => {
  const students = activeStudents.value
  return students.reduce(
    (acc, s) => {
      if (s.gender === '男') acc.maleCount++
      else if (s.gender === '女') acc.femaleCount++
      else acc.unknownGenderCount++
      if (s.allergy || s.medication || s.special_needs) acc.healthAlertCount++
      return acc
    },
    { maleCount: 0, femaleCount: 0, unknownGenderCount: 0, healthAlertCount: 0 },
  )
})

const avatarBgColor = (gender: string | undefined) => {
  if (gender === '男') return 'var(--el-color-primary)'
  if (gender === '女') return 'var(--el-color-danger)'
  return 'var(--el-color-info)'
}

const hasHealthAlert = (s: StudentRecord) => s.allergy || s.medication || s.special_needs

const healthAlertText = (s: StudentRecord) =>
  [
    s.allergy && `過敏：${s.allergy}`,
    s.medication && `用藥：${s.medication}`,
    s.special_needs && `特殊需求：${s.special_needs}`,
  ]
    .filter(Boolean)
    .join('／')

// 未選學生時右側的「師資」摘要（欄位來自 getClassroom 詳情）
const teacherRows = computed(() => [
  { label: '班導', name: props.classroom?.head_teacher_name },
  { label: '副班導', name: props.classroom?.assistant_teacher_name },
  // 與班級列表一致：english_teacher_name 為標準欄位，art_teacher_name 為 legacy 同義
  { label: '美語老師', name: props.classroom?.english_teacher_name || props.classroom?.art_teacher_name },
])

// ── 詳情選擇 ────────────────────────────────────────
const selectedStudentId = ref<number | null>(null)
const selectedStudent = computed(() =>
  visibleStudents.value.find((s) => s.id === selectedStudentId.value)
    || (props.classroom?.students || []).find((s) => s.id === selectedStudentId.value)
    || null,
)
const handleSelectStudent = (student: StudentRecord) => {
  selectedStudentId.value = student.id
}

// 切換班級時重設選擇
watch(
  () => props.classroom?.id,
  () => { selectedStudentId.value = null },
)
// 關閉 drawer 時重設選擇
watch(
  () => props.visible,
  (val) => {
    if (!val) selectedStudentId.value = null
  },
)

// 手機切換顯示
const { isMobile } = useIsMobile()
const mobileShowDetail = computed(() => isMobile.value && selectedStudentId.value)

// ── 學生新增/編輯 dialog ────────────────────────────
const editDialogVisible = ref(false)
const editMode = ref<'create' | 'edit'>('create')
const editInitial = ref<Record<string, unknown> | undefined>(undefined)

const handleStudentAdd = () => {
  editInitial.value = undefined
  editMode.value = 'create'
  editDialogVisible.value = true
}

const handleStudentEdit = (student: StudentRecord) => {
  editInitial.value = { ...student }
  editMode.value = 'edit'
  editDialogVisible.value = true
}

const handleEditSaved = () => emit('student-updated')

// ── 開完整檔案 ──────────────────────────────────────
/**
 * 準新生 → 招生入學訪視明細（2026-09-06）。
 * 帶姓名關鍵字讓對方一進去就看到那一筆，不必自己再搜一次。
 */
const openProspectVisit = (p: { child_name?: string | null }) => {
  router.push({
    path: '/students/admissions',
    query: { tab: 'records', keyword: String(p.child_name ?? '') },
  })
}

const handleOpenFullPage = () => {
  if (!selectedStudentId.value) {
    ElMessage.info('請先在左側選擇學生')
    return
  }
  router.push({
    name: 'student-profile',
    params: { id: selectedStudentId.value },
    query: {
      from: 'classroom',
      classroom_id: props.classroom?.id,
    },
  })
}

// ── 匯出名冊（本班在籍＋離班；沿用 /exports/students，篩選限定 classroom_id）──
const handleExportRoster = () => {
  if (!props.classroom?.id) return
  void downloadFile(
    '/exports/students',
    `${props.classroom.name || '班級'}名冊.xlsx`,
    { classroom_id: props.classroom.id },
  )
}

const close = () => emit('update:visible', false)
</script>

<template>
  <el-drawer
    :model-value="visible"
    direction="rtl"
    size="1100px"
    :show-close="true"
    :destroy-on-close="true"
    :with-header="false"
    @update:model-value="emit('update:visible', $event)"
    @close="close"
    class="classroom-student-drawer"
  >
    <div v-loading="loading" class="drawer-body">
      <template v-if="classroom">
        <!-- 標頭：白底、下框線分隔；動作分主次（新增學生為 primary），關閉為 icon-only -->
        <header class="drawer-header">
          <div class="header-main">
            <div class="header-title-row">
              <h2 class="header-title">{{ classroom.name }}</h2>
              <span v-if="classroom.class_code" class="code-chip">{{ classroom.class_code }}</span>
              <span
                class="status-label"
                :class="classroom.is_active ? 'status-label--on' : 'status-label--off'"
              >
                <span class="status-dot" aria-hidden="true" />
                {{ classroom.is_active ? '啟用中' : '已停用' }}
              </span>
            </div>
            <div class="header-subtitle">
              {{ classroom.semester_label }} · {{ classroom.grade_name || '未設定年級' }}
            </div>
          </div>
          <div class="header-actions">
            <el-button
              v-if="selectedStudentId"
              class="banner-btn"
              @click="handleOpenFullPage"
            >開完整檔案</el-button>
            <el-button
              class="banner-btn"
              @click="handleExportRoster"
            >匯出名冊</el-button>
            <el-button
              v-if="canWriteStudents"
              type="primary"
              :icon="Plus"
              class="banner-btn"
              @click="handleStudentAdd"
            >新增學生</el-button>
          </div>
          <el-button
            class="header-close"
            text
            :icon="Close"
            aria-label="關閉名冊"
            @click="close"
          />
        </header>

        <!-- 統計 pill row（兼作快速篩選；再點一次取消）。平常中性色，只有 pressed 才上色 -->
        <div class="stat-pills-row" role="group" aria-label="學生統計與篩選">
          <button
            type="button"
            class="stat-pill stat-pill--primary"
            :class="{ 'is-active': !studentGenderFilter && !showHealthOnly, 'is-zero': activeStudents.length === 0 }"
            :aria-pressed="!studentGenderFilter && !showHealthOnly"
            @click="clearFilters"
          >在學 <span class="stat-pill-value">{{ activeStudents.length }}</span></button>
          <button
            type="button"
            class="stat-pill stat-pill--info"
            :class="{ 'is-active': studentGenderFilter === '男', 'is-zero': studentStats.maleCount === 0 }"
            :aria-pressed="studentGenderFilter === '男'"
            @click="toggleGenderFilter('男')"
          >男生 <span class="stat-pill-value">{{ studentStats.maleCount }}</span></button>
          <button
            type="button"
            class="stat-pill stat-pill--danger"
            :class="{ 'is-active': studentGenderFilter === '女', 'is-zero': studentStats.femaleCount === 0 }"
            :aria-pressed="studentGenderFilter === '女'"
            @click="toggleGenderFilter('女')"
          >女生 <span class="stat-pill-value">{{ studentStats.femaleCount }}</span></button>
          <button
            type="button"
            class="stat-pill stat-pill--unknown"
            :class="{ 'is-active': studentGenderFilter === '未填', 'is-zero': studentStats.unknownGenderCount === 0 }"
            :aria-pressed="studentGenderFilter === '未填'"
            @click="toggleGenderFilter('未填')"
          >性別未填 <span class="stat-pill-value">{{ studentStats.unknownGenderCount }}</span></button>
          <button
            type="button"
            class="stat-pill stat-pill--warning"
            :class="{ 'is-active': showHealthOnly, 'is-zero': studentStats.healthAlertCount === 0 }"
            :aria-pressed="showHealthOnly"
            @click="toggleHealthFilter"
          >需注意 <span class="stat-pill-value">{{ studentStats.healthAlertCount }}</span></button>
        </div>

        <!-- 容量進度（在學/容量 + 保留座位）-->
        <div class="capacity-bar">
          <div class="capacity-bar-text">
            <span class="capacity-count">容量 {{ activeStudents.length }} / {{ classroom.capacity ?? '—' }}</span>
            <span v-if="reservedCount > 0" class="capacity-reserved">· 保留 {{ reservedCount }}</span>
          </div>
          <el-progress
            :percentage="capacityPct"
            :status="capacityProgressStatus"
            :color="capacityProgressColor"
            :stroke-width="6"
            :show-text="false"
          />
        </div>

        <!-- Split view -->
        <div class="split-view" :class="{ 'mobile-show-detail': mobileShowDetail }">
          <!-- 左欄：學生名冊 -->
          <aside class="roster-pane">
            <div class="roster-filters">
              <el-input
                v-model="studentSearch"
                placeholder="搜尋姓名或學號"
                clearable
                size="small"
              >
                <template #prefix><el-icon><Search /></el-icon></template>
              </el-input>
              <el-switch
                v-if="inactiveStudents.length > 0"
                v-model="showInactive"
                size="small"
                :active-text="`含離班 ${inactiveStudents.length}`"
              />
            </div>

            <div class="roster-list">
              <el-empty
                v-if="!classroom.students || classroom.students.length === 0"
                description="目前沒有學生"
                :image-size="80"
              />
              <el-empty
                v-else-if="visibleStudents.length === 0"
                description="找不到符合條件的學生"
                :image-size="80"
              />
              <ul v-else class="roster-items" role="listbox" aria-label="學生名冊">
                <li
                  v-for="s in visibleStudents"
                  :key="s.id"
                  class="roster-item"
                  role="option"
                  tabindex="0"
                  :aria-selected="s.id === selectedStudentId"
                  :class="{
                    selected: s.id === selectedStudentId,
                    inactive: s.is_active === false,
                  }"
                  @click="handleSelectStudent(s)"
                  @keydown.enter.prevent="handleSelectStudent(s)"
                  @keydown.space.prevent="handleSelectStudent(s)"
                >
                  <el-avatar
                    :size="36"
                    :style="{
                      backgroundColor: s.is_active === false ? 'var(--el-text-color-disabled)' : avatarBgColor(s.gender),
                      fontSize: '14px',
                      flexShrink: 0,
                    }"
                  >{{ s.name?.[0] }}</el-avatar>
                  <div class="roster-meta">
                    <div class="roster-name">
                      <span>{{ s.name }}</span>
                      <el-tag v-if="s.is_active === false" size="small" type="info">{{ s.status || '已離班' }}</el-tag>
                      <el-tooltip v-if="hasHealthAlert(s)" :content="healthAlertText(s)" placement="top">
                        <el-icon class="alert-icon"><Warning /></el-icon>
                      </el-tooltip>
                    </div>
                    <div class="roster-sub">
                      <span class="muted">{{ s.student_id || '—' }}</span>
                      <el-tag v-if="s.gender === '男'" type="primary" size="small" effect="plain">男</el-tag>
                      <el-tag v-else-if="s.gender === '女'" type="danger" size="small" effect="plain">女</el-tag>
                    </div>
                  </div>
                  <div v-if="canWriteStudents" class="roster-actions" @click.stop>
                    <el-tooltip content="編輯" placement="top">
                      <el-button
                        :aria-label="`編輯 ${s.name} 的資料`"
                        size="small"
                        :icon="Edit"
                        plain
                        circle
                        @click="handleStudentEdit(s)"
                      />
                    </el-tooltip>
                  </div>
                </li>
              </ul>
            </div>

            <!-- 準新生／保留座位（尚未註冊、不計入在學人數）-->
            <div v-if="prospects.length" class="prospect-section">
              <el-collapse>
                <el-collapse-item
                  :title="`準新生／保留座位（${prospects.length}）— 尚未註冊、不計入在學人數`"
                >
                  <ul class="prospect-items">
                    <li v-for="p in prospects" :key="p.id" class="prospect-item">
                      <!-- 2026-09-06：原本是純文字清單，看到名字卻沒有任何去處，
                           要處理得自己切到招生入學再用姓名搜尋一次。 -->
                      <button
                        type="button"
                        class="prospect-name prospect-name--link"
                        data-test="prospect-open-visit"
                        @click="openProspectVisit(p)"
                      >
                        {{ p.child_name }}
                      </button>
                      <el-tag size="small" type="info">{{ p.target_semester === 2 ? '下學期' : '上學期' }}</el-tag>
                      <span v-if="p.source" class="muted">{{ p.source }}</span>
                      <el-tag v-if="p.has_deposit" size="small" type="success">已預繳</el-tag>
                    </li>
                  </ul>
                </el-collapse-item>
              </el-collapse>
            </div>
          </aside>

          <!-- 右欄：學生詳情 -->
          <section class="detail-pane">
            <div v-if="isMobile && selectedStudent" class="mobile-back">
              <el-button text :icon="ArrowLeft" @click="selectedStudentId = null">回名冊</el-button>
            </div>
            <StudentDetailPanel
              v-if="selectedStudent"
              :key="selectedStudent.id"
              :student-id="selectedStudent.id"
              mode="drawer"
              context="classroom"
              :classroom-id="classroom.id"
              :sync-url="false"
              @student-updated="emit('student-updated')"
              @lifecycle-changed="emit('student-updated')"
            />
            <!-- 未選學生：顯示班級摘要，不留白 -->
            <div v-else class="detail-summary">
              <p class="summary-hint">點選左側學生查看完整資料；以下為本班摘要。</p>

              <section class="summary-section" aria-labelledby="summary-teachers-title">
                <h3 id="summary-teachers-title" class="summary-title">師資</h3>
                <dl class="teacher-list">
                  <template v-for="row in teacherRows" :key="row.label">
                    <dt>{{ row.label }}</dt>
                    <dd :class="{ 'is-empty': !row.name }">{{ row.name || '未指派' }}</dd>
                  </template>
                </dl>
              </section>

              <div class="leave-note" role="note">
                <el-icon class="leave-note-icon" :size="18" aria-hidden="true"><InfoFilled /></el-icon>
                <span>學生要離開本班：選取學生後，按學生資料右上的「⋯」→「編輯基本資料」改班級，或按「變更狀態」辦理退學、畢業。名冊上不提供刪除，所有離班都會留下異動紀錄。</span>
              </div>
            </div>
          </section>
        </div>
      </template>
    </div>

    <!-- 學生新增/編輯 dialog（用 StudentEditDialog 統一）-->
    <StudentEditDialog
      v-model:visible="editDialogVisible"
      :mode="editMode"
      :initial="editInitial"
      :default-classroom-id="classroom?.id"
      :lock-classroom="true"
      @saved="handleEditSaved"
    />
  </el-drawer>
</template>

<style scoped>
/* class 落在 teleport 出去的 .el-drawer 面板上，拿不到 scoped 的 data-v 屬性，
   所以 :deep() 寫法永遠不命中（EP 預設 20px body padding 一直在，標頭因此不滿版）；改用 :global。 */
:global(.classroom-student-drawer .el-drawer__body) {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.drawer-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ── 標頭（白底、下框線分隔）──────────────────────────────── */
.drawer-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-5) var(--space-6) var(--space-4);
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--color-neutral-200);
  flex-shrink: 0;
}
.header-main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.header-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  min-width: 0;
}
.header-title {
  margin: 0;
  min-width: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  line-height: 1.3;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.code-chip {
  flex-shrink: 0;
  padding: 1px var(--space-2);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.status-label {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 500;
  white-space: nowrap;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
}
/* 狀態同時有圓點與文字，不單靠顏色 */
.status-label--on { color: var(--color-success-darker); }
.status-label--on .status-dot { background: var(--color-success); }
.status-label--off { color: var(--el-text-color-secondary); }
.status-label--off .status-dot { background: var(--el-text-color-placeholder); }
.header-subtitle {
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}
.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  flex-shrink: 0;
}
/* el-button 相鄰預設 margin-left: 12px，間距統一由 gap 負責 */
.header-actions .banner-btn + .banner-btn { margin-left: 0; }
.header-close {
  flex-shrink: 0;
  color: var(--el-text-color-regular);
}

/* ── 統計 pill（兼作快速篩選）──────────────────────────────── */
.stat-pills-row {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6) var(--space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}
.stat-pill {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-neutral-200);
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.stat-pill:hover {
  background: var(--el-fill-color-light);
}
.stat-pill:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.stat-pill-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}
/* 數值 0 時整顆降為次要文字 */
.stat-pill.is-zero:not(.is-active),
.stat-pill.is-zero:not(.is-active) .stat-pill-value {
  color: var(--el-text-color-placeholder);
}
/* 只有 pressed 才上色；同時加粗＋內框，不單靠顏色表達選取 */
.stat-pill.is-active {
  border-color: currentColor;
  box-shadow: inset 0 0 0 1px currentColor;
}
.stat-pill.is-active .stat-pill-value {
  color: inherit;
}
.stat-pill--primary.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary-dark-2);
}
.stat-pill--info.is-active {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}
.stat-pill--danger.is-active {
  background: var(--color-danger-soft);
  color: var(--color-danger-darker);
}
.stat-pill--unknown.is-active {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.stat-pill--warning.is-active {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}
@media (prefers-reduced-motion: reduce) {
  .stat-pill {
    transition: none;
  }
}

.capacity-bar {
  padding: 0 var(--space-6) var(--space-3);
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.capacity-bar-text {
  display: flex;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.capacity-count {
  font-variant-numeric: tabular-nums;
}
.capacity-reserved {
  color: var(--el-color-warning);
}

.split-view {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  min-height: 0;
}

.roster-pane {
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--el-fill-color-blank);
}

.roster-filters {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.roster-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.roster-items {
  list-style: none;
  padding: 0;
  margin: 0;
}

.roster-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  cursor: pointer;
  transition: background 0.15s;
}
.roster-item:hover { background: var(--el-fill-color-light); }
.roster-item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.roster-item.selected {
  background: var(--el-color-primary-light-9);
  /* 選取態由彩色左條改為 inset 1px 全框（不佔版面、不需 padding 補償） */
  box-shadow: inset 0 0 0 1px var(--el-color-primary-light-5);
}
@media (prefers-reduced-motion: reduce) {
  .roster-item { transition: none; }
}
.roster-item.inactive .roster-name span:first-child {
  color: var(--el-text-color-disabled);
}

.roster-meta {
  flex: 1;
  min-width: 0;
}
.roster-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  font-size: 14px;
  margin-bottom: 2px;
}
.roster-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.alert-icon { color: var(--el-color-warning); }
.muted { color: var(--el-text-color-secondary); }

.roster-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.detail-pane {
  overflow-y: auto;
  padding: 16px 20px;
  min-height: 0;
  background: var(--el-bg-color);
}

.detail-summary {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 560px;
  padding: var(--space-2);
}
.summary-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--el-text-color-secondary);
}
.summary-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.teacher-list {
  margin: 0;
  display: grid;
  grid-template-columns: 96px 1fr;
  row-gap: var(--space-2);
  font-size: var(--text-base);
}
.teacher-list dt { color: var(--el-text-color-secondary); }
.teacher-list dd { margin: 0; color: var(--el-text-color-primary); }
.teacher-list dd.is-empty { color: var(--el-text-color-placeholder); }
.leave-note {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  background: var(--el-fill-color-light);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--el-text-color-regular);
}
.leave-note-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--el-color-primary);
}

/* 準新生姓名可點進招生入學訪視明細（2026-09-06）。用 button 保留鍵盤可及性，
   外觀維持文字連結。 */
.prospect-name--link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--brand-primary);
  cursor: pointer;
  text-align: left;
}
.prospect-name--link:hover,
.prospect-name--link:focus-visible {
  text-decoration: underline;
}

.mobile-back { display: none; margin-bottom: 8px; }

@media (--to-sm) {
  .classroom-student-drawer :deep(.el-drawer) {
    width: 100% !important;
  }
  .split-view {
    grid-template-columns: 1fr;
  }
  .roster-pane { display: flex; border-right: 0; }
  .detail-pane { display: none; }
  .split-view.mobile-show-detail .roster-pane { display: none; }
  .split-view.mobile-show-detail .detail-pane { display: block; }
  .split-view.mobile-show-detail .mobile-back { display: block; }

  /* 標頭：標題列（班名＋關閉鈕）一行，動作按鈕整列換到下一行 */
  .drawer-header {
    padding: var(--space-2) var(--space-2) var(--space-3) var(--space-4);
    gap: var(--space-2);
  }
  .header-close {
    order: 2;
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
  }
  .header-actions {
    order: 3;
    flex: 1 0 100%;
    padding-right: var(--space-2);
  }
  .header-actions .banner-btn {
    flex: 1 1 0;
    min-height: var(--touch-target-min);
  }

  .stat-pills-row { padding: var(--space-3) var(--space-4) var(--space-2); }
  .stat-pill { min-height: var(--touch-target-min); align-items: center; }
  .capacity-bar { padding: 0 var(--space-4) var(--space-3); }
  .roster-filters :deep(.el-input__wrapper) { min-height: var(--touch-target-min); }
  .roster-actions .el-button {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
  }
}
</style>
