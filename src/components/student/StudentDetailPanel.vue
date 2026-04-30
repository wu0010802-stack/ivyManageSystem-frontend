<script setup>
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
import GuardiansTab from './tabs/GuardiansTab.vue'
import AttendanceTab from './tabs/AttendanceTab.vue'
import RecordsTab from './tabs/RecordsTab.vue'
import FeesTab from './tabs/FeesTab.vue'
import ActivityTab from './tabs/ActivityTab.vue'
import HealthGrowthTab from './tabs/HealthGrowthTab.vue'
import CommunicationTab from './tabs/CommunicationTab.vue'

const props = defineProps({
  studentId: { type: Number, default: null },
  mode: { type: String, default: 'page' }, // 'page' | 'drawer'
  context: { type: String, default: 'students' }, // 'students' | 'classroom'
  defaultTab: { type: String, default: null },
  classroomId: { type: Number, default: null },
  // 同步 URL（page mode）
  syncUrl: { type: Boolean, default: true },
  // page mode 的 query 來源（從 from=classroom 帶過來）
  fromContext: { type: String, default: '' },
  fromClassroomId: { type: Number, default: null },
  initialTab: { type: String, default: '' }, // 從 ?tab= 帶入
})
const emit = defineEmits([
  'lifecycle-changed',
  'student-updated',
  'profile-loaded',
])

const router = useRouter()

const profile = ref(null)
const loading = ref(false)

const canPortfolioRead = computed(() => hasPermission('PORTFOLIO_READ'))
const canHealthRead = computed(() => hasPermission('STUDENTS_HEALTH_READ'))
const canGuardiansRead = computed(() => hasPermission('GUARDIANS_READ'))
const canActivityRead = computed(() => hasPermission('ACTIVITY_READ'))
const canFeesRead = computed(() => hasPermission('FEES_READ'))

const defaultTabFor = (ctx) => (ctx === 'classroom' ? 'overview' : 'basic')
const initialActive = props.initialTab || props.defaultTab || defaultTabFor(props.context)
const activeTab = ref(initialActive)

const editDialogVisible = ref(false)
const editInitial = ref(null)
const editLoading = ref(false)
const lifecycleDialogVisible = ref(false)

const showOpenFullPage = computed(() => props.mode === 'drawer' && props.context === 'classroom')

const TAB_DEFS = computed(() => [
  { name: 'overview', label: '總覽', show: true },
  { name: 'basic', label: '基本資料', show: true },
  { name: 'guardians', label: '監護人', show: canGuardiansRead.value },
  { name: 'attendance', label: '出席紀錄', show: true },
  { name: 'records', label: '綜合紀錄', show: true },
  { name: 'fees', label: '學費', show: canFeesRead.value },
  { name: 'activity', label: '才藝報名', show: canActivityRead.value },
  { name: 'health_growth', label: '健康／成長', show: canPortfolioRead.value || canHealthRead.value },
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
    ElMessage.error(e.displayMessage || apiError(e, '讀取學生檔案失敗'))
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

const handleGotoLink = (cmd) => {
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
  if (props.fromContext === 'classroom') {
    return [
      { label: '班級學生管理', path: '/classrooms' },
      { label: profile.value?.basic?.name || '學生檔案' },
    ]
  }
  return [
    { label: '學生管理', path: '/students' },
    { label: profile.value?.basic?.name || '學生檔案' },
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
            :to="c.path ? { path: c.path } : null"
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
          @goto-tab="(t) => (activeTab = t)"
        />
        <BasicInfoTab v-else-if="tab.name === 'basic'" :profile="profile" />
        <GuardiansTab
          v-else-if="tab.name === 'guardians'"
          :student-id="studentId"
          @changed="handleGuardiansChanged"
        />
        <AttendanceTab
          v-else-if="tab.name === 'attendance'"
          :student-id="studentId"
          :active="activeTab === 'attendance'"
        />
        <RecordsTab
          v-else-if="tab.name === 'records'"
          :student-id="studentId"
          :classroom-id="profile.basic?.classroom_id"
          :active="activeTab === 'records'"
        />
        <FeesTab
          v-else-if="tab.name === 'fees'"
          :student-id="studentId"
          :active="activeTab === 'fees'"
        />
        <ActivityTab
          v-else-if="tab.name === 'activity'"
          :student-id="studentId"
          :active="activeTab === 'activity'"
        />
        <HealthGrowthTab
          v-else-if="tab.name === 'health_growth'"
          :student-id="studentId"
        />
        <CommunicationTab
          v-else-if="tab.name === 'communication'"
          :student-id="studentId"
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
      :current-status="profile.lifecycle?.status"
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
