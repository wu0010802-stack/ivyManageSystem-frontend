<script setup lang="ts">
/**
 * 中欄單一學生卡片（T-006，2026-08-22 密度調整）：姓名（大字）＋狀態徽章＋3-dots
 * more-icon 選單。status／detail 由父層傳入（吃 useStudentPosStatus 的輸出），本
 * 元件不自己判斷學生狀態。
 *
 * more-icon 選單（posbus01）只 emit 意圖，API 呼叫由 DismissalPosBoard 負責：
 * - 待接送：標記已被娃娃車接走／標記請假（病假、事假）
 * - 接送台補登的娃娃車或請假：撤銷
 * - 系統帶入（隨車老師打卡、家長請假、老師點名）：只顯示來源說明，POS 不能撤，
 *   避免辦公室從這裡蓋掉別處的正式紀錄。
 *
 * 對照 docs/mockups/2026-08-22-dismissal-pos-card-density.html：卡片縮小、姓名放大，
 * 拿掉「👆 點卡片＝現場接送」「👆 點卡片可再次通知」等操作提示文字——只留姓名＋⋮，
 * 狀態徽章（🌙／🚌／✅）維持不變（那是狀態資訊，不是操作提示）。
 *
 * 卡片本體用 div[role=button]（非 <button>）：more-icon 是巢狀真按鈕，
 * <button> 不能包 <button>（比照既有 mockup 的既有理由）。
 */
import { computed } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus'
import type { PosStudentStatus, PosStudentStatusDetail } from '@/types/dismissalPos'

export interface DismissalPosStudentCardStudent {
  id: number
  name: string
}

export type PosLeaveType = '病假' | '事假'

const props = withDefaults(
  defineProps<{
    student: DismissalPosStudentCardStudent
    status: PosStudentStatus
    detail?: PosStudentStatusDetail
    /** 補登／撤銷請求進行中：停用選單避免重複送出 */
    busy?: boolean
  }>(),
  { detail: () => ({}), busy: false },
)

const emit = defineEmits<{
  'quick-dispatch': [student: DismissalPosStudentCardStudent]
  'mark-bus': [student: DismissalPosStudentCardStudent]
  'mark-leave': [student: DismissalPosStudentCardStudent, leaveType: PosLeaveType]
  'unmark-bus': [student: DismissalPosStudentCardStudent, callId: number]
  'unmark-leave': [student: DismissalPosStudentCardStudent]
}>()

interface StatusMeta {
  label: string
  icon: string
  tone: 'leave' | 'bus' | 'picked' | 'proxy'
}

/**
 * 已完成狀態的徽章文案（比照 mockup STATUS_META）。unpicked 不進這張表。
 * proxy_picked（T-023）刻意用不同 icon／tone 與 guardian_picked 區分，
 * 讓辦公室一眼分辨是本人家長還是委託代理人接走（D10）。
 */
const STATUS_META: Record<Exclude<PosStudentStatus, 'unpicked'>, StatusMeta> = {
  on_leave: { label: '請假', icon: '🌙', tone: 'leave' },
  bus_picked: { label: '娃娃車已接送', icon: '🚌', tone: 'bus' },
  guardian_picked: { label: '家長已接送', icon: '✅', tone: 'picked' },
  proxy_picked: { label: '代理人已接走', icon: '🪪', tone: 'proxy' },
}

const isUnpicked = computed(() => props.status === 'unpicked')
const statusMeta = computed<StatusMeta | null>(() => {
  if (isUnpicked.value) return null
  const meta = STATUS_META[props.status as Exclude<PosStudentStatus, 'unpicked'>]
  if (props.status === 'on_leave' && props.detail.leaveType) {
    return { ...meta, label: `請假（${props.detail.leaveType}）` }
  }
  return meta
})

interface MenuItem {
  key: string
  label: string
  note?: string
  /** 無 command＝純說明、disabled */
  command?: string
}

const menuItems = computed<MenuItem[]>(() => {
  const d = props.detail
  switch (props.status) {
    case 'unpicked':
      return [
        { key: 'bus', label: '🚌 標記已被娃娃車接走', command: 'mark-bus' },
        { key: 'sick', label: '🌙 標記請假（病假）', command: 'mark-leave:病假' },
        { key: 'personal', label: '🌙 標記請假（事假）', command: 'mark-leave:事假' },
      ]
    case 'bus_picked':
      if (d.busManualCallId != null) {
        return [{ key: 'unbus', label: '↩︎ 撤銷娃娃車接走標記', command: 'unmark-bus' }]
      }
      return [{
        key: 'bus-auto',
        label: '🚌 由隨車老師端記錄上車',
        note: d.busRouteName ? `${d.busRouteName}，如有誤請隨車老師修正` : '如有誤請隨車老師修正',
      }]
    case 'on_leave':
      if (d.leaveMarkedByPos) {
        return [{ key: 'unleave', label: '↩︎ 撤銷請假標記', command: 'unmark-leave' }]
      }
      return [{
        key: 'leave-auto',
        label: '🌙 家長請假或老師點名的紀錄',
        note: '如有誤請到點名頁修改',
      }]
    default:
      return [{ key: 'picked', label: '學生今天已被接走', note: '不需要再標記' }]
  }
})

function handleCommand(command: string) {
  if (props.busy) return
  if (command === 'mark-bus') emit('mark-bus', props.student)
  else if (command === 'mark-leave:病假') emit('mark-leave', props.student, '病假')
  else if (command === 'mark-leave:事假') emit('mark-leave', props.student, '事假')
  else if (command === 'unmark-leave') emit('unmark-leave', props.student)
  else if (command === 'unmark-bus' && props.detail.busManualCallId != null) {
    emit('unmark-bus', props.student, props.detail.busManualCallId)
  }
}

/**
 * 家長已接送後仍可再次點擊發起（家長折返／誤標完成等情境）；重複發起防線在
 * useDismissalPosQueue.addToQueue（staging 倒數中或已有 active 通知會被忽略）。
 * on_leave / bus_picked 維持不可點（孩子不在園內等人接，不該再發通知）；
 * 家長臨時改來接時，辦公室先撤銷補登再點卡片。
 */
const canDispatch = computed(
  () => props.status === 'unpicked' || props.status === 'guardian_picked',
)

/** 姓名 + 狀態，讓報讀器一次唸完整句（比照 DismissalCallCard 既有 aria-label 慣例）。 */
const ariaLabel = computed(() => {
  const statusText = statusMeta.value ? statusMeta.value.label : '待接送'
  const redispatchHint = props.status === 'guardian_picked' ? '，點擊可再次通知' : ''
  return `${props.student.name}，${statusText}${redispatchHint}`
})

function handleDispatch() {
  if (!canDispatch.value) return
  emit('quick-dispatch', props.student)
}
</script>

<template>
  <div
    class="pos-student-card"
    :class="{ 'is-resolved': !isUnpicked, 'is-redispatchable': canDispatch && !isUnpicked }"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    @click="handleDispatch"
    @keydown.enter.prevent="handleDispatch"
    @keydown.space.prevent="handleDispatch"
  >
    <el-dropdown
      class="pos-student-card__more"
      trigger="click"
      :disabled="busy"
      @command="handleCommand"
    >
      <button
        type="button"
        class="pos-student-card__more-trigger"
        aria-label="更多動作"
        :disabled="busy"
        @click.stop
      >⋮</button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item in menuItems"
            :key="item.key"
            :command="item.command"
            :disabled="!item.command"
          >
            <div class="pos-student-card__menu-item">
              <span>{{ item.label }}</span>
              <span v-if="item.note" class="pos-student-card__menu-note">{{ item.note }}</span>
            </div>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div class="pos-student-card__name">{{ student.name }}</div>

    <span
      v-if="statusMeta"
      class="pos-student-card__status"
      :class="`pos-student-card__status--${statusMeta.tone}`"
    >{{ statusMeta.icon }} {{ statusMeta.label }}</span>
  </div>
</template>

<style scoped>
.pos-student-card {
  position: relative;
  background: var(--surface-color);
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-3, 12px);
  min-height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--transition-fast, 0.15s ease),
    box-shadow var(--transition-fast, 0.15s ease),
    transform var(--transition-fast, 0.15s ease);
}

.pos-student-card:hover {
  border-color: var(--brand-primary, var(--color-primary));
  box-shadow: var(--shadow-md);
}

.pos-student-card:focus-visible {
  outline: 2px solid var(--brand-primary, var(--color-primary));
  outline-offset: 2px;
}

.pos-student-card:active {
  transform: scale(0.98);
}

.pos-student-card__name {
  font-size: var(--text-3xl, 24px);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.2;
  word-break: break-word;
  padding-right: var(--space-6, 24px);
}

.pos-student-card__more {
  position: absolute;
  top: 6px;
  right: 6px;
}

.pos-student-card__more-trigger {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md, 8px);
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 18px;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.pos-student-card__more-trigger:hover {
  background: var(--bg-color-soft);
  color: var(--text-secondary);
}

.pos-student-card__menu-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pos-student-card__menu-note {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 400;
}

.pos-student-card__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
}

.pos-student-card__status--bus {
  background: var(--color-info-soft);
  color: var(--color-info-darker);
}

.pos-student-card__status--leave {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}

.pos-student-card__status--picked {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}

/* proxy_picked（T-023 review 修復，2026-08-23）：原用 --color-danger-soft，但這是正常完成的
   接送事件，用紅色系容易讓辦公室人員誤讀成異常/警示狀態。改用既有 neutral 色階（非新增變數，
   與 --color-*-soft/*-darker 相同的「淺底深字」配對慣例，已在 a11y.css 隨深色/高對比模式調整），
   維持與 guardian_picked（success 綠）/bus_picked（info 藍）/on_leave（warning 橙）三色視覺區隔，
   同時不再誤傳「警示」語意。 */
.pos-student-card__status--proxy {
  background: var(--neutral-200);
  color: var(--neutral-700);
}

/* 已處理（請假／娃娃車已接送／家長已接送）卡片：降低視覺優先度（淡灰） */
.pos-student-card.is-resolved {
  cursor: default;
  background: var(--bg-color-soft);
}

.pos-student-card.is-resolved:hover {
  border-color: var(--border-color);
  box-shadow: none;
}

.pos-student-card.is-resolved .pos-student-card__name {
  color: var(--text-secondary);
}

/* 家長已接送：維持淡灰降階，但仍可再次點擊發起通知（恢復可點視覺回饋） */
.pos-student-card.is-redispatchable {
  cursor: pointer;
}

.pos-student-card.is-redispatchable:hover {
  border-color: var(--brand-primary, var(--color-primary));
  box-shadow: var(--shadow-md);
}

</style>
