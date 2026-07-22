<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Delete,
  Edit,
  Plus,
  Search,
  Warning,
  ArrowLeft,
  Switch as SwitchIcon,
} from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import { capacityPercent, capacityStatus } from '@/utils/classroomCapacity'
import { useConfirmDelete } from '@/composables'
import { useIsMobile } from '@/composables/useIsMobile'
import { useClassroomProspects } from '@/composables/useClassroomProspects'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'
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
  grade_name?: string
  grade_id?: number
  school_year?: number
  semester?: number
  semester_label?: string
  is_active?: boolean
  capacity?: number
  students?: StudentRecord[]
}

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
const studentGenderFilter = ref('')
const showHealthOnly = ref(false)
const showInactive = ref(false)

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
    const matchGender = !studentGenderFilter.value || s.gender === studentGenderFilter.value
    const matchHealth = !showHealthOnly.value || !!hasHealthAlert(s)
    return matchSearch && matchGender && matchHealth
  })
})

// 統計 pill 兼作快速篩選：再點一次同條件即取消
const toggleGenderFilter = (gender: string) => {
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
const capacityProgressStatus = computed<'' | 'success' | 'warning' | 'exception'>(() => {
  const s = capacityStatus(activeStudents.value.length, props.classroom?.capacity)
  return s === 'full' ? 'exception' : s === 'warning' ? 'warning' : 'success'
})

const studentStats = computed(() => {
  const students = activeStudents.value
  return students.reduce(
    (acc, s) => {
      if (s.gender === '男') acc.maleCount++
      else if (s.gender === '女') acc.femaleCount++
      if (s.allergy || s.medication || s.special_needs) acc.healthAlertCount++
      return acc
    },
    { maleCount: 0, femaleCount: 0, healthAlertCount: 0 },
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

// ── 刪除學生 ────────────────────────────────────────
const { confirmDelete: handleStudentDelete } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: (row) => {
    const rowId = (row as { id?: number })?.id
    domainBus.emit(STUDENT_EVENTS.DELETED, { id: rowId })
    if (selectedStudentId.value === rowId) selectedStudentId.value = null
    emit('student-updated')
  },
  successMsg: '刪除成功',
})

// ── 開完整檔案 ──────────────────────────────────────
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
        <!-- 頂部 banner -->
        <div class="drawer-banner">
          <div class="banner-left">
            <div class="banner-title">{{ classroom.name }}</div>
            <div class="banner-subtitle">
              {{ classroom.semester_label }} · {{ classroom.grade_name || '未設定年級' }}
            </div>
          </div>
          <div class="banner-right">
            <el-tag :type="classroom.is_active ? 'success' : 'info'" effect="dark">
              {{ classroom.is_active ? '啟用中' : '已停用' }}
            </el-tag>
            <el-button
              v-if="canWriteStudents"
              type="primary"
              size="small"
              :icon="Plus"
              @click="handleStudentAdd"
              class="banner-btn"
            >新增學生</el-button>
            <el-button
              v-if="selectedStudentId"
              size="small"
              class="banner-btn"
              @click="handleOpenFullPage"
            >開完整檔案</el-button>
            <el-button size="small" class="banner-btn" @click="close">關閉</el-button>
          </div>
        </div>

        <!-- 統計 pill row（兼作快速篩選；再點一次取消）-->
        <div class="stat-pills-row" role="group" aria-label="學生統計與篩選">
          <button
            type="button"
            class="stat-pill stat-pill--primary"
            :class="{ 'is-active': !studentGenderFilter && !showHealthOnly }"
            :aria-pressed="!studentGenderFilter && !showHealthOnly"
            @click="clearFilters"
          >
            <div class="stat-pill-value">在學 {{ activeStudents.length }}</div>
            <div class="stat-pill-label">全部在讀</div>
          </button>
          <button
            type="button"
            class="stat-pill stat-pill--info"
            :class="{ 'is-active': studentGenderFilter === '男' }"
            :aria-pressed="studentGenderFilter === '男'"
            @click="toggleGenderFilter('男')"
          >
            <div class="stat-pill-value">{{ studentStats.maleCount }}</div>
            <div class="stat-pill-label">男生</div>
          </button>
          <button
            type="button"
            class="stat-pill stat-pill--danger"
            :class="{ 'is-active': studentGenderFilter === '女' }"
            :aria-pressed="studentGenderFilter === '女'"
            @click="toggleGenderFilter('女')"
          >
            <div class="stat-pill-value">{{ studentStats.femaleCount }}</div>
            <div class="stat-pill-label">女生</div>
          </button>
          <button
            type="button"
            class="stat-pill stat-pill--warning"
            :class="{ 'is-active': showHealthOnly }"
            :aria-pressed="showHealthOnly"
            @click="toggleHealthFilter"
          >
            <div class="stat-pill-value">{{ studentStats.healthAlertCount }}</div>
            <div class="stat-pill-label">需注意</div>
          </button>
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
              <el-radio-group v-model="studentGenderFilter" size="small">
                <el-radio-button value="">全部</el-radio-button>
                <el-radio-button value="男">男</el-radio-button>
                <el-radio-button value="女">女</el-radio-button>
              </el-radio-group>
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
                    <el-tooltip content="刪除" placement="top">
                      <el-button
                        :aria-label="`刪除 ${s.name} 的資料`"
                        size="small"
                        :icon="Delete"
                        type="danger"
                        plain
                        circle
                        @click="handleStudentDelete(s)"
                      />
                    </el-tooltip>
                  </div>
                </li>
              </ul>
            </div>

            <!-- 準新生／保留座位（尚未報到、不計入在學人數）-->
            <div v-if="prospects.length" class="prospect-section">
              <el-collapse>
                <el-collapse-item
                  :title="`準新生／保留座位（${prospects.length}）— 尚未報到、不計入在學人數`"
                >
                  <ul class="prospect-items">
                    <li v-for="p in prospects" :key="p.id" class="prospect-item">
                      <span class="prospect-name">{{ p.child_name }}</span>
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
            <div v-else class="detail-empty">
              <el-empty description="從左側選擇學生以查看詳情">
                <template #image>
                  <el-icon :size="64" color="#c0c4cc"><SwitchIcon /></el-icon>
                </template>
              </el-empty>
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
.classroom-student-drawer :deep(.el-drawer__body) {
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

.drawer-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  background: var(--el-color-primary);
  color: #fff;
  gap: 12px;
  flex-shrink: 0;
}
.banner-left { min-width: 0; }
.banner-title { font-size: 1.3rem; font-weight: 700; line-height: 1.3; }
.banner-subtitle { font-size: 0.85rem; opacity: 0.85; }
.banner-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.banner-btn {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.5);
  color: #fff;
}
.banner-btn:hover {
  background: rgba(255, 255, 255, 0.28);
  border-color: rgba(255, 255, 255, 0.7);
  color: #fff;
}

.stat-pills-row {
  display: flex;
  gap: 10px;
  padding: 10px 22px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}
.stat-pill {
  flex: 1;
  min-width: 70px;
  padding: 6px 12px;
  border-radius: 6px;
  text-align: center;
  border: 1px solid transparent;
  font-family: inherit;
  cursor: pointer;
  transition: filter 0.15s, box-shadow 0.15s;
}
.stat-pill:hover {
  filter: brightness(0.97);
}
.stat-pill:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.stat-pill.is-active {
  box-shadow: inset 0 0 0 2px currentColor;
}
@media (prefers-reduced-motion: reduce) {
  .stat-pill {
    transition: none;
  }
}
.stat-pill--primary {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}
.stat-pill--info {
  background: var(--el-color-info-light-9);
  border-color: var(--el-color-info-light-5);
  color: var(--el-color-info);
}
.stat-pill--danger {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-5);
  color: var(--el-color-danger);
}
.stat-pill--warning {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
  color: var(--el-color-warning);
}
.stat-pill-value {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
}
.stat-pill-label {
  font-size: 0.72rem;
  opacity: 0.8;
}

.capacity-bar {
  padding: 0 22px 10px;
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

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}

.mobile-back { display: none; margin-bottom: 8px; }

@media (--to-sm) {
  .classroom-student-drawer :deep(.el-drawer) {
    width: 100% !important;
  }
  .split-view {
    grid-template-columns: 1fr;
  }
  .roster-pane { display: flex; }
  .detail-pane { display: none; }
  .split-view.mobile-show-detail .roster-pane { display: none; }
  .split-view.mobile-show-detail .detail-pane { display: block; }
  .split-view.mobile-show-detail .mobile-back { display: block; }
  .drawer-banner { padding: 14px 16px; }
}
</style>
