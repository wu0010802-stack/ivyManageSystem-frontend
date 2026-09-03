<template>
  <section class="fee-billing-workspace" aria-label="收款工作區">
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
        <template v-else>
          <p><strong>收款流程</strong></p>
          <ol>
            <li>
              <strong>產生費用單</strong>：匯入銀行檢核檔（發單批次，月費批／註冊費批）
              一鍵產單；教材費等只收現金的費用在「現金項目」建批
            </li>
            <li><strong>應收帳款</strong>：看誰該繳；收到現金時按該列的「收款」</li>
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
                  永豐代收明細 CSV
                </el-dropdown-item>
                <el-dropdown-item command="passbook" data-test="import-passbook">
                  永豐存摺明細 CSV
                </el-dropdown-item>
                <el-dropdown-item command="billslip" divided data-test="import-billslip">
                  銀行檢核檔（發單批次）
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

        <KeepAlive>
          <FeeMonthlyStatement
            v-if="recordsMode === 'statement'"
            ref="statementRef"
            :classrooms="classrooms"
            @open-list="onOpenList"
          />
          <FeeRecordsTab
            v-else
            ref="recordsTabRef"
            auto-load
            :period-options="periodOptions"
            :classrooms="classrooms"
            :default-period="defaultPeriod"
            :initial-search="studentSearch"
          />
        </KeepAlive>
      </template>

      <!-- ── 入帳媒合 ─────────────────────────────────────────────── -->
      <FeeMatchingPanel
        v-else-if="view === 'matching'"
        ref="matchingRef"
        :source="source"
      />

      <!-- ── 現金項目（SPEC-019 §7，佔位；Task 6 換成真元件）───────────── -->
      <div v-else-if="view === 'cashItems'" data-test="cash-items-placeholder" />

      <!-- ── 退款 ─────────────────────────────────────────────────── -->
      <FeeRefundsTab v-else :period-options="periodOptions" />
    </template>

    <FeeBillSlipDrawer
      :model-value="importsOpen"
      @update:model-value="(v: boolean) => emit('update:imports-open', v)"
      @generated="onGenerated"
    />
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
 * SPEC-019 起費用單只來自發單批次與現金項目批次（範本產單已移除）。
 * 預繳款自 2026-08-26 起併入應收帳款（月表「預繳」欄與工具列入口）。
 */
import { computed, nextTick, onActivated, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, WarningFilled } from '@element-plus/icons-vue'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { getFeePeriods } from '@/api/fees'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { useAllClassroomStore } from '@/stores/classroomAll'
import FeeMonthlyStatement from '@/components/fees/FeeMonthlyStatement.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'
import FeeMatchingPanel from './FeeMatchingPanel.vue'
import FeeBillSlipDrawer from './FeeBillSlipDrawer.vue'
import FeeSegToggle from './FeeSegToggle.vue'
import FeeWorkspaceToolbar from './FeeWorkspaceToolbar.vue'
import { FEE_MATCHING_SOURCES, FEE_WORKSPACE_VIEWS } from './feesNavigation'
import { useFeeOverview } from './useFeeOverview'

const props = withDefaults(
  defineProps<{
    view?: string
    source?: string
    importsOpen?: boolean
    studentSearch?: string
  }>(),
  { view: 'receivable', source: 'collection', importsOpen: false, studentSearch: '' },
)

const emit = defineEmits<{
  'change-view': [view: string]
  'change-source': [src: string]
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

// 帳款檢視模式：月表（預設）⇄ 逐筆明細；帶全域搜尋進場時直接落地逐筆
const RECORDS_MODES = [
  { key: 'statement', label: '月表' },
  { key: 'list', label: '逐筆' },
]
const recordsMode = ref<'statement' | 'list'>(props.studentSearch ? 'list' : 'statement')

function onRecordsModeChange(val: string) {
  recordsMode.value = val === 'list' ? 'list' : 'statement'
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

const matchingRef = ref<{
  openImport?: () => void
  openCoverage?: () => void
  refresh?: () => void
} | null>(null)

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
  if (recordsMode.value === 'statement') statementRef.value?.refresh?.()
  else recordsTabRef.value?.fetchRecords?.()
}

function onGenerated() {
  // 產單後刷新應收帳款（若已掛載）與待辦數
  refreshActiveRecordsView()
  refreshOverview()
}

// 月表「到逐筆明細處理」：切換模式並預帶學生姓名
async function onOpenList(studentName: string) {
  recordsMode.value = 'list'
  await nextTick()
  if (studentName) recordsTabRef.value?.applySearch?.(studentName)
}

// 切回收款工作區時刷新（KeepAlive activate）：在結算頁簽收、或別的 session
// 銷帳後回到這裡，舊實例會停在變更前的快照。首次 activate 與 mount 同一輪、
// 子元件自己會載，故跳過第一次——用旗標而非 onMounted 時序，避免依賴 hook 順序。
let activatedOnce = false
onActivated(() => {
  if (activatedOnce) {
    if (props.view === 'matching') matchingRef.value?.refresh?.()
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
  (next, prev) => {
    if (next === 'receivable' && prev !== undefined && prev !== 'receivable') {
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
