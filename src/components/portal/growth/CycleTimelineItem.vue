<script setup lang="ts">
import { ref } from 'vue'
import { gradeStyle, cycleLabel } from '@/composables/usePortalAppraisal'
import ItemRadarChart from './ItemRadarChart.vue'
import ScoreItemsTable from './ScoreItemsTable.vue'

// ItemRadarChart / ScoreItemsTable 的 `items` prop 為寬鬆 index-signature 型別（兩元件
// 未收在本批型別化範圍內）；後端 MyScoreItemOut 是具名 schema 型別，於指派 detail 時橋接。
interface ScoreItem { label?: string; sign?: string; score_delta?: number | string; raw_value?: unknown; note?: string | null; [key: string]: unknown }

interface AppraisalCycle {
  cycle_id?: number | string
  academic_year?: number | string
  semester?: number | string
  is_visible?: boolean
  is_excluded?: boolean
  is_rejected?: boolean
  exclude_reason?: string
  summary_status?: string
  total_score?: number | string
  grade?: string
  [key: string]: unknown
}

interface CycleDetail {
  score_items: ScoreItem[]
  [key: string]: unknown
}

const props = defineProps<{
  item: AppraisalCycle
  // 上游 PortalGrowthView.vue 把 usePortalAppraisal().fetchDetail 用 `as unknown as`
  // 橋接成 Promise<unknown>（該檔不在本批型別化範圍內，維持既有介面避免跨檔漂移）；
  // 本元件內部再依實際回應形狀（AxiosResponse<MyAppraisalDetailOut>）窄化。
  fetchDetail: (cycleId: number | string) => Promise<unknown>
}>()

const expanded = ref(false)
const detail = ref<CycleDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const label = `${cycleLabel(props.item.academic_year ?? '', String(props.item.semester ?? ''))}`

const toggle = async () => {
  // 未 FINALIZED 不可展開
  if (!props.item.is_visible) return
  expanded.value = !expanded.value
  if (expanded.value && !detail.value) {
    loading.value = true
    try {
      if (props.item.cycle_id == null) return
      const resp = await props.fetchDetail(props.item.cycle_id)
      const body = (resp as { data?: CycleDetail } | null | undefined)?.data
      detail.value = body ?? (resp as CycleDetail)
    } catch (e: unknown) {
      const axErr = e as { response?: { data?: { detail?: string } } }
      error.value = axErr?.response?.data?.detail || '載入失敗'
    } finally {
      loading.value = false
    }
  }
}

const statusLabel = (item: AppraisalCycle) => {
  if (item.is_excluded) return `未列入考核（${item.exclude_reason || ''}）`
  if (item.is_rejected) return '考核退簽中'
  if (item.is_visible) return '已核定'
  if (item.summary_status) return '考核進行中'
  return '尚未開始'
}
</script>

<template>
  <article class="timeline-item" :class="{ expanded }">
    <button class="row" :disabled="!item.is_visible" @click="toggle">
      <span class="label">{{ label }}</span>
      <span v-if="item.is_visible" class="score">{{ item.total_score }}</span>
      <span
        v-if="item.is_visible"
        class="grade-chip"
        :style="{ background: gradeStyle(item.grade ?? '').color }"
      >{{ gradeStyle(item.grade ?? '').label }}</span>
      <span v-else class="status-chip">{{ statusLabel(item) }}</span>
      <span class="chevron" :class="{ open: expanded }">▸</span>
    </button>
    <div v-if="expanded && item.is_visible" class="detail">
      <div v-if="loading" class="loading">載入中…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else-if="detail">
        <ItemRadarChart :items="detail.score_items" />
        <ScoreItemsTable :items="detail.score_items" />
      </template>
    </div>
  </article>
</template>

<style scoped>
.timeline-item {
  background: var(--surface-card, #fff);
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-2, 8px);
}
.row {
  width: 100%;
  display: grid;
  grid-template-columns: 80px 60px auto 1fr 24px;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  align-items: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.row:disabled { cursor: default; opacity: 0.7; }
.label { font-weight: 600; color: var(--pt-text-strong, #111); }
.score { font-size: 1.2rem; font-weight: 700; }
.grade-chip {
  padding: 2px 10px;
  border-radius: 999px;
  color: #fff;
  font-size: 0.85rem;
}
.status-chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--neutral-100, #f1f5f9);
  color: var(--pt-text-muted, #6b7280);
  font-size: 0.85rem;
}
.chevron {
  transition: transform 0.2s;
  color: var(--pt-text-muted, #6b7280);
}
.chevron.open { transform: rotate(90deg); }
.detail {
  padding: 0 var(--space-4, 16px) var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.loading, .error {
  padding: var(--space-3, 12px);
  color: var(--pt-text-muted, #6b7280);
}
.error { color: #b91c1c; }
</style>
