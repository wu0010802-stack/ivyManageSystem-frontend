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
import RecordsTab from './tabs/RecordsTab.vue'
import FeesTab from './tabs/FeesTab.vue'
import ActivityTab from './tabs/ActivityTab.vue'
import GrowthTab from './tabs/GrowthTab.vue'
import HealthTab from '@/components/portfolio/HealthTab.vue'
import CommunicationTab from './tabs/CommunicationTab.vue'
import LifecycleTab from './tabs/LifecycleTab.vue'
import JourneyTimeline from '@/components/recruitment/JourneyTimeline.vue'
import StudentDisabilityDocsPanel from './StudentDisabilityDocsPanel.vue'
import StudentEnrollmentCertButton from './StudentEnrollmentCertButton.vue'
import { resolveStudentTab, sectionBelongsTo, type SectionRequest } from './studentProfileTabs'

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

// 一級頁籤的舊 key 對照集中在 studentProfileTabs.ts（2026-10-29 S6 整併：出席併入教務紀錄、
// 健康／成長攤平成兩個一級頁籤、頁籤內不再巢狀）。這裡只負責「依權限挑第一個看得到的候選」。
// ⚠ 只有 page＋syncUrl 才讀網址（router.currentRoute）：抽屜與內嵌情境由父層控制 router，
//   且不少測試的 router mock 沒有 currentRoute。
const first = (v: unknown): string => (Array.isArray(v) ? first(v[0]) : v == null ? '' : String(v))
const urlQuery = () => (props.mode === 'page' && props.syncUrl ? router.currentRoute.value.query : {})
const resolveRequested = (raw: string) => {
  const q = urlQuery()
  return resolveStudentTab(raw, { sub: first(q.sub), group: first(q.group) })
}

// 頁籤內區塊請求（教務紀錄的出席／請假…、成長的七個區塊）：nonce 讓同一請求可重複觸發
let sectionNonce = 0
const recordsSection = ref<SectionRequest | null>(null)
const growthSection = ref<SectionRequest | null>(null)
function requestSection(tab: string, sub: string) {
  if (!sectionBelongsTo(tab, sub)) return
  const req: SectionRequest = { section: sub, nonce: ++sectionNonce }
  if (tab === 'records') recordsSection.value = req
  else if (tab === 'growth') growthSection.value = req
}

const requestedTab = props.initialTab || props.defaultTab || defaultTabFor(props.context)
const initialResolved = resolveRequested(requestedTab)
const activeTab = ref(initialResolved.candidates[0])

const editDialogVisible = ref(false)
const editInitial = ref<Record<string, unknown> | null>(null)
const editLoading = ref(false)
const lifecycleDialogVisible = ref(false)

const showOpenFullPage = computed(() => props.mode === 'drawer' && props.context === 'classroom')

const TAB_DEFS = computed(() => [
  { name: 'overview', label: '總覽', show: true },
  { name: 'basic', label: '基本資料', show: true },
  { name: 'records', label: '教務紀錄', show: true },
  { name: 'fees', label: '學費', show: canFeesRead.value },
  { name: 'activity', label: '才藝報名', show: canActivityRead.value },
  { name: 'health', label: '健康', show: canHealthRead.value },
  { name: 'growth', label: '成長', show: canPortfolioRead.value },
  { name: 'disability_docs', label: '鑑定文件', show: canSpecialNeedsRead.value },
  { name: 'lifecycle', label: '在校歷程', show: true },
  { name: 'communication', label: '家長溝通', show: true },
])

const visibleTabs = computed(() => TAB_DEFS.value.filter((t) => t.show))

// 依權限挑第一個看得到的候選頁籤；全都看不到（如無 FEES_READ 連到 fees）時
// activeTab 會指向不存在的 pane 而整個內容區空白——退回總覽
const pickVisibleTab = (candidates: string[]): string =>
  candidates.find((name) => visibleTabs.value.some((t) => t.name === name)) ?? 'overview'
activeTab.value = pickVisibleTab(initialResolved.candidates)
if (initialResolved.sub && activeTab.value === initialResolved.candidates[0]) {
  requestSection(activeTab.value, initialResolved.sub)
}

// 快速切換學生時，較舊學生的慢回應不得覆寫新學生的 profile（標頭/PII 競態）。
let profileSeq = 0
// 編輯資料是另一條獨立請求；同樣要在切換學生時失效，避免在 B 畫面開啟 A 的表單。
let editSeq = 0
async function fetchProfile() {
  if (!props.studentId) {
    profileSeq += 1
    profile.value = null
    return
  }
  const seq = ++profileSeq
  const sid = props.studentId
  loading.value = true
  try {
    const { data } = await getStudentProfile(sid)
    if (seq !== profileSeq || props.studentId !== sid) return
    profile.value = data as unknown as Record<string, unknown>
    emit('profile-loaded', data)
  } catch (e) {
    if (seq !== profileSeq || props.studentId !== sid) return
    profile.value = null
    ElMessage.error(apiError(e, '讀取學生檔案失敗'))
  } finally {
    if (seq === profileSeq) loading.value = false
  }
}

watch(
  () => props.studentId,
  (id, previousId) => {
    if (id !== previousId) {
      editSeq += 1
      editDialogVisible.value = false
      editInitial.value = null
      editLoading.value = false
      lifecycleDialogVisible.value = false
    }
    if (id) fetchProfile()
  },
  { immediate: true },
)

// 舊書籤（?tab=attendance／health_growth_profile&group=growth&sub=…／timeline…）進來時，
// 把網址改寫成現行 key（tab＋sub），免得網址與畫面不一致、之後換頁籤又殘留舊 group。
// 只在 page mode + syncUrl 時推 URL；drawer／embedded mode 由父層控制 router。
function canonicalizeUrl(resolved: ReturnType<typeof resolveStudentTab>) {
  if (props.mode !== 'page' || !props.syncUrl || !resolved.legacy) return
  const { group: _group, sub: _sub, ...rest } = router.currentRoute.value.query
  const sub = activeTab.value === resolved.candidates[0] ? resolved.sub : ''
  router.replace({ query: { ...rest, tab: activeTab.value, ...(sub ? { sub } : {}) } })
}
canonicalizeUrl(initialResolved)

// 同步 URL（page mode）：使用者切頁籤時寫 ?tab=；殘留的 ?sub=／?group= 若不屬於新頁籤就拿掉
watch(activeTab, (val) => {
  if (props.mode !== 'page' || !props.syncUrl) return
  const currentQuery = router.currentRoute.value.query
  const keepSub = sectionBelongsTo(val, first(currentQuery.sub))
  if (currentQuery.tab === val && !currentQuery.group && (keepSub || !currentQuery.sub)) return
  const { group: _group, sub: _sub, ...rest } = currentQuery
  router.replace({ query: { ...rest, tab: val, ...(keepSub ? { sub: first(currentQuery.sub) } : {}) } })
})

// URL 帶舊 tab 名稱時即時轉換（書籤相容）；同一頁內再收到新的 ?tab=（如站內連結同頁導覽）也走這裡
watch(() => props.initialTab, (val) => {
  if (!val) return
  const resolved = resolveRequested(val)
  const target = pickVisibleTab(resolved.candidates)
  if (target !== activeTab.value) activeTab.value = target
  if (resolved.sub && target === resolved.candidates[0]) requestSection(target, resolved.sub)
  canonicalizeUrl(resolved)
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

// 總覽卡片等處的 goto-tab：值可能是舊 key（attendance／guardians…），統一走對照表；
// 帶區塊的（attendance → 教務紀錄 › 出席）同時請求頁籤內切到該區塊
function gotoTab(name: string) {
  const resolved = resolveStudentTab(name)
  const target = pickVisibleTab(resolved.candidates)
  activeTab.value = target
  if (resolved.sub && target === resolved.candidates[0]) requestSection(target, resolved.sub)
}

// 摺要列：操作
const handleLifecycleClick = () => { lifecycleDialogVisible.value = true }

const openEditDialog = async () => {
  if (!props.studentId) return
  const sid = props.studentId
  const seq = ++editSeq
  editLoading.value = true
  try {
    const { data } = await getStudent(sid)
    if (seq !== editSeq || props.studentId !== sid) return
    editInitial.value = data
    editDialogVisible.value = true
  } catch (e) {
    if (seq !== editSeq || props.studentId !== sid) return
    ElMessage.error(apiError(e, '讀取學生資料失敗'))
  } finally {
    if (seq === editSeq) editLoading.value = false
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

// 回到來源班級（帶回選取狀態）。一般返回走頂列麵包屑「‹ 學生」，
// 只有從班級名冊點進來時才需要這條帶狀態的路徑。
const showBackToClassroom = computed(
  () => props.mode === 'page' && props.fromContext === 'classroom' && Boolean(props.fromClassroomId),
)
const handleBackToClassroom = () => {
  router.replace({ path: '/classrooms', query: { selected: props.fromClassroomId } })
}
</script>

<template>
  <div class="student-detail-panel" :class="`mode-${mode}`" v-loading="loading && !profile">
    <!-- 從班級名冊進來時，提供帶回選取狀態的返回；一般返回走頂列麵包屑 -->
    <div v-if="showBackToClassroom" class="page-header">
      <el-button text :icon="ArrowLeft" class="back-btn" @click="handleBackToClassroom">
        回班級名冊
      </el-button>
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
          @goto-tab="gotoTab"
        />
        <BasicInfoTab
          v-else-if="tab.name === 'basic'"
          :profile="profile"
          @guardians-changed="handleGuardiansChanged"
        />
        <RecordsTab
          v-else-if="tab.name === 'records'"
          :student-id="safeStudentId"
          :classroom-id="(profile.basic as Record<string, unknown>)?.classroom_id as number | undefined"
          :active="activeTab === 'records'"
          :section-request="recordsSection"
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
        <HealthTab v-else-if="tab.name === 'health'" :student-id="safeStudentId" />
        <GrowthTab
          v-else-if="tab.name === 'growth'"
          :student-id="safeStudentId"
          :section-request="growthSection"
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
