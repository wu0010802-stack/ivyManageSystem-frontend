<template>
  <div class="student-fee-view">
    <PageHeader title="學費管理" subtitle="查看各學期、班級的應收費用與繳費狀態" />

    <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
      <!-- ================================================================
           Tab 1：繳費記錄（主要工作面板）
      ================================================================ -->
      <el-tab-pane label="繳費記錄" name="records">
        <FeeRecordsTab
          v-if="visitedTabs.has('records')"
          ref="feeRecordsTabRef"
          :period-options="periodOptions"
          :classrooms="classrooms"
        />
      </el-tab-pane>

      <!-- ================================================================
           Tab 2：費用總覽（依範本計算每生應繳）
      ================================================================ -->
      <el-tab-pane label="費用總覽" name="templates">
        <FeeTemplateTab v-if="visitedTabs.has('templates')" />
      </el-tab-pane>

      <!-- ================================================================
           Tab 3：退費管理
      ================================================================ -->
      <el-tab-pane label="退費管理" name="refunds">
        <FeeRefundsTab v-if="visitedTabs.has('refunds')" :period-options="periodOptions" />
      </el-tab-pane>

      <!-- ================================================================
           SPEC-014：銀行對帳 / 預繳款 / 現金交接 / 關帳 / 銷帳碼
      ================================================================ -->
      <el-tab-pane label="銀行對帳" name="bankRecon" lazy>
        <BankReconTab />
      </el-tab-pane>
      <el-tab-pane label="預繳款" name="prepayments" lazy>
        <PrepaymentsTab />
      </el-tab-pane>
      <el-tab-pane label="現金交接" name="cashHandover" lazy>
        <CashHandoverTab />
      </el-tab-pane>
      <el-tab-pane label="當期關帳" name="close" lazy>
        <CloseTab />
      </el-tab-pane>
      <el-tab-pane label="銷帳碼" name="billingCodes" lazy>
        <BillingCodesTab />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { friendlyError } from '@/utils/errorMessages'
import { getFeePeriods } from '@/api/fees'
import { useAllClassroomStore } from '@/stores/classroomAll'
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import FeeRecordsTab from '@/components/fees/FeeRecordsTab.vue'
import FeeRefundsTab from '@/components/fees/FeeRefundsTab.vue'
import BankReconTab from '@/components/fees/BankReconTab.vue'
import PrepaymentsTab from '@/components/fees/PrepaymentsTab.vue'
import CashHandoverTab from '@/components/fees/CashHandoverTab.vue'
import CloseTab from '@/components/fees/CloseTab.vue'
import BillingCodesTab from '@/components/fees/BillingCodesTab.vue'
import PageHeader from '@/components/common/PageHeader.vue'

// ─── Tab 狀態（?tab= allowlist 同步；非作用中 tab lazy mount） ────────────────
const TAB_KEYS = ['records', 'templates', 'refunds'] as const
type TabKey = (typeof TAB_KEYS)[number]

const route = useRoute()
const router = useRouter()

function resolveTab(raw: unknown): TabKey {
  const q = Array.isArray(raw) ? raw[0] : raw
  return (TAB_KEYS as readonly string[]).includes(q as string) ? (q as TabKey) : 'records'
}

// 預設「繳費記錄」（日常工作面板）；範本/總覽為輔助檢視。
// visitedTabs：只 mount 造訪過的 tab，避免進頁就載入三套資料（mount 後保留，切回不重掛）。
const activeTab = ref<TabKey>(resolveTab(route.query.tab))
const visitedTabs = reactive(new Set<TabKey>([activeTab.value]))
const periodOptions = ref<string[]>([])

// 外部 query 變動（瀏覽器上一頁等非經 tab-change 途徑）→ 跟隨
watch(
  () => route.query.tab,
  (q) => {
    const t = resolveTab(q)
    activeTab.value = t
    visitedTabs.add(t)
  },
)

function onTabChange(name: string | number) {
  const t = resolveTab(name)
  activeTab.value = t
  visitedTabs.add(t)
  syncTabQuery(t)
}

// 切回繳費記錄時重抓（資料可能已因退費/產單而變）；首次 mount 由 onMounted 觸發。
// 走 watch 讓 tab-change 與外部 query 變動（上一頁）兩條路徑行為一致；
// nextTick 等 v-if 掛載完成後 ref 才可用。
watch(activeTab, (t) => {
  if (t === 'records') nextTick(() => feeRecordsTabRef.value?.fetchRecords?.())
})

function syncTabQuery(t: TabKey) {
  const current = typeof route.query.tab === 'string' ? route.query.tab : undefined
  if (current === t) return
  // 只補 tab 鍵，其餘 query（含 ?search=）原樣保留；不得把學生姓名等 PII 新寫進 URL
  void Promise.resolve(router.replace({ query: { ...route.query, tab: t } })).catch(() => {})
}

// ─── 子元件 ref（records tab） ──────────────────────────────────────────────
const feeRecordsTabRef = ref<{
  fetchRecords?: () => void
  applySearch?: (name: string) => void
} | null>(null)

// ─── 班級列表（供子元件下拉選單） ──────────────────────────────────────────
// 繳費記錄篩的是既有帳單（班名不跟學期）→ 班級清單要跨學期，FeeRecordsTab 再按班名去重。
const classroomStore = useAllClassroomStore()
const classrooms = computed(() => classroomStore.classrooms)

async function fetchFeePeriods() {
  try {
    periodOptions.value = (await getFeePeriods()) as string[]
  } catch (e) {
    ElMessage.error(friendlyError('載入學期列表失敗', e))
  }
}

onMounted(() => {
  fetchFeePeriods()
  classroomStore.fetchClassrooms()
  if (activeTab.value === 'records') {
    // 全域搜尋導航帶入 ?search=<學生姓名>：預填學生姓名並篩選
    const kw = typeof route.query.search === 'string' ? route.query.search : ''
    if (kw) feeRecordsTabRef.value?.applySearch?.(kw)
    else feeRecordsTabRef.value?.fetchRecords?.()
  }
})
</script>

<style scoped>
.student-fee-view {
  padding: var(--space-5);
}
</style>
