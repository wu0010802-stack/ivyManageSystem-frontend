<script setup lang="ts">
/**
 * EmployeeSummaryDrawer — 考核簽核階段統一員工明細抽屜（Batch 13）
 *
 * UX 規格 §3.4 五區塊順序：①結果摘要 ②自動衍生證據 ③人工調整 ④計算軌跡
 * ⑤異動紀錄。③人工調整刻意不做（需新 schema/API + 產品裁定，另外排程），
 * 本殼順序為 ①②④⑤，不畫佔位符。
 */
import { ref, computed, onMounted, watch } from 'vue'
import { listAppraisalBonusRates } from '@/api/appraisal'
import { gradeLabel } from '@/constants/appraisalYearEnd'
import { todayISO } from '@/utils/format'
import AggregatedStatusContent from './AggregatedStatusContent.vue'
import SummaryLogTimeline from './SummaryLogTimeline.vue'
import { resolveBonusRate, NO_BONUS_GRADES, type BonusRateRow } from '../bonusRateResolver'

interface Participant { employee_name?: string; role_group?: string; [key: string]: unknown }
interface Summary { id: number; base_score?: number; event_score_sum?: number; total_score?: number; grade?: string; bonus_amount?: number; status?: string; [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  participant?: Participant | null
  summary?: Summary | null
  rules?: Record<string, unknown>
  cycleId?: number | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const drawerVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

// summary 型別以 index signature 收容任意額外欄位，employee_name 在此非既有具名
// 屬性、型別退化為 unknown，需顯式收斂回 string 才能餵給 el-drawer 的 title prop。
const title = computed(() => props.participant?.employee_name || (props.summary?.employee_name as string | undefined) || '員工明細')

// ── ④計算軌跡：基準額查表（僅在抽屜開啟且有 summary 時載入，避免不必要的
// 網路請求；rates 抽屜生命週期內快取一次，不隨每次開關重撈） ──
const bonusRates = ref<BonusRateRow[]>([])
const bonusRatesLoaded = ref(false)
async function loadBonusRatesOnce() {
  if (bonusRatesLoaded.value) return
  try {
    const { data } = await listAppraisalBonusRates()
    bonusRates.value = data as BonusRateRow[]
  } catch {
    bonusRates.value = []
  } finally {
    bonusRatesLoaded.value = true
  }
}
watch(() => props.visible, (v) => { if (v) loadBonusRatesOnce() })
onMounted(() => { if (props.visible) loadBonusRatesOnce() })

const bonusMatch = computed(() => {
  const s = props.summary
  if (!s?.grade || !props.participant?.role_group || NO_BONUS_GRADES.has(s.grade)) return null
  // 查表基準日：沿用「本期基準分計算日」語意最接近的既有欄位——summary 本身
  // 無獨立日期欄位，抽屜殼只在 CycleDetailPanel.vue 場景使用，該處 cycle 已知
  // base_score_calc_date；由父層一併傳入較準確，但為避免這裡耦合 Cycle 型別，
  // 改用「總分/等第已定案」的既有事實：只要 grade 非無獎金等第即嘗試查表，
  // 查無則優雅顯示「查無對應獎金率」（見下方 template），不阻斷其餘區塊顯示。
  return resolveBonusRate(bonusRates.value, props.participant.role_group, s.grade, todayISO())
})
</script>

<template>
  <el-drawer v-model="drawerVisible" :title="title" size="50%" data-test="employee-summary-drawer">
    <div v-if="participant || summary" class="esd-body">
      <!-- ①結果摘要 -->
      <section class="esd-section" data-test="esd-section-summary">
        <h3 class="esd-section__title">結果摘要</h3>
        <el-descriptions v-if="summary" :column="2" border size="small">
          <el-descriptions-item label="總分">{{ Number(summary.total_score ?? 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="等第">{{ gradeLabel(summary.grade ?? '') }}</el-descriptions-item>
          <el-descriptions-item label="獎金">{{ Number(summary.bonus_amount ?? 0).toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="狀態">{{ summary.status }}</el-descriptions-item>
        </el-descriptions>
        <el-empty v-else description="尚無總結資料" :image-size="60" />
      </section>

      <el-divider />

      <!-- ②自動衍生證據 -->
      <section class="esd-section" data-test="esd-section-evidence">
        <h3 class="esd-section__title">自動衍生證據</h3>
        <AggregatedStatusContent :participant="participant" :rules="rules" />
      </section>

      <el-divider />

      <!-- ④計算軌跡 -->
      <section class="esd-section" data-test="esd-section-trail">
        <h3 class="esd-section__title">計算軌跡</h3>
        <el-steps v-if="summary" direction="vertical" :active="5" finish-status="success">
          <el-step title="基本分" :description="Number(summary.base_score ?? 0).toFixed(2)" />
          <el-step title="加減分事件加總" :description="`${Number(summary.event_score_sum ?? 0) >= 0 ? '+' : ''}${Number(summary.event_score_sum ?? 0).toFixed(2)}`" />
          <el-step title="總分" :description="Number(summary.total_score ?? 0).toFixed(2)" />
          <el-step title="等第" :description="gradeLabel(summary.grade ?? '')" />
          <el-step
            title="獎金"
            :description="
              NO_BONUS_GRADES.has(summary.grade ?? '')
                ? '此等第無獎金'
                : bonusMatch
                  ? `基準額 ${bonusMatch.baseAmount.toLocaleString()} × (${Number(summary.total_score ?? 0).toFixed(2)} / 100) = ${Number(summary.bonus_amount ?? 0).toLocaleString()}`
                  : '查無對應獎金率'
            "
          />
        </el-steps>
        <el-empty v-else description="尚無總結資料" :image-size="60" />
      </section>

      <el-divider />

      <!-- ⑤異動紀錄 -->
      <section class="esd-section" data-test="esd-section-log">
        <h3 class="esd-section__title">異動紀錄</h3>
        <SummaryLogTimeline :summary-id="summary?.id ?? null" />
      </section>
    </div>
    <el-empty v-else description="找不到明細資料" />
  </el-drawer>
</template>

<style scoped>
.esd-body { display: flex; flex-direction: column; gap: var(--space-2); }
.esd-section__title { margin: 0 0 var(--space-2); font-size: 15px; font-weight: 600; }
</style>
