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
        <span v-if="carryOverBlocked" class="step-sub carry-over-note">原班老師已停用、預定離職或在其他班帶班，沒有可沿用的</span>
      </div>
      <div class="step-actions">
        <el-button
          v-if="showTeacherLink && classCount > 0"
          link
          type="primary"
          class="btn-show-teachers"
          @click="emit('show-teachers')"
        >去指派</el-button>
        <el-button
          v-if="canEdit && (carryOverSlots > 0 || carryOverBlocked)"
          size="small"
          class="btn-carry-over"
          :disabled="busy || carryOverSlots === 0"
          @click="emit('carry-over')"
        >沿用原班老師（{{ carryOverSlots }}）</el-button>
      </div>
    </li>

    <li class="next-step" :class="stepClass(publishStep)">
      <span class="step-marker" aria-hidden="true">
        <el-icon v-if="publishStep === 'done'"><Check /></el-icon>
        <template v-else>3</template>
      </span>
      <div class="step-body">
        <span class="step-title">發布</span>
        <span class="step-status">{{ publishStatus }}</span>
        <span class="step-sub" :class="{ 'is-danger': !schedulerEnabled }">{{ applyText }}</span>
        <span
          v-if="retainDeadline"
          class="step-sub retain-deadline"
          :class="`is-${retainDeadline.tone}`"
        >{{ retainDeadline.text }}</span>
      </div>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@element-plus/icons-vue'
import {
  GRADUATION_CATCHUP_DAYS,
  addDaysISO,
  daysBetweenISO,
  formatPlanDate,
  retainRiskPhase,
} from './planHelpers'

type StepState = 'done' | 'blocking' | 'pending'

const props = withDefaults(defineProps<{
  unassignedCount: number
  /** 草稿班級數；0 班時老師步驟是「還沒有班級」而非空集合的「都已指派」 */
  classCount: number
  emptyTeacherSlots: { head: number; assistant: number; art: number }
  /** 按下「沿用原班老師」實際會填入的格數（後端 carry_over_available） */
  carryOverSlots: number
  /** 空著且原班有老師的格數（含停用、預定離職、他班已占用而無法沿用的） */
  carryOverCandidates?: number
  blockingCount: number
  canEdit: boolean
  applyDate?: string | null
  appliesImmediately?: boolean
  busy?: boolean
  /** 編班表不在「老師指派」檢視時顯示「去指派」 */
  showTeacherLink?: boolean
  /** 排程（自動產生／套用）是否啟用；關閉時不寫「自動套用」 */
  schedulerEnabled?: boolean
  /** 今天（'YYYY-MM-DD'，台北）；空字串＝不算剩幾天 */
  today?: string
  /** 畢業年級留級生人數（後端 status.retain_pending_count）：草稿沒發布，畢業日一到會被畢業 */
  retainPendingCount?: number
  graduationDate?: string | null
  /** 畢業年級名稱（例如「大班」）；判斷不出來時寫「畢業年級」 */
  graduationGradeName?: string | null
  /** 自動畢業是否開啟（status.auto_graduation_enabled）；關閉時留級生沒有畢業日風險 */
  autoGraduationEnabled?: boolean
}>(), {
  applyDate: null,
  appliesImmediately: false,
  busy: false,
  showTeacherLink: false,
  schedulerEnabled: true,
  today: '',
  retainPendingCount: 0,
  graduationDate: null,
  graduationGradeName: null,
  carryOverCandidates: 0,
  autoGraduationEnabled: true,
})

const emit = defineEmits<{
  'show-unassigned': []
  'carry-over': []
  'show-teachers': []
}>()

const assignStep = computed<StepState>(() => (props.unassignedCount > 0 ? 'blocking' : 'done'))
const assignStatus = computed(() =>
  props.unassignedCount > 0 ? `還有 ${props.unassignedCount} 位待分班` : '全部學生都已分班',
)

// 原班有老師但一個都沒辦法沿用：按鈕留著但停用，並講原因（不然使用者以為功能壞了）
const carryOverBlocked = computed(() => props.carryOverSlots === 0 && props.carryOverCandidates > 0)

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
  if (!props.schedulerEnabled) return '自動套用未啟用：發布後不會自動套用，請聯絡系統管理員開啟'
  if (props.appliesImmediately) return '發布後約一小時內套用到現行班級'
  const date = formatPlanDate(props.applyDate)
  if (!date) return '發布後於新學年開學時自動套用'
  if (!props.today || !props.applyDate) return `發布後 ${date} 自動套用`
  return `請在 ${date} 前發布（還有 ${Math.max(0, daysBetweenISO(props.today, props.applyDate))} 天），當天自動套用`
})

// 留在畢業年級的留級生：草稿不受豁免，畢業日一到（含之後 7 天補跑）就會被自動畢業。
// 只算還沒過補跑期的；14 天內轉警示色。
const RETAIN_WARN_DAYS = 14
const retainDeadline = computed<{ text: string; tone: 'normal' | 'warning' | 'danger' } | null>(() => {
  const count = props.retainPendingCount
  const graduation = props.graduationDate
  if (count <= 0) return null
  const who = `${count} 位${props.graduationGradeName ?? '畢業年級'}留級生`
  // 自動畢業沒開：不會有人被畢業，留級只要在套用前發布就生效
  if (!props.autoGraduationEnabled) return { text: `有 ${who}：留級要在套用前發布才會生效`, tone: 'normal' }
  if (!graduation || !props.today) return null
  const phase = retainRiskPhase(props.today, graduation)
  if (phase === 'before') {
    const days = daysBetweenISO(props.today, graduation)
    return {
      text: `有 ${who}，須在畢業日 ${formatPlanDate(graduation)} 前發布（還有 ${days} 天）`,
      tone: days <= RETAIN_WARN_DAYS ? 'warning' : 'normal',
    }
  }
  if (phase === 'catchup') {
    const until = formatPlanDate(addDaysISO(graduation, GRADUATION_CATCHUP_DAYS))
    return {
      text: `有 ${who}：已過畢業日，系統到 ${until} 前仍可能把他們畢業，請盡快發布`,
      tone: 'danger',
    }
  }
  return null
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

.step-sub.is-warning {
  color: var(--color-warning-darker);
  font-weight: var(--font-weight-semibold);
}

.step-sub.is-danger {
  color: var(--color-danger-darker);
  font-weight: var(--font-weight-semibold);
}

.step-actions {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}

.step-actions .el-button + .el-button {
  margin-left: 0;
}

/* 觸控（平板）：「查看」「沿用原班老師」點擊區至少 32px */
@media (pointer: coarse) {
  .btn-show-unassigned,
  .btn-show-teachers,
  .btn-carry-over {
    min-height: 32px;
  }
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
