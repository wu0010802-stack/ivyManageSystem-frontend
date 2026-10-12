<template>
  <!-- 一年只用一次的流程：把「還差什麼才能發布」攤成三步，每步附上能直接處理的動作 -->
  <ol class="plan-next-steps" aria-label="完成編班的步驟">
    <li class="next-step" :class="stepClass(assignStep)">
      <span class="step-marker" aria-hidden="true">
        <el-icon v-if="assignStep === 'done'"><Check /></el-icon>
        <template v-else>1</template>
      </span>
      <div class="step-body">
        <span class="step-title">分班</span>
        <span class="step-status">{{ assignStatus }}</span>
      </div>
      <el-button
        v-if="unassignedCount > 0"
        link
        type="primary"
        class="btn-show-unassigned"
        @click="emit('show-unassigned')"
      >查看</el-button>
    </li>

    <li class="next-step" :class="stepClass(teacherStep)">
      <span class="step-marker" aria-hidden="true">
        <el-icon v-if="teacherStep === 'done'"><Check /></el-icon>
        <template v-else>2</template>
      </span>
      <div class="step-body">
        <span class="step-title">指派老師</span>
        <span class="step-status">{{ teacherStatus }}</span>
        <span v-if="teacherSub" class="step-sub">{{ teacherSub }}</span>
      </div>
      <el-button
        v-if="canEdit && carryOverSlots > 0"
        size="small"
        class="btn-carry-over"
        :disabled="busy"
        @click="emit('carry-over')"
      >沿用原班老師（{{ carryOverSlots }}）</el-button>
    </li>

    <li class="next-step" :class="stepClass(publishStep)">
      <span class="step-marker" aria-hidden="true">
        <el-icon v-if="publishStep === 'done'"><Check /></el-icon>
        <template v-else>3</template>
      </span>
      <div class="step-body">
        <span class="step-title">發布</span>
        <span class="step-status">{{ publishStatus }}</span>
        <span class="step-sub">{{ applyText }}</span>
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@element-plus/icons-vue'
import { formatPlanDate } from './planHelpers'

type StepState = 'done' | 'blocking' | 'pending'

const props = withDefaults(defineProps<{
  unassignedCount: number
  /** 草稿班級數；0 班時老師步驟是「還沒有班級」而非空集合的「都已指派」 */
  classCount: number
  emptyTeacherSlots: { head: number; assistant: number; art: number }
  /** 原班有老師、目前空著的格子數（可一鍵沿用） */
  carryOverSlots: number
  blockingCount: number
  canEdit: boolean
  applyDate?: string | null
  appliesImmediately?: boolean
  busy?: boolean
}>(), {
  applyDate: null,
  appliesImmediately: false,
  busy: false,
})

const emit = defineEmits<{
  'show-unassigned': []
  'carry-over': []
}>()

const assignStep = computed<StepState>(() => (props.unassignedCount > 0 ? 'blocking' : 'done'))
const assignStatus = computed(() =>
  props.unassignedCount > 0 ? `還有 ${props.unassignedCount} 位待分班` : '全部學生都已分班',
)

const teacherStep = computed<StepState>(() => {
  const { head, assistant, art } = props.emptyTeacherSlots
  if (props.classCount === 0) return 'pending'
  if (head > 0) return 'blocking'
  return assistant + art > 0 ? 'pending' : 'done'
})
// 主句只講會擋發布的班導；副班導／美語（只是提醒）放副句，窄欄不折成三行
const otherMissing = computed(() => {
  const { assistant, art } = props.emptyTeacherSlots
  const parts: string[] = []
  if (assistant > 0) parts.push(`副班導 ${assistant} 班`)
  if (art > 0) parts.push(`美語老師 ${art} 班`)
  return parts.join('、')
})
const teacherStatus = computed(() => {
  const { head } = props.emptyTeacherSlots
  if (props.classCount === 0) return '還沒有班級'
  if (head > 0) return `${head} 班未指派班導`
  return otherMissing.value ? `${otherMissing.value}未指派` : '三位老師都已指派'
})
const teacherSub = computed(() =>
  props.emptyTeacherSlots.head > 0 && otherMissing.value ? `${otherMissing.value}也還沒指派` : '',
)

const publishStep = computed<StepState>(() => (props.blockingCount > 0 ? 'blocking' : 'done'))
const publishStatus = computed(() =>
  props.blockingCount > 0 ? `還有 ${props.blockingCount} 項阻擋，處理完才能發布` : '可以發布',
)
const applyText = computed(() => {
  if (props.appliesImmediately) return '發布後約一小時內套用到現行班級'
  const date = formatPlanDate(props.applyDate)
  return date ? `發布後 ${date} 自動套用` : '發布後於新學年開學時自動套用'
})

function stepClass(state: StepState): Record<string, boolean> {
  return { 'is-done': state === 'done', 'is-blocking': state === 'blocking', 'is-pending': state === 'pending' }
}
</script>

<style scoped>
.plan-next-steps {
  display: flex;
  margin: 0 0 var(--space-4);
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--surface-color);
}

.next-step {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-2) var(--space-4);
}

.next-step + .next-step {
  border-left: 1px solid var(--color-neutral-200);
}

.step-marker {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-bold);
  background: var(--color-neutral-100);
  color: var(--text-secondary);
}

.is-blocking .step-marker {
  background: var(--color-warning-soft);
  color: var(--color-warning-hover);
}

.is-pending .step-marker {
  background: var(--color-info-soft);
  color: var(--color-info-hover);
}

.is-done .step-marker {
  background: var(--color-success-soft);
  color: var(--color-success-hover);
}

.step-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.step-title {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.step-status {
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.is-blocking .step-status {
  color: var(--color-warning-hover);
}

.step-sub {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

@media (--to-md) {
  .plan-next-steps {
    flex-direction: column;
  }

  .next-step + .next-step {
    border-top: 1px solid var(--color-neutral-200);
    border-left: none;
  }
}
</style>
