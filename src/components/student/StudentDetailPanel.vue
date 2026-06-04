<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { getStudent, getStudentProfile } from '@/api/students'
import { hasPermission } from '@/utils/auth'
import { domainBus, STUDENT_EVENTS, RECORD_EVENTS } from '@/utils/domainBus'
import { apiError } from '@/utils/error'

import StudentSummaryHeader from './StudentSummaryHeader.vue'
import StudentEditDialog from './StudentEditDialog.vue'
import LifecycleTransitionDialog from './LifecycleTransitionDialog.vue'

import OverviewTab from './tabs/OverviewTab.vue'
import BasicInfoTab from './tabs/BasicInfoTab.vue'
import AttendanceTab from './tabs/AttendanceTab.vue'
import RecordsTab from './tabs/RecordsTab.vue'
import FeesTab from './tabs/FeesTab.vue'
import ActivityTab from './tabs/ActivityTab.vue'
import HealthGrowthTab from './tabs/HealthGrowthTab.vue'
import GrowthProfileTab from './tabs/GrowthProfileTab.vue'
import CommunicationTab from './tabs/CommunicationTab.vue'
import LifecycleTab from './tabs/LifecycleTab.vue'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'
import StudentDisabilityDocsPanel from './StudentDisabilityDocsPanel.vue'
import StudentEnrollmentCertButton from './StudentEnrollmentCertButton.vue'

const props = withDefaults(defineProps<{
  studentId?: number | null
  mode?: string
  context?: string
  defaultTab?: string | null
  classroomId?: number | null
  syncUrl?: boolean
  fromContext?: string
  fromClassroomId?: number | null
  initialTab?: string
}>(), {
  studentId: null,
  mode: 'page',
  context: 'students',
  defaultTab: null,
  classroomId: null,
  syncUrl: true,
  fromContext: '',
  fromClassroomId: null,
  initialTab: '',
})
const emit = defineEmits<{
  'lifecycle-changed': []
  'student-updated': []
  'profile-loaded': [data: unknown]
}>()

const router = useRouter()

const profile = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const safeStudentId = computed(() => props.studentId as number)
// 入學前歷程入口：profile.lifecycle.recruitment_visit_id（profile 端點已曝露此欄）
const recruitmentVisitId = computed<number | null>(
  () => ((profile.value?.lifecycle as Record<string, unknown> | undefined)?.recruitment_visit_id as number | null) ?? null,
)

const canPortfolioRead = computed(() => hasPermission('PORTFOLIO_READ'))
const canHealthRead = computed(() => hasPermission('STUDENTS_HEALTH_READ'))
const canActivityRead = computed(() => hasPermission('ACTIVITY_READ'))
const canFeesRead = computed(() => hasPermission('FEES_READ'))
const canSpecialNeedsRead = computed(() => hasPermission('STUDENTS_SPECIAL_NEEDS_READ'))

const defaultTabFor = (ctx: string) => (ctx === 'classroom' ? 'overview' : 'basic')
const LEGACY_TAB_MAP = {
  guardians: 'basic',
  milestones: 'growth_profile',
  timeline: 'growth_profile',
  photo_gallery: 'growth_profile',
  growth_report: 'growth_profile',
}
const mapLegacyTab = (name: string) => (LEGACY_TAB_MAP as Record<string, string>)[name] || name
// 4 個原獨立 tab 整併成 growth_profile 的 sub-tab，書籤連結 ?tab=<舊名>
// 需要同時帶 ?sub=<舊名> 進 GrowthProfileTab（讀 route.query.sub）；否則
// 舊書籤 ?tab=timeline / photo_gallery / growth_report 全部落到預設的
// milestones sub-tab。bug sweep round 4 (2026-05-14) F-FE-1。
const GROWTH_SUB_FROM_LEGACY = new Set([
  'milestones',
  'timeline',
  'photo_gallery',
  'growth_report',
])
const initialActive = mapLegacyTab(
  props.initialTab || props.defaultTab || defaultTabFor(props.context),
)
const initialGrowthSub = GROWTH_SUB_FROM_LEGACY.has(props.initialTab)
  ? props.initialTab
  : null
const activeTab = ref(initialActive)

const editDialogVisible = ref(false)
const editInitial = ref<Record<string, unknown> | null>(null)
const editLoading = ref(false)
const lifecycleDialogVisible = ref(false)

const showOpenFullPage = computed(() => props.mode === 'drawer' && props.context === 'classroom')

const TAB_DEFS = computed(() => [
  { name: 'overview', label: '總覽', show: true },
  { name: 'basic', label: '基本資料', show: true },
  { name: 'attendance', label: '出席紀錄', show: true },
  { name: 'records', label: '教務紀錄', show: true },
  { name: 'fees', label: '學費', show: canFeesRead.value },
  { name: 'activity', label: '才藝報名', show: canActivityRead.value },
  { name: 'health_growth', label: '健康／成長', show: canPortfolioRead.value || canHealthRead.value },
  { name: 'growth_profile', label: '成長檔案', show: canPortfolioRead.value },
  { name: 'disability_docs', label: '鑑定文件', show: canSpecialNeedsRead.value },
  { name: 'lifecycle', label: '在校歷程', show: true },
  { name: 'communication', label: '家長溝通', show: true },
])

const visibleTabs = computed(() => TAB_DEFS.value.filter((t) => t.show))

async function fetchProfile() {
  if (!props.studentId) {
    profile.value = null
    return
  }
  loading.value = true
  try {
    const { data } = await getStudentProfile(props.studentId)
    profile.value = data
    emit('profile-loaded', data)
  } catch (e) {
    profile.value = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ElMessage.error((e as any).displayMessage || apiError(e, '讀取學生檔案失敗'))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.studentId,
  (id) => { if (id) fetchProfile() },
  { immediate: true },
)

// 同步 URL（page mode）
watch(activeTab, (val) => {
  if (props.mode !== 'page' || !props.syncUrl) return
  const currentQuery = router.currentRoute.value.query
  if (currentQuery.tab === val) return
  router.replace({ query: { ...currentQuery, tab: val } })
})

// 舊書籤 ?tab=<growth_profile sub 名> → 進來時補 ?sub= 讓 GrowthProfileTab 跳對
// 預期 sub，並同步 ?tab=growth_profile 讓 URL 與顯示一致（否則 activeTab
// 是 growth_profile 但 URL 仍掛舊名）。只在 page mode + syncUrl 時推 URL；
// drawer/embedded mode 由父層控制 router。bug sweep round 4 (2026-05-14) F-FE-1。
if (props.mode === 'page' && props.syncUrl && initialGrowthSub) {
  const q = router.currentRoute.value.query
  const needsTab = q.tab !== initialActive
  const needsSub = q.sub !== initialGrowthSub
  if (needsTab || needsSub) {
    router.replace({
      query: { ...q, tab: initialActive, sub: initialGrowthSub },
    })
  }
}

// URL 帶舊 tab 名稱時即時轉換（書籤相容）
watch(() => props.initialTab, (val) => {
  if (!val) return
  const mapped = mapLegacyTab(val)
  if (mapped !== activeTab.value) activeTab.value = mapped
  // 後續切換時若帶舊名，同樣補 ?sub=
  if (
    props.mode === 'page' &&
    props.syncUrl &&
    GROWTH_SUB_FROM_LEGACY.has(val) &&
    router.currentRoute.value.query.sub !== val
  ) {
    router.replace({
      query: { ...router.currentRoute.value.query, sub: val },
    })
  }
})

// 監聽 bus 重新載 profile（編輯後同步摘要）
const onProfileMutate = () => { if (props.studentId) fetchProfile() }
const busEvents = [
  STUDENT_EVENTS.UPDATED,
  STUDENT_EVENTS.LIFECYCLE_CHANGED,
  RECORD_EVENTS.CREATED,
  RECORD_EVENTS.UPDATED,
  RECORD_EVENTS.DELETED,
]
busEvents.forEach((e) => domainBus.on(e, onProfileMutate))
onUnmounted(() => busEvents.forEach((e) => domainBus.off(e, onProfileMutate)))

// 教務紀錄 → 出席跳轉：攜帶日期區間給 AttendanceTab 預填篩選
const attendanceDateRange = ref<[string, string] | null>(null)
function handleRecordsJumpTab(payload: string | { tab?: string; query?: { from?: string; to?: string } }) {
  const target = typeof payload === 'string' ? payload : payload?.tab
  if (!target) return
  if (target === 'attendance' && typeof payload !== 'string' && payload?.query) {
    attendanceDateRange.value = [payload.query.from || '', payload.query.to || '']
  }
  activeTab.value = mapLegacyTab(target)
}

// 摺要列：操作
const handleLifecycleClick = () => { lifecycleDialogVisible.value = true }

const openEditDialog = async () => {
  if (!props.studentId) return
  editLoading.value = true
  try {
    const { data } = await getStudent(props.studentId)
    editInitial.value = data
    editDialogVisible.value = true
  } catch (e) {
    ElMessage.error(apiError(e, '讀取學生資料失敗'))
  } finally {
    editLoading.value = false
  }
}

const handleEditClick = () => openEditDialog()

const handleGotoLink = (cmd: string) => {
  if (cmd === 'edit') {
    openEditDialog()
  } else if (cmd === 'attendance') {
    router.push('/student-attendance')
  } else if (cmd === 'fees') {
    router.push('/fees')
  } else if (cmd === 'classrooms') {
    router.push('/classrooms')
  } else if (cmd === 'students') {
    router.push('/students')
  }
}

const handleOpenFullPage = () => {
  if (!props.studentId) return
  router.push({
    name: 'student-profile',
    params: { id: props.studentId },
    query: {
      from: 'classroom',
      classroom_id: props.classroomId || undefined,
      tab: activeTab.value,
    },
  })
}

const handleEditSaved = () => {
  fetchProfile()
  emit('student-updated')
}

const handleLifecycleTransitioned = () => {
  fetchProfile()
  emit('lifecycle-changed')
}

const handleGuardiansChanged = () => fetchProfile()

// 返回（page mode）
const handleBack = () => {
  if (props.fromContext === 'classroom' && props.fromClassroomId) {
    router.replace({ path: '/classrooms', query: { selected: props.fromClassroomId } })
  } else {
    router.back()
  }
}

const breadcrumbItems = computed(() => {
  if (props.mode !== 'page') return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = (profile.value?.basic as any)?.name
  if (props.fromContext === 'classroom') {
    return [
      { label: '班級學生管理', path: '/classrooms' },
      { label: name || '學生檔案' },
    ]
  }
  return [
    { label: '學生管理', path: '/students' },
    { label: name || '學生檔案' },
  ]
})
</script>

<template>
  <div class="student-detail-panel" :class="`mode-${mode}`" v-loading="loading && !profile">
    <!-- Page mode：頁首 breadcrumb -->
    <div v-if="mode === 'page'" class="page-header">
      <div class="breadcrumb">
        <el-button text :icon="ArrowLeft" @click="handleBack" class="back-btn">返回</el-button>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item
            v-for="(c, idx) in breadcrumbItems"
            :key="idx"
            :to="c.path ? { path: c.path } : undefined"
          >{{ c.label }}</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </div>

    <!-- 摘要列：固定頂部 -->
    <StudentSummaryHeader
      v-if="profile"
      :profile="profile"
      :context="context"
      :show-open-full-page="showOpenFullPage"
      @lifecycle-click="handleLifecycleClick"
      @edit-click="handleEditClick"
      @open-full-page="handleOpenFullPage"
      @goto-link="handleGotoLink"
    />
    <StudentEnrollmentCertButton v-if="studentId" :student-id="studentId" />

    <el-empty v-if="!loading && !profile" description="找不到學生資料" />

    <!-- Tabs -->
    <el-tabs v-if="profile" v-model="activeTab" class="detail-tabs">
      <el-tab-pane
        v-for="tab in visibleTabs"
        :key="tab.name"
        :label="tab.label"
        :name="tab.name"
        lazy
      >
        <OverviewTab
          v-if="tab.name === 'overview'"
          :profile="profile"
          @goto-tab="(t) => (activeTab = mapLegacyTab(t))"
        />
        <BasicInfoTab
          v-else-if="tab.name === 'basic'"
          :profile="profile"
          @guardians-changed="handleGuardiansChanged"
        />
        <AttendanceTab
          v-else-if="tab.name === 'attendance'"
          :student-id="safeStudentId"
          :active="activeTab === 'attendance'"
          :external-date-range="attendanceDateRange"
        />
        <RecordsTab
          v-else-if="tab.name === 'records'"
          :student-id="safeStudentId"
          :classroom-id="(profile.basic as Record<string, unknown>)?.classroom_id as number | undefined"
          :active="activeTab === 'records'"
          @jump-tab="handleRecordsJumpTab"
        />
        <FeesTab
          v-else-if="tab.name === 'fees'"
          :student-id="safeStudentId"
          :student-name="((profile.basic as Record<string, unknown>)?.name as string) || ''"
          :active="activeTab === 'fees'"
        />
        <ActivityTab
          v-else-if="tab.name === 'activity'"
          :student-id="safeStudentId"
          :active="activeTab === 'activity'"
        />
        <HealthGrowthTab
          v-else-if="tab.name === 'health_growth'"
          :student-id="safeStudentId"
        />
        <GrowthProfileTab
          v-else-if="tab.name === 'growth_profile'"
          :student-id="safeStudentId"
          :sync-url="syncUrl"
        />
        <StudentDisabilityDocsPanel
          v-else-if="tab.name === 'disability_docs'"
          :student-id="safeStudentId"
        />
        <template v-else-if="tab.name === 'lifecycle'">
          <LifecycleTab :student-id="safeStudentId" :active="activeTab === 'lifecycle'" />
          <el-collapse class="journey-section" style="margin-top: 16px">
            <el-collapse-item title="入學前歷程（招生來源）">
              <JourneyTimeline :visit-id="recruitmentVisitId" />
            </el-collapse-item>
          </el-collapse>
        </template>
        <CommunicationTab
          v-else-if="tab.name === 'communication'"
          :student-id="safeStudentId"
          :active="activeTab === 'communication'"
        />
      </el-tab-pane>
    </el-tabs>

    <!-- 編輯 dialog（從摘要列右上開啟，編輯時 fetch 完整單筆資料避免欄位被覆蓋）-->
    <StudentEditDialog
      v-if="editInitial"
      v-model:visible="editDialogVisible"
      mode="edit"
      :initial="editInitial"
      @saved="handleEditSaved"
    />

    <!-- 生命週期 dialog -->
    <LifecycleTransitionDialog
      v-if="profile && studentId"
      v-model="lifecycleDialogVisible"
      :student-id="studentId"
      :current-status="(profile.lifecycle as Record<string, unknown>)?.status as string | undefined"
      @transitioned="handleLifecycleTransitioned"
    />
  </div>
</template>

<style scoped>
.student-detail-panel {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.mode-page {
  padding: 16px;
}
.mode-drawer {
  padding: 4px 0 0;
}

.page-header {
  margin-bottom: 12px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
}
.back-btn {
  margin-right: 4px;
}

.detail-tabs {
  margin-top: 4px;
}
.detail-tabs :deep(.el-tabs__header) {
  margin-bottom: 14px;
}
.detail-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0 4px;
}
</style>
