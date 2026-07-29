<script setup lang="ts">
/**
 * 才藝報名狀態列表（presentational）。
 *
 * Props:
 *  - registrations: 已篩選後的報名陣列
 *  - studentNameMap: Map<student_id, name> 用於 fallback 顯示學生姓名
 *  - courseStatusMap: { [status]: { label, color: { bg, color } } }（保留 prop 相容性；
 *    視覺渲染已改用 StatusPill tone，prop 僅用於取 label）
 *
 * Emits:
 *  - confirm-promotion(reg, course): 確認轉正式按鈕點擊
 *  - decline-promotion(reg, course): 放棄候補升位按鈕點擊（設計審查 2026-07-28：
 *    原本只有確認鈕，不想上課的家長只能放到 48h 確認窗過期才釋出名額）
 *
 * 根節點帶 id="act-active" 提供 hero scrollIntoView 錨點。
 */
import { paymentBadge } from '../../utils/activityPayment'
import StatusPill from '../StatusPill.vue'

type StatusPillTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

interface RegCourse {
  course_id: number
  course_name: string
  status: string
}

interface Registration {
  id: number
  student_id: number
  student_name?: string
  school_year: number
  semester: number
  is_paid: boolean
  // ④ 後端直接回傳的繳費口徑（_registration_summary）。badge 一律以此渲染。
  payment_status?: string
  outstanding_amount?: number
  // 已退費累計（後端 refunded 維度）：>0 時顯示「已退費」，區分退過費歸零 vs 從未繳。
  refunded_amount?: number
  courses: RegCourse[]
}

withDefaults(defineProps<{
  registrations?: Registration[]
  studentNameMap?: Map<number, string>
  courseStatusMap?: Record<string, { label: string; color: { bg: string; color: string } }>
  // FE-1（2026-06-23 audit）：正在確認的「reg.id:course_id」鍵；該列確認鈕停用防連點。
  confirmingKey?: string | null
}>(), {
  registrations: () => [],
  studentNameMap: () => new Map(),
  courseStatusMap: () => ({}),
  confirmingKey: null,
})
const emit = defineEmits<{
  'confirm-promotion': [reg: Registration, course: RegCourse]
  'decline-promotion': [reg: Registration, course: RegCourse]
}>()

/**
 * 課程報名狀態 → StatusPill tone。
 * enrolled        → ok（已確認報名）
 * waitlist        → warn（候補中，待確認）
 * promoted_pending → danger（需要家長確認轉正式）
 * pending_review  → warn（待校方審核）
 * pending_review_waitlist → info（待審核候補，尚非正式候補順位）
 * finished        → neutral（已結束）
 * refunded        → neutral（已退費）
 * 其他            → neutral
 */
function courseStatusTone(status: string): StatusPillTone {
  switch (status) {
    case 'enrolled':        return 'ok'
    case 'waitlist':        return 'warn'
    case 'promoted_pending': return 'danger'
    case 'pending_review':  return 'warn'
    case 'pending_review_waitlist': return 'info'
    case 'finished':        return 'neutral'
    case 'refunded':        return 'neutral'
    default:                return 'neutral'
  }
}

/**
 * 課程報名狀態 label：從 courseStatusMap 取 label（向後相容），
 * 若 map 無對應則 fallback 到各 status 的預設中文標籤。
 */
const STATUS_LABEL_FALLBACK: Record<string, string> = {
  enrolled: '已報名',
  waitlist: '候補中',
  promoted_pending: '待您確認',
  pending_review: '待審核',
  pending_review_waitlist: '待審核候補',
  finished: '已結束',
  refunded: '已退費',
}

function courseStatusLabel(
  status: string,
  map: Record<string, { label: string; color: { bg: string; color: string } }>,
): string {
  return map[status]?.label ?? STATUS_LABEL_FALLBACK[status] ?? status
}
</script>

<template>
  <div id="act-active" class="reg-status-list">
    <div
      v-for="(reg, idx) in registrations"
      :key="reg.id"
      class="reg-card"
      :data-unpaid="(reg.payment_status === 'unpaid' || reg.payment_status === 'partial' || (!reg.payment_status && !reg.is_paid)) && registrations.findIndex((r) => r.payment_status === 'unpaid' || r.payment_status === 'partial' || (!r.payment_status && !r.is_paid)) === idx ? '' : undefined"
    >
      <div class="reg-header">
        <span class="reg-student">{{ reg.student_name || studentNameMap.get(reg.student_id) }}</span>
        <span class="reg-term">{{ reg.school_year }}-{{ reg.semester === 1 ? '上' : '下' }}</span>
        <StatusPill
          class="payment-pill"
          :label="paymentBadge(reg).label"
          :tone="paymentBadge(reg).tone"
        />
        <span v-if="(reg.refunded_amount ?? 0) > 0" class="reg-refunded">
          已退費 ${{ (reg.refunded_amount ?? 0).toLocaleString() }}
        </span>
      </div>
      <div
        v-for="rc in reg.courses"
        :key="rc.course_id"
        class="course-row"
      >
        <span class="course-name">{{ rc.course_name }}</span>
        <StatusPill
          :label="courseStatusLabel(rc.status, courseStatusMap)"
          :tone="courseStatusTone(rc.status)"
          :data-status="rc.status"
        />
        <button
          v-if="rc.status === 'promoted_pending'"
          type="button"
          class="confirm-btn"
          :disabled="Boolean(confirmingKey)"
          @click="emit('confirm-promotion', reg, rc)"
        >確認轉正式</button>
        <button
          v-if="rc.status === 'promoted_pending'"
          type="button"
          class="decline-btn"
          :disabled="confirmingKey === `${reg.id}:${rc.course_id}`"
          @click="emit('decline-promotion', reg, rc)"
        >放棄</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reg-status-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 10px);
}

.reg-card {
  background: var(--m3-surface-container-low, var(--neutral-0));
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--m3-elev-1, var(--pt-elev-1));
}

.reg-header {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  margin-bottom: var(--space-2, 8px);
  flex-wrap: wrap;
}

.reg-student {
  font-weight: 600;
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.reg-term {
  background: var(--color-info-soft, #e0f2fe);
  color: var(--pt-info-text, #2d6f8e);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.payment-pill {
  margin-left: auto;
}

/* 已退費：緊接付款 badge 後，灰底小字（資訊性，非警示） */
.reg-refunded {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  background: var(--m3-surface-container-highest, #e7edf3);
  color: var(--pt-text-muted, var(--pt-text-soft));
}

.course-row {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) 0;
  border-top: 1px solid var(--m3-outline-variant, var(--pt-border));
}

.course-name {
  flex: 1;
  font-size: 14px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

.confirm-btn {
  padding: 4px 10px;
  background: var(--m3-primary, var(--brand-primary));
  color: var(--m3-on-primary, var(--neutral-0));
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

/* 放棄：次要危險動作，描邊樣式與確認鈕區隔，避免誤觸 */
.decline-btn {
  padding: 4px 10px;
  background: transparent;
  color: var(--m3-error, #ba1a1a);
  border: 1px solid var(--m3-error, #ba1a1a);
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.confirm-btn:disabled,
.decline-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
