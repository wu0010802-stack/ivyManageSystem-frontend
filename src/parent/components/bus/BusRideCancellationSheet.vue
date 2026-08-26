<script setup lang="ts">
/**
 * 家長端「今天不搭」BottomSheet（FE-PARENT-02，spec「家長端」第 1 點）。
 *
 * 純呈現元件（API 呼叫由呼叫端負責）：
 * - 選「早上不搭接車」／「下午不搭送車」／「整天」（＝拆 morning＋afternoon 兩筆）。
 * - 已有有效 cancellation 的方向顯示「已回報不搭」；該站 departed 前可撤銷
 *   （revocable=false 時隱藏撤銷鈕），撤銷後可再申請。
 * - results＝「整天」拆兩筆後的**分筆**結果：部分成功時逐方向明示
 *   （例：早上已完成接車，僅取消下午送車——訊息文字由後端帶出）。
 *
 * 家長端規範：不用 Element Plus，以 parent 樹既有 ParentBottomSheet／
 * ConfirmDialog／StatusPill 組合。
 */
import { computed, ref, watch } from 'vue'
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'
import ConfirmDialog from '@/parent/components/ConfirmDialog.vue'
import StatusPill from '@/parent/components/StatusPill.vue'

type BusDirection = 'morning' | 'afternoon'

const props = defineProps<{
  visible: boolean
  childName: string
  activeCancellations: Array<{ id: number; direction: BusDirection; revocable: boolean }>
  submitting: boolean
  results: Array<{ direction: BusDirection; ok: boolean; message: string }> | null
}>()

const emit = defineEmits<{
  submit: [directions: BusDirection[]]
  revoke: [cancellationId: number]
  close: []
}>()

const DIRECTION_LABELS: Record<BusDirection, string> = {
  morning: '早上接車',
  afternoon: '下午送車',
}
const OPTION_LABELS: Record<BusDirection, string> = {
  morning: '早上不搭接車',
  afternoon: '下午不搭送車',
}

const selected = ref<Set<BusDirection>>(new Set())
const confirmOpen = ref(false)

const activeByDirection = computed(() => {
  const map = new Map<BusDirection, { id: number; revocable: boolean }>()
  for (const c of props.activeCancellations) {
    map.set(c.direction, { id: c.id, revocable: c.revocable })
  }
  return map
})

const availableDirections = computed<BusDirection[]>(() =>
  (['morning', 'afternoon'] as const).filter((d) => !activeByDirection.value.has(d)),
)

const selectedList = computed<BusDirection[]>(() =>
  (['morning', 'afternoon'] as const).filter((d) => selected.value.has(d)),
)

// sheet 重新打開時清掉上一輪選取
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      selected.value = new Set()
      confirmOpen.value = false
    }
  },
)

function toggle(direction: BusDirection): void {
  const next = new Set(selected.value)
  if (next.has(direction)) next.delete(direction)
  else next.add(direction)
  selected.value = next
}

/** 整天＝兩個尚可申請的方向全選（拆兩筆由呼叫端／後端處理） */
function selectWholeDay(): void {
  selected.value = new Set(availableDirections.value)
}

const confirmMessage = computed(() => {
  const parts = selectedList.value.map((d) => OPTION_LABELS[d])
  return `確定回報 ${props.childName} 今天${parts.join('、')}嗎？該站出發前都可以撤銷。`
})

function onConfirmSubmit(): void {
  confirmOpen.value = false
  emit('submit', selectedList.value)
}
</script>

<template>
  <ParentBottomSheet
    :model-value="visible"
    :title="`${childName}：今天不搭娃娃車`"
    @update:model-value="(v: boolean) => { if (!v) emit('close') }"
    @close="emit('close')"
  >
    <!-- 分筆結果（「整天」拆兩筆；部分成功逐方向明示） -->
    <ul v-if="results" class="ride-cancel__results" data-test="results">
      <li
        v-for="r in results"
        :key="r.direction"
        class="ride-cancel__result"
        :data-test="`result-${r.direction}`"
      >
        <StatusPill
          :label="DIRECTION_LABELS[r.direction]"
          :tone="r.ok ? 'ok' : 'danger'"
        />
        <span class="ride-cancel__result-msg">{{ r.message }}</span>
      </li>
    </ul>

    <template v-else>
      <div
        v-for="direction in (['morning', 'afternoon'] as const)"
        :key="direction"
        class="ride-cancel__row"
        :data-test="`row-${direction}`"
      >
        <template v-if="activeByDirection.has(direction)">
          <StatusPill :label="`${DIRECTION_LABELS[direction]}：已回報不搭`" tone="warn" />
          <button
            v-if="activeByDirection.get(direction)!.revocable"
            type="button"
            class="ride-cancel__revoke"
            :disabled="submitting"
            :data-test="`revoke-${direction}`"
            @click="emit('revoke', activeByDirection.get(direction)!.id)"
          >
            撤銷
          </button>
        </template>
        <label v-else class="ride-cancel__option">
          <input
            type="checkbox"
            :checked="selected.has(direction)"
            :disabled="submitting"
            :data-test="`option-${direction}`"
            @change="toggle(direction)"
          >
          {{ OPTION_LABELS[direction] }}
        </label>
      </div>

      <button
        v-if="availableDirections.length > 1"
        type="button"
        class="ride-cancel__whole-day"
        :disabled="submitting"
        data-test="whole-day-btn"
        @click="selectWholeDay"
      >
        整天都不搭（接車＋送車）
      </button>

      <button
        type="button"
        class="ride-cancel__submit"
        :disabled="submitting || selectedList.length === 0"
        data-test="submit-btn"
        @click="confirmOpen = true"
      >
        {{ submitting ? '回報中…' : '回報不搭' }}
      </button>
    </template>

    <ConfirmDialog
      :open="confirmOpen"
      title="確認回報不搭"
      :message="confirmMessage"
      confirm-label="確定回報"
      @confirm="onConfirmSubmit"
      @cancel="confirmOpen = false"
      @update:open="(v: boolean) => (confirmOpen = v)"
    />
  </ParentBottomSheet>
</template>

<style scoped>
.ride-cancel__results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ride-cancel__result {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ride-cancel__result-msg {
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-soft, #64748b);
}

.ride-cancel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}

.ride-cancel__option {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-md, 15px);
}

.ride-cancel__revoke {
  border: 1px solid var(--pt-border, #dbe3ea);
  background: transparent;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-soft, #64748b);
}

.ride-cancel__whole-day {
  width: 100%;
  margin-top: 4px;
  border: 1px dashed var(--pt-border, #dbe3ea);
  background: transparent;
  border-radius: 10px;
  padding: 10px;
  font-size: var(--text-sm, 13px);
}

.ride-cancel__submit {
  width: 100%;
  margin-top: 12px;
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: var(--text-md, 15px);
  font-weight: 700;
  color: #fff;
  background: var(--pt-primary, #2d6f8e);
}

.ride-cancel__submit:disabled {
  opacity: 0.5;
}
</style>
