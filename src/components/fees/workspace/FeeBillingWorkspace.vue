<template>
  <section ref="workspaceRoot" class="fee-billing-workspace" aria-label="收款工作區">
    <FeeWorkspaceToolbar
      :views="views"
      :view="view"
      :counts="subCounts"
      tabs-label="收款檢視切換"
      tabs-test-id="billing-view"
      help-label="顯示收款流程說明"
      @change-view="(v: string) => emit('change-view', v)"
    >
      <template #lead>
        <!-- 應收帳款：月表／逐筆；入帳媒合：代收／存摺 -->
        <FeeSegToggle
          v-if="view === 'receivable'"
          :options="RECORDS_MODES"
          :model-value="recordsMode"
          label="應收帳款檢視模式"
          test-id="records-mode-switch"
          @update:model-value="onRecordsModeChange"
        />
        <FeeSegToggle
          v-else-if="view === 'matching'"
          :options="FEE_MATCHING_SOURCES"
          :model-value="source"
          label="入帳資料來源"
          test-id="matching-source-switch"
          @update:model-value="(v: string) => emit('change-source', v)"
        />
      </template>

      <template #help>
        <template v-if="view === 'matching'">
          <p><strong>入帳媒合</strong></p>
          <ol>
            <li>每月從永豐下載代收明細 CSV，按右上「匯入」</li>
            <li>系統依銷帳末四碼自動媒合學生與帳單期別</li>
            <li>剩下「待媒合」的逐筆按「媒合／分配」處理（舊期別、拆分、沖銷）</li>
            <li>月底用「存摺勾稽」確認代收合計與存摺入帳一致</li>
          </ol>
          <p class="fee-help__note">
            代收明細是對帳主來源；存摺明細只做勾稽，避免同一筆錢被分配兩次。
          </p>
        </template>
        <template v-else-if="view === 'refunds'">
          <p><strong>退款</strong></p>
          <p>
            這裡列的是已退費的費用單。要退一筆新的，按「新增退費」挑出該生的費用單，
            系統會依已繳金額試算可退上限。
          </p>
          <p class="fee-help__note">預繳款的退款走應收帳款的「預繳款」入口，不在此頁。</p>
        </template>
        <template v-else-if="view === 'cashItems'">
          <p><strong>現金項目</strong></p>
          <ol>
            <li><strong>新增收費項目</strong>：填寫內容 → 指定學生或依年級帶入 → 確認金額 → 登記收款</li>
            <li><strong>新生預繳</strong>：登記 5,000 現金；註冊費批產單時自動標記已套用</li>
          </ol>
          <p class="fee-help__note">新生註冊費、耗材費等不納入網銀銷帳單的收費，在這裡建立與收款；銀行發單項目仍在應收帳款處理。</p>
        </template>
        <template v-else>
          <p><strong>收款流程</strong></p>
          <ol>
            <li>
              <strong>產生費用單</strong>：匯入銀行檢核檔（發單批次，月費批／註冊費批）
              一鍵產單；教材費等只收現金的費用在「現金項目」建批
            </li>
            <li><strong>應收帳款</strong>：看誰該繳；收到現金時按該列的「收款」</li>
            <li>銷帳單未包含的零散消費，可用「新增單筆費用」補登額外應收</li>
            <li><strong>入帳媒合</strong>：匯入代收明細後，把銀行收到的錢分配到費用單</li>
            <li>月底到「結算」交接現金並關帳</li>
          </ol>
          <p class="fee-help__note">
            月表＝每生一列、依月份看；逐筆＝每張費用單一列、依學期看。
          </p>
        </template>
      </template>

      <template #actions>
        <template v-if="view === 'receivable'">
          <el-button v-if="canCreateManualFee" type="primary" data-test="billing-create-manual-fee" @click="manualFeeOpen = true">
            新增單筆費用
          </el-button>
          <el-dropdown
            v-if="canWrite"
            trigger="click"
            data-test="billing-slip-template-menu"
            @command="onSlipTemplateCommand"
          >
            <el-button>
              產生範本<el-icon class="el-icon--right" aria-hidden="true"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="monthly" data-test="slip-template-monthly">
                  月費單範本：依年段月費，本月在園學生
                </el-dropdown-item>
                <el-dropdown-item command="registration" data-test="slip-template-registration">
                  註冊費單範本：依年段註冊費，不含本學年新生
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown
            v-if="canWrite"
            trigger="click"
            data-test="billing-import-menu"
            @command="onImportCommand"
          >
            <el-button>
              匯入<el-icon class="el-icon--right" aria-hidden="true"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="collection" data-test="import-collection">
                  登錄銀行繳費：永豐代收明細 CSV
                </el-dropdown-item>
                <el-dropdown-item command="passbook" data-test="import-passbook">
                  核對實際入帳：永豐存摺明細 CSV
                </el-dropdown-item>
                <el-dropdown-item command="billslip" divided data-test="import-billslip">
                  建立費用單：銀行檢核檔（發單批次）
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <template v-else-if="view === 'matching'">
          <el-button
            v-if="canWrite && source === 'collection'"
            aria-label="勾稽存摺代收批次入帳"
            data-test="matching-coverage"
            @click="matchingRef?.openCoverage?.()"
          >
            存摺勾稽
          </el-button>
          <el-button
            v-if="canWrite && source !== 'passbook'"
            type="primary"
            aria-label="批次媒合可一鍵入帳的代收繳費"
            data-test="matching-batch"
            @click="matchingRef?.openBatch?.()"
          >
            批次媒合
          </el-button>
          <el-button
            v-if="canWrite"
            type="primary"
            :aria-label="`匯入${source === 'passbook' ? '存摺' : '代收'}明細 CSV`"
            data-test="matching-import"
            @click="matchingRef?.openImport?.()"
          >
            匯入 CSV
          </el-button>
        </template>


      </template>
    </FeeWorkspaceToolbar>

    <div v-if="!periodsReady" class="workspace-loading">
      <el-skeleton :rows="4" animated />
    </div>

    <template v-else>
      <!-- ── 應收帳款 ─────────────────────────────────────────────── -->
      <template v-if="view === 'receivable'">
        <!-- SPEC-018：檢核檔已匯入但未產單＝收款與代收核銷都沒有正確金額的單可對 -->
        <div v-if="pendingBillSlips > 0" class="slip-notice" data-test="billslip-notice">
          <el-icon class="slip-notice__icon" aria-hidden="true"><WarningFilled /></el-icon>
          <span class="slip-notice__text">
            <strong>{{ pendingBillSlips }} 個發單批次已匯入、尚未產生費用單</strong>
            <span v-if="pendingBillSlipAmount">
              （應收合計 {{ formatCurrency(pendingBillSlipAmount) }}）</span
            >
          </span>
          <el-button
            text
            size="small"
            data-test="billslip-notice-open"
            @click="emit('update:imports-open', true)"
          >
            前往產單
          </el-button>
        </div>

      </template>

      <!-- KeepAlive 常駐，次頁往返只停用帳款實例；首次仍按需掛載。 -->
        <KeepAlive :key="recordsVersion">
          <FeeMonthlyStatement
            v-if="view === 'receivable' && recordsMode === 'statement'"
            ref="statementRef"
            :classrooms="classrooms"
            @open-list="onOpenList"
            @open-imports="emit('update:imports-open', true)"
          />
          <FeeRecordsTab
            v-else-if="view === 'receivable'"
            ref="recordsTabRef"
            auto-load
            :period-options="periodOptions"
            :classrooms="classrooms"
            :default-period="defaultPeriod"
            :initial-search="createdStudentSearch || studentSearch"
          />
        </KeepAlive>

      <!-- ── 入帳媒合 ─────────────────────────────────────────────── -->
      <FeeMatchingPanel
        v-if="view === 'matching'"
        ref="matchingRef"
        :source="source"
      />

      <!-- ── 現金項目（SPEC-019 §7）────────────────────────────────── -->
      <CashItemsView v-else-if="view === 'cashItems'" ref="cashItemsRef" />

      <!-- ── 退款 ─────────────────────────────────────────────────── -->
      <FeeRefundsTab v-else-if="view === 'refunds'" :period-options="periodOptions" />
    </template>

    <FeeBillSlipDrawer
      :model-value="importsOpen"
      @update:model-value="(v: boolean) => emit('update:imports-open', v)"
      @generated="onGenerated"
    />
    <FeeSlipTemplateDialog
      v-model="slipTemplateOpen"
      :kind="slipTemplateKind"
      :default-year="slipTemplateYear"
      :default-month="slipTemplateMonth"
    />
    <ManualFeeRecordDialog v-if="canCreateManualFee" v-model="manualFeeOpen" @created="onManualFeeCreated" />
  </section>
</template>

<script setup lang="ts">
/**
 * 收款工作區（2026-09-02 IA 合併：原「帳單」＋「對帳」）。
 *
 * 合併理由：對帳的三個檢視本來就是收款流程的下半段（錢進來了沒、對到誰），
 * 與帳單分成兩個平行主導航後，一筆學費從「該收」到「收到並對上」要跨兩個
 * 工作區、五個同層檢視。合併後次層：
 *
 *   - receivable 應收帳款（月表／逐筆兩種檢視模式，含預繳與批次收款）
 *   - cashItems  現金項目（SPEC-019 §7：教材費等只收現金的批次＋新生預繳）
 *   - matching   入帳媒合（代收明細／存摺明細兩個來源，SPEC-016 語意不變）
 *   - refunds    退款
 *
 * 原「發單與未繳」降為「發單批次」抽屜（月拋一次的操作不該常駐佔檢視），
 * 三種匯入（代收 CSV／存摺 CSV／銀行檢核檔）收斂成工具列一顆「匯入」下拉。
 *
 * 費用單來自發單批次、現金項目批次，另可手動補登未列入銷帳單的額外應收。
 * 預繳款自 2026-08-26 起併入應收帳款（月表「預繳」欄與工具列入口）。
 */
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, WarningFilled } from '@element-plus/icons-vue'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { getFeePeriods } from '@/api/fees'
import type { Schema } from '@/api/_generated/typed'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { useAllClassroomStore } from '@/stores/classroomAll'
import CashItemsView from '@/components/fees/CashItemsView.vue'
import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import ManualFeeRecordDialog from '@/components/fees/ManualFeeRecordDialog.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'
import FeeMatchingPanel from './FeeMatchingPanel.vue'
import FeeBillSlipDrawer from './FeeBillSlipDrawer.vue'
import FeeSlipTemplateDialog from './FeeSlipTemplateDialog.vue'
import type { SlipTemplateKind } from '@/api/fees'
import FeeSegToggle from './FeeSegToggle.vue'
import FeeWorkspaceToolbar from './FeeWorkspaceToolbar.vue'
import {
  FEE_MATCHING_SOURCES,
  FEE_RECORDS_MODES,
  FEE_WORKSPACE_VIEWS,
} from './feesNavigation'
import { useFeeOverview } from './useFeeOverview'

const props = withDefaults(
  defineProps<{
    view?: string
    source?: string
    /** 應收帳款檢視模式（由 route query 控制，重新整理／分享網址可還原） */
    recordsMode?: string
    importsOpen?: boolean
    studentSearch?: string
  }>(),
  {
    view: 'receivable',
    source: 'collection',
    recordsMode: 'statement',
    importsOpen: false,
    studentSearch: '',
  },
)

const emit = defineEmits<{
  'change-view': [view: string]
  'change-source': [src: string]
  'change-mode': [mode: string]
  'update:imports-open': [open: boolean]
  navigate: [target: { ws: 'billing' | 'settlement' | 'workbench'; view?: string }]
}>()

const views = FEE_WORKSPACE_VIEWS.billing

const { actionItems, pendingBillSlips, pendingBillSlipAmount, refresh: refreshOverview } =
  useFeeOverview()

/** 次層頁籤的待辦徽章：只標在確實有待處理項目的檢視上 */
const subCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {}
  for (const item of actionItems.value) {
    if (item.target.ws !== 'billing' || !item.target.view) continue
    counts[item.target.view] = (counts[item.target.view] ?? 0) + 1
  }
  return counts
})

// 帳款檢視模式：月表（預設）⇄ 逐筆明細。
// 2026-09-07：改由 route query（?mode=）控制。原本是純本地 ref，重新整理、
// 分享網址、上一頁都回不到逐筆，與同層的 ?src= 行為互相矛盾。
const RECORDS_MODES = FEE_RECORDS_MODES
const recordsMode = computed<'statement' | 'list'>(() =>
  props.recordsMode === 'list' ? 'list' : 'statement',
)

function onRecordsModeChange(val: string) {
  emit('change-mode', val === 'list' ? 'list' : 'statement')
}

/** 內部流程（新增費用後、月表「到逐筆明細處理」、全域搜尋）切到逐筆 */
function gotoListMode() {
  if (recordsMode.value !== 'list') emit('change-mode', 'list')
}

const canWrite = computed(() => hasPermission(PERMISSION_NAMES.FEES_WRITE))
const canCreateManualFee = computed(() => canWrite.value && hasPermission(PERMISSION_NAMES.STUDENTS_READ))
const manualFeeOpen = ref(false)
const createdStudentSearch = ref('')
const recordsVersion = ref(0)
const workspaceRoot = ref<HTMLElement | null>(null)
let recordsScrollTop = 0
let workspaceActive = true
function saveRecordsScroll() {
  const host = workspaceRoot.value?.closest<HTMLElement>('#admin-main')
  if (host) recordsScrollTop = host.scrollTop
}
let recordsNavigation = 0
async function refreshRecordsAndRestoreScroll() {
  const navigation = recordsNavigation
  const targetTop = recordsScrollTop
  const pending = refreshActiveRecordsView()
  await nextTick()
  const host = workspaceRoot.value?.closest<HTMLElement>('#admin-main')
  const initialTop = host?.scrollTop
  await pending
  await nextTick()
  // 使用者已換頁／切模式或自行捲動時，晚回的刷新不可拉動畫面。
  if (navigation !== recordsNavigation || !workspaceActive || props.view !== 'receivable') return
  if (host && host.scrollTop === initialTop) host.scrollTop = targetTop
}
watch(() => [props.view, recordsMode.value], () => { recordsNavigation += 1 })
// DOM 切換前保存位置；搜尋條件只留在此元件樹記憶體內。
watch(() => props.view, (next, previous) => {
  if (previous === 'receivable' && next !== previous) saveRecordsScroll()
})
onDeactivated(() => { workspaceActive = false })

// ─── 學期選項與預設學期（等載入完成再掛帳款表，確保首次查詢就聚焦當前學期）───
const periodOptions = ref<string[]>([])
const periodsReady = ref(false)
const defaultPeriod = ref('')

// 班級清單跨學期（帳款以班名比對，FeeRecordsTab 內再按班名去重）
const classroomStore = useAllClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

const recordsTabRef = ref<{
  fetchRecords?: () => Promise<unknown> | void
  applySearch?: (name: string) => void
} | null>(null)

const statementRef = ref<{ refresh?: () => Promise<unknown> | void } | null>(null)

// 同一模式首次掛載由子元件自載；已看過的模式再啟用才刷新。
// 另一模式可能在媒合、產單或收款前已快取，不能只刷新返回時的作用中模式。
const visitedRecordsModes = new Set<string>()
watch(
  () => [props.view, recordsMode.value, recordsVersion.value] as const,
  async ([view, mode, version], [previousView, previousMode, previousVersion]) => {
    if (version !== previousVersion) {
      visitedRecordsModes.clear()
      return
    }
    if (previousView === 'receivable') {
      const previousInstance = previousMode === 'statement' ? statementRef.value : recordsTabRef.value
      if (previousInstance) visitedRecordsModes.add(previousMode)
    }
    if (view !== 'receivable' || previousView !== view || mode === previousMode) return
    if (!visitedRecordsModes.has(mode)) return
    await nextTick()
    if (workspaceActive && props.view === view && recordsMode.value === mode && recordsVersion.value === version) {
      refreshActiveRecordsView()
    }
  },
)

const matchingRef = ref<{
  openImport?: () => void
  openCoverage?: () => void
  openBatch?: () => void
  refresh?: () => void
} | null>(null)

const cashItemsRef = ref<{ refresh?: () => void; openCreate?: () => void } | null>(null)

async function loadPeriods() {
  try {
    periodOptions.value = ((await getFeePeriods()) as string[]) ?? []
    const term = getCurrentAcademicTerm()
    const termPeriod = `${term.school_year}-${term.semester}`
    // 預設聚焦當前學期；資料尚無當前學期時退回最近一期（periods 由後端 desc 排序）
    defaultPeriod.value = periodOptions.value.includes(termPeriod)
      ? termPeriod
      : (periodOptions.value[0] ?? '')
  } catch (e) {
    ElMessage.error(friendlyError('載入學期列表失敗', e))
  } finally {
    periodsReady.value = true
  }
}

/** 產生範本：依名冊產出上傳永豐的 .xls（不建費用單，見 SPEC-025 §1） */
const slipTemplateOpen = ref(false)
const slipTemplateKind = ref<SlipTemplateKind>('monthly')
const now = new Date()
const slipTemplateYear = ref(now.getFullYear())
const slipTemplateMonth = ref(now.getMonth() + 1)

function onSlipTemplateCommand(command: string) {
  slipTemplateKind.value = command === 'registration' ? 'registration' : 'monthly'
  slipTemplateOpen.value = true
}

/** 匯入下拉：前兩項切到入帳媒合對應來源並展開匯入面板，第三項開發單批次抽屜 */
async function onImportCommand(command: string) {
  if (command === 'billslip') {
    emit('update:imports-open', true)
    return
  }
  const src = command === 'passbook' ? 'passbook' : 'collection'
  if (props.view !== 'matching') emit('change-view', 'matching')
  if (props.source !== src) emit('change-source', src)
  // 等父層 query 變更回灌 props、對應子元件掛好再展開匯入面板
  await nextTick()
  await nextTick()
  matchingRef.value?.openImport?.()
}

// 刷新目前作用中的帳款檢視（月表或逐筆明細）
function refreshActiveRecordsView() {
  if (recordsMode.value === 'statement') return statementRef.value?.refresh?.()
  return recordsTabRef.value?.fetchRecords?.()
}

function onGenerated() {
  // 產單後刷新應收帳款（若已掛載）與待辦數
  refreshActiveRecordsView()
  refreshOverview()
}

async function onManualFeeCreated(record: Schema<'FeeRecordOut'>) {
  await loadPeriods()
  defaultPeriod.value = record.period || ''
  if (record.period && !periodOptions.value.includes(record.period)) {
    periodOptions.value.unshift(record.period)
  }
  createdStudentSearch.value = record.student_name || ''
  gotoListMode()
  // 清掉兩種模式的快取，並用新費用的學期與學生重新載入逐筆明細。
  recordsVersion.value += 1
  refreshOverview()
}

// 月表「到逐筆明細處理」：切換模式並預帶學生姓名
async function onOpenList(studentName: string) {
  gotoListMode()
  await nextTick()
  if (studentName) recordsTabRef.value?.applySearch?.(studentName)
}

// 切回收款工作區時刷新（KeepAlive activate）：在結算頁簽收、或別的 session
// 銷帳後回到這裡，舊實例會停在變更前的快照。首次 activate 與 mount 同一輪、
// 子元件自己會載，故跳過第一次——用旗標而非 onMounted 時序，避免依賴 hook 順序。
let activatedOnce = false
onActivated(() => {
  workspaceActive = true
  if (activatedOnce) {
    if (props.view === 'matching') matchingRef.value?.refresh?.()
    else if (props.view === 'cashItems') cashItemsRef.value?.refresh?.()
    else refreshActiveRecordsView()
    refreshOverview()
  }
  activatedOnce = true
})

// 回到應收帳款檢視時刷新（沿用舊版切回「繳費記錄」自動重載的行為；
// 首次掛載由子元件自行載入，此處只處理「切回」既存實例）。
// flush: 'post' 確保 KeepAlive 重新啟用後 ref 已恢復。
watch(
  () => props.view,
  async (next, prev) => {
    if (next === 'receivable' && prev !== undefined && prev !== 'receivable') {
      await refreshRecordsAndRestoreScroll()
    }
  },
  { flush: 'post' },
)

// 全域搜尋（?search=學生姓名）：落地逐筆明細並轉交預篩
watch(
  () => props.studentSearch,
  async (kw) => {
    if (!kw) return
    createdStudentSearch.value = ''
    if (recordsMode.value !== 'list') {
      gotoListMode()
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

defineExpose({ onSlipTemplateCommand })
</script>

<style scoped>
.workspace-loading {
  padding: var(--space-4) 0;
}

.slip-notice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-warning-soft);
  border-radius: var(--radius-md);
  background: var(--color-warning-soft);
  font-size: var(--text-sm);
  color: var(--color-warning-darker);
}

.slip-notice__icon {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--color-warning);
}

.slip-notice__text {
  flex: 1 1 auto;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
</style>
