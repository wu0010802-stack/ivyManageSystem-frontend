<script setup lang="ts">
/**
 * 「現在該做」置頂卡（Phase 2 任務流首頁）。
 *
 * 資料源＝班級工作台摘要（getTodayHub）：sticky_next 為下一件班級任務、
 * counts 為四類待辦計數。把班級待辦帶進首頁，細項營運仍在 ClassroomOpsCard
 * 與班級工作台，這裡只做「當下焦點＋一眼計數」。
 *
 * 完成狀態＝sticky_next 為空 **且** counts 四類皆 0（見 pendingTotal 註解）。
 */
import { computed } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import {
  hubPendingChips,
  hubPendingTotal,
  type PortalHubCounts,
} from '@/utils/portalHubCounts'

interface NextTask {
  kind?: string
  student_name?: string
  detail?: string
  due_at?: string | null
  deep_link?: string
}


const props = withDefaults(defineProps<{
  next?: NextTask | null
  counts?: PortalHubCounts
  classroomName?: string
  /**
   * 班級提醒裡的安全事項人數（全部班級加總）。過敏與連續缺席原本只在首頁最下方的
   * 班級提醒卡，手機第一屏看不到；有就在這裡多一行摘要（2026-10-12 業主裁定）。
   * 生日不是安全事項，不放進來。
   */
  safety?: { allergies: number; absences: number }
}>(), {
  next: null,
  counts: () => ({}),
  classroomName: '',
  safety: () => ({ allergies: 0, absences: 0 }),
})

// open-task：晶片是捷徑，點了由首頁直接帶進該類待辦的頁面（2026-10-12 業主裁定）
defineEmits<{ 'jump': [deepLink: string | undefined]; 'open-task': [countKey: string]; 'open-safety': [] }>()

const hasSafety = computed(() => props.safety.allergies > 0 || props.safety.absences > 0)

const dueLabel = computed(() => {
  const iso = props.next?.due_at
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const chips = computed(() => hubPendingChips(props.counts))

/**
 * 未完成的班級任務總數。
 *
 * sticky_next 只由 medication 驅動（後端 class_hub.py 組 sticky_candidates 時
 * 只放 medication，註解自承「v1 僅 medication 有 due_at」），沒有待餵藥就回
 * null。若把 null 一律當成「全部做完」，在點名／課堂觀察／聯絡簿都還沒做的
 * 日子照樣顯示「今日班級任務都完成」——而幼兒園多數日子本來就沒有用藥委託，
 * 等於幾乎每天誤報，老師會因此漏做整天的點名與聯絡簿。
 * 完成狀態必須同時滿足「沒有下一件排程任務」與「四類計數皆為 0」。
 */
const pendingTotal = computed(() => hubPendingTotal(props.counts))
</script>

<template>
  <div class="pt-card-elevated today-focus">
    <div class="today-focus__head">
      <span class="today-focus__eyebrow">現在該做</span>
      <span v-if="classroomName" class="today-focus__class">{{ classroomName }}</span>
    </div>

    <div v-if="next" class="today-focus__main">
      <div class="today-focus__body">
        <div class="today-focus__detail">{{ next.detail }}</div>
        <div class="today-focus__meta">
          <span v-if="dueLabel">{{ dueLabel }}</span>
          <span v-if="next.student_name">{{ next.student_name }}</span>
        </div>
      </div>
      <button type="button" class="today-focus__cta" @click="$emit('jump', next.deep_link)">
        去處理
      </button>
    </div>

    <div v-else-if="!pendingTotal" class="today-focus__done">
      <span class="today-focus__done-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      今日班級任務都完成
    </div>

    <div v-else class="today-focus__pending">
      <span class="today-focus__pending-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      </span>
      尚有 {{ pendingTotal }} 項待完成
    </div>

    <button
      v-if="hasSafety"
      type="button"
      class="today-focus__safety"
      data-test="focus-safety"
      @click="$emit('open-safety')"
    >
      <el-icon class="today-focus__safety-icon" aria-hidden="true"><WarningFilled /></el-icon>
      <span v-if="safety.allergies > 0">過敏注意 {{ safety.allergies }} 位</span>
      <span v-if="safety.absences > 0">連續缺席 {{ safety.absences }} 位</span>
      <svg class="today-focus__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 6.5 15 12l-5.5 5.5" />
      </svg>
    </button>

    <div v-if="chips.length" class="today-focus__strip" role="group" aria-label="待辦，點一下直接前往">
      <button
        v-for="chip in chips"
        :key="chip.key"
        type="button"
        class="today-focus__chip"
        :data-test="`focus-chip-${chip.key}`"
        @click="$emit('open-task', chip.key)"
      >
        {{ chip.label }} <strong>{{ chip.count }}</strong>
        <svg class="today-focus__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.5 6.5 15 12l-5.5 5.5" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.today-focus {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.today-focus__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.today-focus__eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
}

.today-focus__class {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-color-soft);
  border-radius: var(--radius-full);
  padding: 2px 10px;
}

.today-focus__main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.today-focus__body {
  flex: 1 1 auto;
  min-width: 0;
}

.today-focus__detail {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-primary);
}

.today-focus__meta {
  margin-top: 2px;
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.today-focus__cta {
  flex-shrink: 0;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-5);
  background: var(--color-primary);
  color: #ffffff;
  border: none;
  border-radius: var(--btn-radius, 8px);
  font-family: inherit;
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.today-focus__cta:hover {
  background: var(--color-primary-soft);
}

.today-focus__cta:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.today-focus__done {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-success-darker);
}

.today-focus__done-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-success-soft);
  color: var(--color-success-darker);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.today-focus__done-icon svg {
  width: 16px;
  height: 16px;
}

.today-focus__pending {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-warning-darker);
}

.today-focus__pending-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.today-focus__pending-icon svg {
  width: 16px;
  height: 16px;
}

.today-focus__strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.today-focus__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-3);
  background: var(--bg-color-soft);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.today-focus__chip:hover {
  border-color: var(--color-primary);
}

.today-focus__chip:focus-visible,
.today-focus__safety:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.today-focus__chip strong {
  color: var(--text-primary);
}

.today-focus__safety {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2) var(--space-3);
  background: var(--el-color-danger-light-9);
  border: 1px solid var(--el-color-danger-light-7);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-danger-darker);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.today-focus__safety-icon {
  font-size: 16px;
}

.today-focus__safety .today-focus__chev {
  margin-left: auto;
}

.today-focus__chev {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  margin-left: auto;
  flex-shrink: 0;
}
</style>
