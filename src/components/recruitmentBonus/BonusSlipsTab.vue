<template>
  <div v-loading="loading">
    <div class="slips-toolbar no-print">
      <el-button size="small" @click="printSlips">列印獎金條</el-button>
    </div>
    <div v-for="block in payableBlocks" :key="block.employee_id ?? block.employee_name" class="slip">
      <div class="slip__title">高雄市私立常春藤幼兒園──招生獎金條（{{ report?.campaign_name }}）</div>
      <div class="slip__name">{{ block.employee_name }}</div>
      <div class="slip__meta">確認 {{ block.counted_persons }} 人 × 單價 {{ formatCurrency(block.unit_price) }}</div>
      <div class="slip__students">{{ confirmedNames(block) }}</div>
      <div class="slip__formula"><code>{{ block.formula_text }}</code></div>
      <div class="slip__amount">實發 <strong>{{ formatCurrency(block.total_amount) }}</strong></div>
    </div>
    <EmptyState
      v-if="!loading && payableBlocks.length === 0"
      title="尚無可發放獎金"
      description="確認歸屬後這裡會產生每師一張獎金條"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatCurrency } from '@/utils/currency'
import { friendlyError } from '@/utils/errorMessages'
import { getCampaignReport } from '@/api/recruitmentBonus'
import type { Schema } from '@/api/_generated/typed'

type Report = Schema<'RecruitmentBonusReportOut'>
type ReportBlock = Schema<'RecruitmentBonusReportBlockOut'>

const props = defineProps<{ campaignId: number }>()
const report = ref<Report | null>(null)
const loading = ref(false)

const payableBlocks = computed(() => (report.value?.blocks || []).filter((b) => b.total_amount > 0))
const confirmedNames = (block: ReportBlock) =>
  block.rows
    .filter((r) => r.status === 'confirmed')
    .map((r) => r.child_name || `#${r.attribution_id}`)
    .join('、')
const printSlips = () => window.print()

const reload = async () => {
  loading.value = true
  try {
    report.value = (await getCampaignReport(props.campaignId)).data
  } catch (e) {
    ElMessage.error(friendlyError('載入獎金條失敗', e))
  } finally {
    loading.value = false
  }
}
onMounted(reload)
defineExpose({ reload })
</script>

<style scoped>
.slips-toolbar { display: flex; justify-content: flex-end; margin-bottom: var(--space-2); }
.slip { border: 1px dashed var(--el-border-color); border-radius: 4px; padding: var(--space-3); margin-bottom: var(--space-3); }
.slip__title { font-size: 13px; color: var(--el-text-color-secondary); }
.slip__name { font-size: 16px; font-weight: 700; margin: var(--space-1) 0; }
.slip__meta, .slip__students { font-size: 13px; margin-bottom: var(--space-1); }
.slip__formula { font-size: 12px; color: var(--el-text-color-secondary); }
.slip__amount { text-align: right; font-size: 15px; }
@media print {
  .no-print { display: none; }
  .slip { page-break-inside: avoid; border-color: #000; }
}
</style>
