<template>
  <section class="fee-billing-workspace" aria-label="帳單工作區">
    <div class="workspace-bar">
      <el-segmented
        :model-value="view"
        :options="viewOptions"
        aria-label="帳單檢視切換"
        data-test="billing-view-switch"
        @change="onViewChange"
      />
      <el-button
        v-if="canWrite"
        type="primary"
        aria-label="批次產生費用單"
        data-test="billing-generate"
        @click="generateVisible = true"
      >
        產生費用單
      </el-button>
    </div>

    <div v-if="!periodsReady" class="workspace-loading">
      <el-skeleton :rows="4" animated />
    </div>
    <KeepAlive v-else>
      <FeeRecordsTab
        v-if="view === 'records'"
        ref="recordsTabRef"
        auto-load
        :period-options="periodOptions"
        :classrooms="classrooms"
        :default-period="defaultPeriod"
        :initial-search="studentSearch"
      />
      <PrepaymentsTab v-else-if="view === 'prepayments'" />
      <FeeRefundsTab v-else :period-options="periodOptions" />
    </KeepAlive>

    <FeeGenerateModal
      v-model="generateVisible"
      :school-year="generateTerm?.schoolYear"
      :semester="generateTerm?.semester"
      @generated="onGenerated"
    />
  </section>
</template>

<script setup lang="ts">
/**
 * 帳單工作區：整合帳款（繳費記錄）/ 預繳款 / 學費退費三個次層檢視。
 * 「產生費用單」自費用範本頁移到本工作區 header，成為帳單的主要操作。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getFeePeriods } from '@/api/fees'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { useAllClassroomStore } from '@/stores/classroomAll'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import PrepaymentsTab from '@/components/fees/PrepaymentsTab.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'
import { FEE_WORKSPACE_VIEWS } from './feesNavigation'

const props = withDefaults(
  defineProps<{
    view?: string
    studentSearch?: string
  }>(),
  { view: 'records', studentSearch: '' },
)

const emit = defineEmits<{
  'change-view': [view: string]
}>()

const viewOptions = FEE_WORKSPACE_VIEWS.billing.map((v) => ({
  label: v.label,
  value: v.key,
}))

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))

// ─── 學期選項與預設學期（等載入完成再掛帳款表，確保首次查詢就聚焦當前學期）───
const periodOptions = ref<string[]>([])
const periodsReady = ref(false)
const defaultPeriod = ref('')

// 班級清單跨學期（帳款以班名比對，FeeRecordsTab 內再按班名去重）
const classroomStore = useAllClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

const recordsTabRef = ref<{
  fetchRecords?: () => void
  applySearch?: (name: string) => void
} | null>(null)

const generateVisible = ref(false)

// 產單 modal 繼承目前聚焦的學期脈絡（"115-1" → 學年 115／上學期）；
// 尚無 defaultPeriod 時交由 modal 以當前學年預設
const generateTerm = computed(() => {
  const [y, s] = (defaultPeriod.value || '').split('-').map(Number)
  if (!y || (s !== 1 && s !== 2)) return null
  return { schoolYear: y, semester: s }
})

async function loadPeriods() {
  try {
    periodOptions.value = ((await getFeePeriods()) as string[]) ?? []
    const term = getCurrentAcademicTerm()
    const termPeriod = `${term.school_year}-${term.semester}`
    // 預設聚焦當前學期；資料尚無當前學期時退回最近一期（periods 由後端 desc 排序）
    defaultPeriod.value = periodOptions.value.includes(termPeriod)
      ? termPeriod
      : periodOptions.value[0] ?? ''
  } catch (e) {
    ElMessage.error(friendlyError('載入學期列表失敗', e))
  } finally {
    periodsReady.value = true
  }
}

function onViewChange(val: string | number) {
  const next = String(val)
  if (next !== props.view) emit('change-view', next)
}

function onGenerated() {
  // 產單後刷新帳款清單（若已掛載）
  recordsTabRef.value?.fetchRecords?.()
}

// 回到帳款檢視時刷新（沿用舊版切回「繳費記錄」自動重載的行為；
// 首次掛載由 FeeRecordsTab 自行載入，此處只處理「切回」既存實例）。
// flush: 'post' 確保 KeepAlive 重新啟用後 ref 已恢復。
watch(
  () => props.view,
  (next, prev) => {
    if (next === 'records' && prev !== undefined && prev !== 'records') {
      recordsTabRef.value?.fetchRecords?.()
    }
  },
  { flush: 'post' },
)

// 全域搜尋（?search=學生姓名）：轉交帳款清單預篩
watch(
  () => props.studentSearch,
  (kw) => {
    if (kw) recordsTabRef.value?.applySearch?.(kw)
  },
  { flush: 'post' },
)

onMounted(() => {
  loadPeriods()
  classroomStore.fetchClassrooms()
})
</script>

<style scoped>
.workspace-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.workspace-loading {
  padding: var(--space-4) 0;
}
</style>
