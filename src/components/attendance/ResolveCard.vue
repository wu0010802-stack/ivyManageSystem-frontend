<template>
  <div class="resolve-card">
    <!-- 標頭 -->
    <div class="resolve-card__header">
      <div class="resolve-card__title-row">
        <span class="resolve-card__name">{{ item.employee_name }}</span>
        <span class="resolve-card__separator">·</span>
        <span class="resolve-card__date">{{ item.date }}（{{ item.weekday }}）</span>
        <el-tag
          v-for="(entry, i) in item.items"
          :key="`${item.id}-${entry.type}-${i}`"
          :type="tagTypeOf(entry)"
          size="small"
          class="resolve-card__type-tag"
        >
          {{ entry.type_label }}
        </el-tag>
      </div>
      <div class="resolve-card__nav">
        <span class="resolve-card__counter">第 {{ index + 1 }} / {{ total }} 筆</span>
        <el-button
          size="small"
          :disabled="index <= 0"
          @click="emit('navigate', -1)"
        >◀</el-button>
        <el-button
          size="small"
          :disabled="index >= total - 1"
          @click="emit('navigate', 1)"
        >▶</el-button>
      </div>
    </div>

    <!-- 當日異常明細（一天一張卡：列出全部異常） -->
    <ul class="resolve-card__entries">
      <li v-for="(entry, i) in item.items" :key="`d-${item.id}-${i}`" class="resolve-card__entry">
        <span class="resolve-card__entry-detail">{{ entry.detail }}</span>
        <span
          v-if="entry.estimated_deduction != null && entry.estimated_deduction > 0"
          class="resolve-card__deduction--negative"
        >
          -NT${{ entry.estimated_deduction.toLocaleString() }}
        </span>
      </li>
    </ul>

    <!-- 脈絡卡 -->
    <div class="resolve-card__context">
      <div class="resolve-card__row">
        <span class="resolve-card__label">上班時間</span>
        <el-time-picker
          v-if="context.punch_in === null"
          v-model="localPunchIn"
          format="HH:mm"
          value-format="HH:mm"
          placeholder="補填上班時間"
          class="resolve-card__time-picker"
        />
        <span v-else class="resolve-card__value">{{ context.punch_in }}</span>
      </div>
      <div class="resolve-card__row">
        <span class="resolve-card__label">下班時間</span>
        <el-time-picker
          v-if="context.punch_out === null"
          v-model="localPunchOut"
          format="HH:mm"
          value-format="HH:mm"
          placeholder="補填下班時間"
          class="resolve-card__time-picker"
        />
        <span v-else class="resolve-card__value">{{ context.punch_out }}</span>
      </div>
      <div v-if="context.has_leave" class="resolve-card__row">
        <span class="resolve-card__leave-badge">當日有請假</span>
      </div>
      <div v-if="context.estimated_deduction > 0" class="resolve-card__row">
        <span class="resolve-card__label">預估扣款</span>
        <span class="resolve-card__deduction--negative">
          -NT${{ context.estimated_deduction.toLocaleString() }}
        </span>
      </div>
    </div>

    <!-- 動作列 -->
    <div v-if="canWrite" class="resolve-card__actions-block">
      <p class="resolve-card__whole-day-hint">
        接受扣款／豁免會套用到<strong>整天</strong>的所有異常項目
      </p>
      <div class="resolve-card__actions">
        <el-button
          type="primary"
          :loading="busy"
          :disabled="busy || !canPunch"
          @click="handlePunch"
        >補打卡並重算</el-button>
        <el-button
          :loading="busy"
          :disabled="busy"
          @click="emit('resolve', { action: 'admin_accept' })"
        >接受扣款</el-button>
        <el-button
          :loading="busy"
          :disabled="busy"
          @click="emit('resolve', { action: 'admin_waive' })"
        >豁免</el-button>
      </div>
    </div>
    <div v-else class="resolve-card__readonly-hint">
      您無權限執行操作
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { hasPermission } from '@/utils/auth'
import type { AnomalyDayCard, AnomalyEntry } from '@/composables/useAttendanceWorkspace'

// ── props & emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  item: AnomalyDayCard
  index: number
  total: number
  context: {
    punch_in: string | null
    punch_out: string | null
    has_leave: boolean
    estimated_deduction: number
  }
  /** mutation in-flight：防重複送出 */
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'resolve', payload: { action: 'punch' | 'admin_accept' | 'admin_waive'; punch_in?: string; punch_out?: string }): void
  (e: 'navigate', delta: number): void
}>()

// ── 權限 ───────────────────────────────────────────────────────────────────────
const canWrite = computed(() => hasPermission('ATTENDANCE_WRITE'))

// ── 補卡時間 local ref（初始 = context 值）────────────────────────────────────
const localPunchIn = ref<string | null>(props.context.punch_in)
const localPunchOut = ref<string | null>(props.context.punch_out)

// 換筆後 reset（auto-advance）：context 為父層 computed，每次換筆（item 變更）
// 都會重算成新物件參考，故單一 watch(context) 已涵蓋所有換筆情境。
watch(
  () => props.context,
  (ctx) => {
    localPunchIn.value = ctx.punch_in
    localPunchOut.value = ctx.punch_out
  },
)

// ── tag 顏色 ───────────────────────────────────────────────────────────────────
function tagTypeOf(entry: AnomalyEntry): 'warning' | 'danger' {
  return entry.type === 'missing_punch' ? 'danger' : 'warning'
}

// ── 補打卡邏輯 ────────────────────────────────────────────────────────────────
// 最終上/下班時間：優先用使用者填的 local，否則用原 context 值
const effectivePunchIn = computed(() => localPunchIn.value ?? props.context.punch_in)
const effectivePunchOut = computed(() => localPunchOut.value ?? props.context.punch_out)

// 至少要填了缺的那側才能送出
const canPunch = computed(() => {
  const needIn = props.context.punch_in === null
  const needOut = props.context.punch_out === null
  if (needIn && !localPunchIn.value) return false
  if (needOut && !localPunchOut.value) return false
  return true
})

function handlePunch(): void {
  const payload: { action: 'punch'; punch_in?: string; punch_out?: string } = {
    action: 'punch',
  }
  if (effectivePunchIn.value !== null) {
    payload.punch_in = effectivePunchIn.value
  }
  if (effectivePunchOut.value !== null) {
    payload.punch_out = effectivePunchOut.value
  }
  emit('resolve', payload)
}
</script>

<style scoped>
.resolve-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-4);
}

.resolve-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.resolve-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.resolve-card__name {
  font-size: var(--text-base, 1rem);
  font-weight: 600;
  color: var(--text-primary, #1e293b);
}

.resolve-card__separator {
  color: var(--text-tertiary, #94a3b8);
}

.resolve-card__date {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-secondary, #475569);
}

.resolve-card__type-tag {
  flex-shrink: 0;
}

.resolve-card__nav {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.resolve-card__counter {
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-tertiary, #94a3b8);
  white-space: nowrap;
}

.resolve-card__entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}

.resolve-card__entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-secondary, #475569);
}

.resolve-card__context {
  background: var(--fill-color-light, #f9fafb);
  border: 1px solid var(--border-color-light, #f1f5f9);
  border-radius: var(--radius-md, 6px);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.resolve-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.resolve-card__label {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-secondary, #475569);
  width: 72px;
  flex-shrink: 0;
}

.resolve-card__value {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-primary, #1e293b);
  font-variant-numeric: tabular-nums;
}

.resolve-card__time-picker {
  flex: 1;
}

.resolve-card__leave-badge {
  font-size: var(--text-xs, 0.75rem);
  color: var(--warning, #f59e0b);
  background: var(--warning-soft, #fefce8);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--warning-border, #fde68a);
}

.resolve-card__deduction--negative {
  font-size: var(--text-sm, 0.875rem);
  color: var(--danger, #ef4444);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.resolve-card__actions-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.resolve-card__whole-day-hint {
  margin: 0;
  font-size: var(--text-xs, 0.75rem);
  color: var(--text-tertiary, #94a3b8);
}

.resolve-card__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.resolve-card__readonly-hint {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-tertiary, #94a3b8);
  padding: var(--space-2) 0;
}
</style>
