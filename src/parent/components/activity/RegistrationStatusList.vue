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
import { isActionablePromotion, isPromotionExpired } from '../../utils/activityPromotion'
import { fmtDateTime } from '../../utils/datetime'
import StatusPill from '../StatusPill.vue'

type StatusPillTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

interface RegCourse {
  course_id: number
  course_name: string
  status: string
  // 候補轉正的 48h 確認截止（後端 my-registrations 已回傳，ISO 字串）。
  confirm_deadline?: string | null
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
 * 候補轉正確認期限（2026-07-31 盲區稽核 C4）。
 *
 * 首頁待辦徽章刻意把逾期的 promoted_pending 也算進去（後端 home.py 的 docstring
 * 載明理由：讓家長點進來看得到「期限已過」，避免誤以為系統漏通知），但這裡原本
 * 只依 status 渲染一顆看起來可用的確認鈕，也不顯示期限——家長按下去只會拿到
 * 410，而且列不會消失（錯誤路徑沒有重新整理），再按一次變成 404。
 *
 * 判定邏輯住在 utils/activityPromotion，與才藝頁的「其他孩子待確認」統計共用。
 */
const canConfirmPromotion = isActionablePromotion

function deadlineText(rc: RegCourse): string {
  const formatted = fmtDateTime(rc.confirm_deadline)
  return formatted ? `請於 ${formatted} 前確認` : ''
}

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

/**
 * 報名是否仍在校方核對就讀資料（比對不符）。
 * 與公開查詢頁 review-pending-hint 同口徑：此時課程不計價、費用以審核結果為準，
 * 需在卡片上說明，避免家長把「費用待審核」badge 或 0 元誤讀成免費。
 */
function isPendingReview(reg: Registration): boolean {
  return (reg.courses || []).some((rc) => (rc.status || '').startsWith('pending_review'))
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
      <p
        v-if="isPendingReview(reg)"
        class="review-pending-hint"
        data-test="review-pending-hint"
      >
        此報名尚待校方核對就讀資料，課程與實際應繳金額以審核結果為準。
      </p>
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
          v-if="canConfirmPromotion(rc)"
          type="button"
          class="confirm-btn"
          :disabled="Boolean(confirmingKey)"
          @click="emit('confirm-promotion', reg, rc)"
        >確認轉正式</button>
        <button
          v-if="canConfirmPromotion(rc)"
          type="button"
          class="decline-btn"
          :disabled="confirmingKey === `${reg.id}:${rc.course_id}`"
          @click="emit('decline-promotion', reg, rc)"
        >放棄</button>
        <span
          v-if="canConfirmPromotion(rc) && deadlineText(rc)"
          class="confirm-deadline"
        >{{ deadlineText(rc) }}</span>
        <span
          v-else-if="rc.status === 'promoted_pending' && isPromotionExpired(rc)"
          class="confirm-expired"
        >確認期限已過，名額已釋出給下一位</span>
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

.review-pending-hint {
  margin: 0 0 var(--space-2, 8px);
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--color-info-soft, #e0f2fe);
  color: var(--pt-info-text, #2d6f8e);
  font-size: 12px;
  line-height: 1.5;
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

/* 候補確認期限（C4）：截止時間與逾期說明各佔一行，手機上不與按鈕擠在同一列。 */
.confirm-deadline,
.confirm-expired {
  flex-basis: 100%;
  font-size: 12px;
  line-height: 1.5;
}

.confirm-deadline {
  color: var(--m3-on-surface-variant, #49454f);
}

.confirm-expired {
  color: var(--m3-error, #ba1a1a);
}
</style>
