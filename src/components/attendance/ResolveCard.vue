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
      <div v-if="showNav" class="resolve-card__nav">
        <span class="resolve-card__counter">第 {{ index + 1 }} / {{ total }} 筆</span>
        <el-button
          size="small"
          :icon="ArrowLeft"
          :disabled="index <= 0"
          data-test="resolve-prev"
          @click="emit('navigate', -1)"
        >上一筆</el-button>
        <el-button
          size="small"
          :disabled="index >= total - 1"
          data-test="resolve-next"
          @click="emit('navigate', 1)"
        >下一筆<el-icon class="el-icon--right"><ArrowRight /></el-icon></el-button>
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
      <!-- 打卡紀錄還沒到或載入失敗：不知道有沒有打卡，不能當成缺卡叫人兩側都補（會整列覆寫真實打卡） -->
      <div v-if="recordsState !== 'loaded'" class="resolve-card__row" data-test="resolve-records-state">
        <span class="resolve-card__value">{{ recordsState === 'failed' ? '打卡紀錄載入失敗，無法補卡；接受扣款／豁免不受影響。' : '打卡紀錄載入中…' }}</span>
        <el-button v-if="recordsState === 'failed'" size="small" @click="emit('retry')">重試</el-button>
      </div>
      <template v-else>
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
      </template>
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
      <p v-if="allows('admin_accept') || allows('admin_waive')" class="resolve-card__whole-day-hint" data-test="resolve-whole-day-hint">
        <template v-if="missingOnly">缺卡不扣薪，但會記入本月缺卡次數；豁免＝不記入。會套用到<strong>整天</strong>。</template>
        <template v-else>{{ acceptLabel }}／豁免會套用到<strong>整天</strong>的所有異常項目</template>
      </p>
      <div class="resolve-card__actions">
        <el-button
          v-if="allows('punch')"
          :type="primaryAction ? 'primary' : 'default'"
          :loading="busy"
          :disabled="busy || !canPunch || recordsState !== 'loaded'"
          @click="handlePunch"
        >補打卡並重算</el-button>
        <el-button
          v-if="allows('admin_accept')"
          :loading="busy"
          :disabled="busy"
          data-test="resolve-accept"
          @click="handleAccept"
        >{{ acceptLabel }}</el-button>
        <el-button
          v-if="allows('admin_waive')"
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
import { ElMessageBox } from 'element-plus'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'
import type { AnomalyDayCard, AnomalyEntry } from '@/composables/useAttendanceWorkspace'

// ── props & emits ──────────────────────────────────────────────────────────────
type ResolveAction = 'punch' | 'admin_accept' | 'admin_waive'

const props = withDefaults(defineProps<{
  item: AnomalyDayCard
  index: number
  total: number
  context: {
    punch_in: string | null
    punch_out: string | null
    has_leave: boolean
    estimated_deduction: number
    /** 打卡紀錄載入狀態；未給＝已載入（例如抽屜直接用格子資料） */
    records?: 'loading' | 'loaded' | 'failed'
  }
  /** mutation in-flight：防重複送出 */
  busy?: boolean
  /** 「第 N / M 筆」與上下筆；嵌在排班與出勤抽屜（只有一天）時關掉 */
  showNav?: boolean
  /** 允許的動作；沒有出勤紀錄列（疑似缺勤）只能補卡，疑似換班兩側都有打卡不必補卡 */
  actions?: readonly ResolveAction[]
  /** 補打卡是否為主要按鈕；同一畫面另有主要動作時傳 false */
  primaryAction?: boolean
  /**
   * 這天符合該員工整月的固定型態（多半是設定問題）時的提醒文字：按「接受扣款」前先問一次，
   * 免得照錯的應上班時段逐格扣薪。null／未給＝直接送出。
   */
  acceptWarning?: string | null
}>(), {
  busy: false,
  showNav: true,
  actions: () => ['punch', 'admin_accept', 'admin_waive'],
  primaryAction: true,
  acceptWarning: null,
})

const allows = (action: ResolveAction) => props.actions.includes(action)

const emit = defineEmits<{
  (e: 'resolve', payload: { action: 'punch' | 'admin_accept' | 'admin_waive'; punch_in?: string; punch_out?: string; doneText?: string }): void
  (e: 'navigate', delta: number): void
  /** 打卡紀錄載入失敗後重試 */
  (e: 'retry'): void
}>()

const recordsState = computed(() => props.context.records ?? 'loaded')

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

// ── 接受扣款 ───────────────────────────────────────────────────────────────────
/**
 * 整天只有缺卡（後端明細寫「不扣款，僅記錄」）：薪資不扣，但「接受」會記入缺卡次數、豁免不記入。
 * 按鈕不能寫「接受扣款」，否則和明細自相矛盾。
 */
const missingOnly = computed(() => props.item.items.length > 0 && props.item.items.every((entry) => entry.type === 'missing_punch'))
const acceptLabel = computed(() => (missingOnly.value ? '確認缺卡' : '接受扣款'))

async function handleAccept(): Promise<void> {
  if (props.acceptWarning) {
    try {
      await ElMessageBox.confirm(props.acceptWarning, '可能是設定問題', {
        confirmButtonText: `仍要${acceptLabel.value}`,
        cancelButtonText: '先不要',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  emit('resolve', missingOnly.value ? { action: 'admin_accept', doneText: '已確認缺卡' } : { action: 'admin_accept' })
}

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
  if (recordsState.value !== 'loaded') return false
  const needIn = props.context.punch_in === null
  const needOut = props.context.punch_out === null
  if (needIn && !localPunchIn.value) return false
  if (needOut && !localPunchOut.value) return false
  return true
})

/** 缺的那側已填了時間還沒送出：外層（排班與出勤抽屜）關閉或換筆前要先問 */
function isDirty(): boolean {
  if (recordsState.value !== 'loaded') return false
  return (props.context.punch_in === null && !!localPunchIn.value) || (props.context.punch_out === null && !!localPunchOut.value)
}
defineExpose({ isDirty })

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
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.resolve-card__separator {
  color: var(--text-tertiary);
}

.resolve-card__date {
  font-size: var(--text-sm);
  color: var(--text-secondary);
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
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

.resolve-card__entries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.resolve-card__entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.resolve-card__context {
  background: var(--el-fill-color-light);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
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
  font-size: var(--text-sm);
  color: var(--text-secondary);
  width: 72px;
  flex-shrink: 0;
}

.resolve-card__value {
  font-size: var(--text-sm);
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.resolve-card__time-picker {
  flex: 1;
}

.resolve-card__leave-badge {
  font-size: var(--text-xs);
  color: var(--color-warning-darker);
  background: var(--el-color-warning-light-9);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--el-color-warning-light-5);
}

.resolve-card__deduction--negative {
  font-size: var(--text-sm);
  color: var(--color-danger-darker);
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
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.resolve-card__actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.resolve-card__readonly-hint {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  padding: var(--space-2) 0;
}
</style>
