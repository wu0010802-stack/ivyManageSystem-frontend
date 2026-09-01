<template>
  <section class="fee-billing-workspace" aria-label="帳單工作區">
    <div class="workspace-bar">
      <div class="workspace-bar__nav">
        <el-segmented
          :model-value="view"
          :options="viewOptions"
          aria-label="帳單檢視切換"
          data-test="billing-view-switch"
          @change="onViewChange"
        />
        <el-segmented
          v-if="view === 'records'"
          :model-value="recordsMode"
          :options="recordsModeOptions"
          size="small"
          aria-label="帳款檢視模式"
          data-test="records-mode-switch"
          @change="onRecordsModeChange"
        />
      </div>
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
      <FeeMonthlyStatement
        v-if="view === 'records' && recordsMode === 'statement'"
        ref="statementRef"
        :classrooms="classrooms"
        @open-list="onOpenList"
      />
      <FeeRecordsTab
        v-else-if="view === 'records'"
        ref="recordsTabRef"
        auto-load
        :period-options="periodOptions"
        :classrooms="classrooms"
        :default-period="defaultPeriod"
        :initial-search="studentSearch"
      />
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
 * 帳單工作區：整合帳款（繳費記錄）/ 學費退費兩個次層檢視。
 * 預繳款自 2026-08-26 起併入帳款：彙總繳費表「預繳」欄＋工具列
 * 訪視預繳/退款入口（見 FeeMonthlyStatement），不再有獨立子檢視。
 * 費用單自 2026-08-25 起由後端排程依啟用範本每日自動產生；2026-09-01 起
 * 恢復「產生費用單」手動入口與排程並行（同一冪等產單核心，重跑只會跳過，
 * 手動用於立即補產、不需等隔日排程）。
 *
 * 帳款檢視自 2026-08 起有兩個模式：彙總繳費表（月繳總表，預設）與
 * 逐筆明細（原 FeeRecordsTab，行為不變）；部分繳費／退款等單項操作
 * 由彙總表 emit open-list 導向逐筆明細。
 */
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getFeePeriods } from '@/api/fees'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { useAllClassroomStore } from '@/stores/classroomAll'
import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
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

// 帳款檢視模式：彙總繳費表（預設）⇄ 逐筆明細；帶全域搜尋進場時直接落地逐筆
const recordsModeOptions = [
  { label: '彙總繳費表', value: 'statement' },
  { label: '逐筆明細', value: 'list' },
]
const recordsMode = ref<'statement' | 'list'>(props.studentSearch ? 'list' : 'statement')

function onRecordsModeChange(val: string | number) {
  recordsMode.value = String(val) === 'list' ? 'list' : 'statement'
}

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

const statementRef = ref<{ refresh?: () => void } | null>(null)

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

// 刷新目前作用中的帳款檢視（彙總表或逐筆明細）
function refreshActiveRecordsView() {
  if (recordsMode.value === 'statement') statementRef.value?.refresh?.()
  else recordsTabRef.value?.fetchRecords?.()
}

function onGenerated() {
  // 產單後刷新帳款檢視（若已掛載）
  refreshActiveRecordsView()
}

// 彙總表「到逐筆明細處理」：切換模式並預帶學生姓名
async function onOpenList(studentName: string) {
  recordsMode.value = 'list'
  await nextTick()
  if (studentName) recordsTabRef.value?.applySearch?.(studentName)
}

// 切回帳單工作區時刷新（KeepAlive activate）：對帳工作區銷帳後回到這裡，
// 舊實例會停在分配前的快照。首次 activate 與 mount 同一輪、子元件自己會載，
// 故跳過第一次——用旗標而非 onMounted 時序，避免依賴 hook 執行順序。
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) refreshActiveRecordsView()
  activatedOnce = true
})

// 回到帳款檢視時刷新（沿用舊版切回「繳費記錄」自動重載的行為；
// 首次掛載由子元件自行載入，此處只處理「切回」既存實例）。
// flush: 'post' 確保 KeepAlive 重新啟用後 ref 已恢復。
watch(
  () => props.view,
  (next, prev) => {
    if (next === 'records' && prev !== undefined && prev !== 'records') {
      refreshActiveRecordsView()
    }
  },
  { flush: 'post' },
)

// 全域搜尋（?search=學生姓名）：落地逐筆明細並轉交預篩
watch(
  () => props.studentSearch,
  async (kw) => {
    if (!kw) return
    if (recordsMode.value !== 'list') {
      recordsMode.value = 'list'
      await nextTick()
    }
    recordsTabRef.value?.applySearch?.(kw)
  },
  { flush: 'post' },
)

onMounted(() => {
  loadPeriods()
  classroomStore.fetchClassrooms()
})
</script>

<style scoped>
.workspace-bar__nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

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
