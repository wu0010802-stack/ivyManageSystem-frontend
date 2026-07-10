<script setup lang="ts">
import { computed } from 'vue'
import { SIGN_STATUS_ORDER, SIGN_STATUS_LABEL, SIGN_STATUS_TAG } from '@/constants/appraisalYearEnd'

const props = defineProps<{ counts: Record<string, number> }>()

const segments = computed(() =>
  SIGN_STATUS_ORDER.map((status) => ({ status, label: SIGN_STATUS_LABEL[status], type: SIGN_STATUS_TAG[status], count: props.counts[status] ?? 0 })),
)
const total = computed(() => segments.value.reduce((s, x) => s + x.count, 0))
const pct = (n: number) => (total.value ? (n / total.value) * 100 : 0)
</script>

<template>
  <div class="sign-progress">
    <template v-if="total > 0">
      <div class="sign-progress__bar" role="img" :aria-label="`已核定 ${counts.FINALIZED ?? 0} / 共 ${total}`">
        <div
          v-for="s in segments.filter((x) => x.count > 0)"
          :key="s.status"
          class="sign-progress__seg"
          :class="`sign-progress__seg--${s.type}`"
          :data-status="s.status"
          :style="{ width: `${pct(s.count)}%` }"
        />
      </div>
      <div class="sign-progress__legend">
        <span v-for="s in segments" :key="s.status" class="sign-progress__item">
          <i class="sign-progress__dot" :class="`sign-progress__seg--${s.type}`" />{{ s.label }} {{ s.count }}
        </span>
        <span class="sign-progress__total">已核定 {{ counts.FINALIZED ?? 0 }} / 共 {{ total }}</span>
      </div>
    </template>
    <span v-else class="sign-progress__empty">尚無簽核資料</span>
  </div>
</template>

<style scoped>
.sign-progress__bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--el-fill-color-light); }
.sign-progress__seg--info { background: var(--el-color-info); }
.sign-progress__seg--warning { background: var(--el-color-warning); }
.sign-progress__seg--primary { background: var(--el-color-primary); }
.sign-progress__seg--success { background: var(--el-color-success); }
.sign-progress__legend { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-2); font-size: var(--text-sm); color: var(--text-secondary); }
.sign-progress__dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
.sign-progress__total { margin-left: auto; font-weight: 600; color: var(--text-primary); }
.sign-progress__empty { font-size: var(--text-sm); color: var(--text-tertiary); }
</style>
