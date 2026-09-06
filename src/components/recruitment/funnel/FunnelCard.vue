<template>
  <div
    class="funnel-card"
    :class="{
      'funnel-card--pending': isPending,
      'funnel-card--disabled': !canDrag,
    }"
    :data-visit-id="card.visit_id"
    role="button"
    tabindex="0"
    @click="$emit('click')"
    @keydown.enter.space.prevent="$emit('click')"
  >
    <div class="funnel-card__header">
      <span class="funnel-card__name">{{ card.child_name }}</span>
      <span class="funnel-card__tags">
        <el-tag v-if="withdrawnLabel" size="small" type="danger">{{ withdrawnLabel }}</el-tag>
        <el-tag v-if="card.grade" size="small" type="info">{{ card.grade }}</el-tag>
        <el-tag v-if="termLabel" size="small" type="warning" class="funnel-card__term">
          {{ termLabel }}
        </el-tag>
      </span>
    </div>
    <div v-if="card.phone" class="funnel-card__phone">{{ card.phone }}</div>
    <div class="funnel-card__meta">
      <span v-if="card.district" class="funnel-card__district">{{ card.district }}</span>
      <span v-if="card.source" class="funnel-card__source">{{ card.source }}</span>
    </div>
    <div v-if="card.withdraw_reason" class="funnel-card__reason">{{ card.withdraw_reason }}</div>
    <!-- 收款對帳（2026-09-06）：招生端的預繳旗標與學費模組的預繳金是兩個真相，
         不連動。落差直接標在卡片上，否則要兩個模組對開才看得出來。 -->
    <div
      v-if="mismatchLabel"
      class="funnel-card__mismatch"
      :title="mismatchTitle"
      data-test="card-deposit-mismatch"
    >
      {{ mismatchLabel }}
    </div>
    <div v-if="card.student_id" class="student-id-badge">學號 #{{ card.student_id }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import { formatSemesterShort } from '@/utils/classHistory'
import { WITHDRAWN_FROM_LABELS } from '@/constants/recruitmentFunnel'
import type { FunnelCardData } from '@/stores/recruitmentFunnel'

type FunnelCardWithTerm = FunnelCardData

const props = defineProps<{
  card: FunnelCardWithTerm
  canDrag: boolean
  isPending?: boolean
}>()

defineEmits<{
  (e: 'click'): void
}>()

const termLabel = computed((): string | null =>
  props.card.target_school_year != null && props.card.target_semester != null
    ? formatSemesterShort(props.card.target_school_year, props.card.target_semester)
    : null,
)

const withdrawnLabel = computed((): string | null =>
  props.card.withdrawn_from
    ? (WITHDRAWN_FROM_LABELS[props.card.withdrawn_from] ?? null)
    : null,
)

/** 招生旗標與學費模組收款紀錄的落差（後端算好，見 services/recruitment_prepayment_link）。 */
const MISMATCH_LABEL: Record<string, string> = {
  flag_without_credit: '查無收款',
  credit_without_flag: '已收款未標記',
}
const MISMATCH_TITLE: Record<string, string> = {
  flag_without_credit: '這筆標記為已預繳，但學費管理查不到對應的預繳金，請確認收款是否漏登。',
  credit_without_flag: '學費管理已有這筆的預繳金，但招生狀態還停在未預繳，請把卡片推進到「已預繳」。',
}
const mismatchKey = computed(() => props.card.deposit_mismatch ?? '')
const mismatchLabel = computed(() => MISMATCH_LABEL[mismatchKey.value] ?? '')
const mismatchTitle = computed(() => MISMATCH_TITLE[mismatchKey.value] ?? '')
</script>

<style scoped>
.funnel-card {
  background: var(--surface-color);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}
.funnel-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}
.funnel-card__mismatch {
  margin-top: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--color-warning);
  background: var(--color-warning-soft);
  display: inline-block;
}
.funnel-card--pending {
  opacity: 0.5;
  pointer-events: none;
}
.funnel-card--disabled {
  cursor: not-allowed;
}
.funnel-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.funnel-card__name {
  font-weight: 600;
}
.funnel-card__tags {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.funnel-card__phone {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.funnel-card__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.funnel-card__reason { margin-top: 4px; font-size: 12px; color: #909399; }
.student-id-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 3px;
  font-size: 11px;
}
</style>
