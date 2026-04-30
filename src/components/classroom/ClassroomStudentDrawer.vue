<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
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
import { useConfirmDelete } from '@/composables'
import { domainBus, STUDENT_EVENTS } from '@/utils/domainBus'
import StudentEditDialog from '@/components/student/StudentEditDialog.vue'
import StudentDetailPanel from '@/components/student/StudentDetailPanel.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  classroom: { type: Object, default: null },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'student-updated'])

const router = useRouter()

const canWriteStudents = hasPermission('STUDENTS_WRITE')

// ── 名冊篩選 ────────────────────────────────────────
const studentSearch = ref('')
const studentGenderFilter = ref('')
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
      || s.name.includes(studentSearch.value)
      || s.student_id?.includes(studentSearch.value)
    const matchGender = !studentGenderFilter.value || s.gender === studentGenderFilter.value
    return matchSearch && matchGender
  })
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

const avatarBgColor = (gender) => {
  if (gender === '男') return 'var(--el-color-primary)'
  if (gender === '女') return '#e91e8c'
  return '#909399'
}

const hasHealthAlert = (s) => s.allergy || s.medication || s.special_needs

const healthAlertText = (s) =>
  [
    s.allergy && `過敏：${s.allergy}`,
    s.medication && `用藥：${s.medication}`,
    s.special_needs && `特殊需求：${s.special_needs}`,
  ]
    .filter(Boolean)
    .join('／')

// ── 詳情選擇 ────────────────────────────────────────
const selectedStudentId = ref(null)
const selectedStudent = computed(() =>
  visibleStudents.value.find((s) => s.id === selectedStudentId.value)
    || (props.classroom?.students || []).find((s) => s.id === selectedStudentId.value)
    || null,
)
const handleSelectStudent = (student) => {
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
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768)
const handleResize = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize)
})
const mobileShowDetail = computed(() => isMobile.value && selectedStudentId.value)

// ── 學生新增/編輯 dialog ────────────────────────────
const editDialogVisible = ref(false)
const editMode = ref('create') // 'create' | 'edit'
const editInitial = ref(null)

const handleStudentAdd = () => {
  editInitial.value = null
  editMode.value = 'create'
  editDialogVisible.value = true
}

const handleStudentEdit = (student) => {
  editInitial.value = { ...student }
  editMode.value = 'edit'
  editDialogVisible.value = true
}

const handleEditSaved = () => emit('student-updated')

// ── 刪除學生 ────────────────────────────────────────
const { confirmDelete: handleStudentDelete } = useConfirmDelete({
  endpoint: '/students',
  onSuccess: (row) => {
    domainBus.emit(STUDENT_EVENTS.DELETED, { id: row?.id })
    if (selectedStudentId.value === row?.id) selectedStudentId.value = null
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

        <!-- 統計 pill row -->
        <div class="stat-pills-row">
          <div class="stat-pill stat-pill--primary">
            <div class="stat-pill-value">{{ activeStudents.length }} / {{ classroom.capacity }}</div>
            <div class="stat-pill-label">在讀</div>
          </div>
          <div class="stat-pill stat-pill--info">
            <div class="stat-pill-value">{{ studentStats.maleCount }}</div>
            <div class="stat-pill-label">男生</div>
          </div>
          <div class="stat-pill stat-pill--danger">
            <div class="stat-pill-value">{{ studentStats.femaleCount }}</div>
            <div class="stat-pill-label">女生</div>
          </div>
          <div class="stat-pill stat-pill--warning">
            <div class="stat-pill-value">{{ studentStats.healthAlertCount }}</div>
            <div class="stat-pill-label">需注意</div>
          </div>
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
              <ul v-else class="roster-items">
                <li
                  v-for="s in visibleStudents"
                  :key="s.id"
                  class="roster-item"
                  :class="{
                    selected: s.id === selectedStudentId,
                    inactive: s.is_active === false,
                  }"
                  @click="handleSelectStudent(s)"
                >
                  <el-avatar
                    :size="36"
                    :style="{
                      backgroundColor: s.is_active === false ? '#c0c4cc' : avatarBgColor(s.gender),
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
                      <el-button size="small" :icon="Edit" plain circle @click="handleStudentEdit(s)" />
                    </el-tooltip>
                    <el-tooltip content="刪除" placement="top">
                      <el-button size="small" :icon="Delete" type="danger" plain circle @click="handleStudentDelete(s)" />
                    </el-tooltip>
                  </div>
                </li>
              </ul>
            </div>
          </aside>

          <!-- 右欄：學生詳情 -->
          <section class="detail-pane">
            <div v-if="isMobile && selectedStudent" class="mobile-back">
              <el-button text :icon="ArrowLeft" @click="selectedStudentId = null">回名冊</el-button>
            </div>
            <StudentDetailPanel
              v-if="selectedStudent"
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
  background: linear-gradient(135deg, var(--el-color-primary) 0%, var(--el-color-primary-light-3) 100%);
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
.roster-item.selected {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
  padding-left: 9px;
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

@media (max-width: 768px) {
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
