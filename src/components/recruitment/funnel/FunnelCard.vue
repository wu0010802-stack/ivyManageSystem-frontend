<template>
  <div
    class="funnel-card"
    :class="{
      'funnel-card--pending': isPending,
      'funnel-card--disabled': !canDrag,
    }"
    :data-visit-id="card.visit_id"
    @click="$emit('click')"
  >
    <div class="funnel-card__header">
      <span class="funnel-card__name">{{ card.child_name }}</span>
      <span class="funnel-card__tags">
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
    <div v-if="card.student_id" class="student-id-badge">學號 #{{ card.student_id }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElTag } from 'element-plus'
import { formatSemesterShort } from '@/utils/classHistory'
import type { FunnelCardData } from '@/stores/recruitmentFunnel'

// TODO(codegen): schema.d.ts regen 後 FunnelCardData 會自帶 target_semester，屆時此擴充成為冗餘可移除
type FunnelCardWithTerm = FunnelCardData & { target_semester?: number | null }

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
</script>

<style scoped>
.funnel-card {
  background: #fff;
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
  color: #666;
  margin-top: 4px;
}
.funnel-card__meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: #999;
}
.student-id-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 6px;
  background: #ecf5ff;
  color: #1989fa;
  border-radius: 3px;
  font-size: 11px;
}
</style>
