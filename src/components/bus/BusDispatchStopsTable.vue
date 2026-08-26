<script setup lang="ts">
/**
 * 今日調度：當日名單表格（FE-DISPATCH-04）。
 *
 * 純呈現元件——所有動作只 emit，落庫與錯誤處理一律由 `useBusDailyDispatch` 負責。
 *
 * ── 為什麼分成「已離站」與「待接送」兩區，而不是一張依 seq 排的表 ──────────
 * 後端的 `reorder` 只作用在 `pending` 站，且會把它們整批排到所有非 pending 站
 * 之後（`fixed_max_seq + offset`）。一張混排的表會讓使用者以為可以把某站拖到
 * 已離站的站之前——那個操作在後端根本不存在。分兩區之後「哪些還能動」是看得見的，
 * 也讓「已 departed 的站鎖定不可操作」不需要靠 disabled 的灰色去猜。
 * （el-table 本身無法列拖拉，repo 既有慣例是 vuedraggable + 自繪列，
 * 見 `views/activity/ActivityCourseView.vue`。）
 *
 * ── emit 用 student_id 而非 stop_id ─────────────────────────────────────────
 * `PATCH /bus/daily-plans/{trip_id}/stops` 的 `excuse`／`unexcuse`／`removes`／
 * `reorder`／`address_changes` **全部以 student_id 定址**（後端 2026-08-26 實查）。
 * emit stop_id 只會逼呼叫端在每個 handler 裡再查一次表換回 student_id，多一層
 * 對不上就是打錯人。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * 接送地址與聯絡人電話會顯示在畫面上（管理端本就有權查看）。**座標根本不在 props
 * 裡**——`DispatchStop` 已在 composable 去掉 `lat`/`lng`，因為本頁不需要它們。
 * 這不只是「不渲染」：`@sentry/vue` 預設 `attachProps: true`，render error 會把整包
 * props 送進 `contexts.vue.propsData`，而 Sentry 的 denylist 沒有 `lat`/`lng`。
 */
import { computed } from 'vue'
import draggable from 'vuedraggable'
import type { DispatchStop } from '@/composables/useBusDailyDispatch'
import { excuseReasonLabel } from '@/constants/bus'
import { formatTaipeiClock } from '@/utils/taipeiTime'

const props = defineProps<{
  stops: DispatchStop[]
  /** 唯讀鎖：completed／expired，或 planned/in_progress 但權限不足。 */
  readonly: boolean
  /** `planned`／`in_progress`／`completed`／`expired`。 */
  tripStatus: string
  /** `depart_time_planned` 被改或有 excused 站——平移出來的 ETA 可能已失真。 */
  etaStale: boolean
  /** 有寫入請求 in-flight；避免併發送出。 */
  busy?: boolean
}>()

const emit = defineEmits<{
  /** 兩個索引都是 **pending 序列內**的位置（非全清單索引）。 */
  reorder: [from: number, to: number]
  'mark-excused': [studentId: number]
  'unmark-excused': [studentId: number]
  remove: [studentId: number]
  /**
   * 開啟「接送地址」流程（選地址簿 ＋ 可在地圖上微調座標）。
   *
   * ⚠ 這裡刻意**沒有**獨立的「地圖微調」動作。`BusStopAdminOut` 不含
   * `pickup_address_id`（後端 2026-08-26 實查），所以前端無從只改座標而保留原本
   * 選定的接送地址——`address_changes` 少帶 `pickup_address_id` 會讓後端把該站
   * 重設回住家地址並改寫 `address_snapshot`，那是使用者沒要求的靜默資料異動。
   * 因此地圖微調收進地址流程內，由呼叫端在同一次 PATCH 一起送出。
   */
  'change-address': [studentId: number]
}>()

const STATUS_META: Record<string, { label: string; type: 'success' | 'info' | 'warning' | undefined }> = {
  pending: { label: '待接送', type: undefined },
  departed: { label: '已離站', type: 'success' },
  skipped: { label: '已跳過', type: 'info' },
  excused: { label: '今日不搭', type: 'warning' },
}

/** 待接送＝還能重排、還能改的那些站。 */
const pendingStops = computed(() => props.stops.filter((s) => s.status === 'pending'))
/** 已離站／已跳過／今日不搭；依 seq 呈現實際造訪順序。 */
const settledStops = computed(() => props.stops.filter((s) => s.status !== 'pending'))

const editable = computed(() => !props.readonly && !props.busy)
/**
 * `in_progress` 只開放 inserts／excuse／unexcuse／reorder；`removes` 與
 * `address_changes` 後端一律 422（spec「in_progress 編輯」）——所以這兩個動作在
 * 進行中就直接不給，不要等後端回錯誤才說。
 */
const canMutateRoster = computed(() => editable.value && props.tripStatus !== 'in_progress')

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, type: undefined }
}

/**
 * ETA：`eta_live`（行進間即時重算）優先，退回 `eta_planned`（當日日期平移值）。
 * 與後端 `services/bus_events.py::build_stop_update_event` 同順序。
 */
function etaText(s: DispatchStop): string {
  return formatTaipeiClock(s.eta_live ?? s.eta_planned) ?? '—'
}

function contactText(s: DispatchStop): string {
  const first = s.contacts?.[0]
  if (!first) return '—'
  return first.phone ? `${first.name}・${first.phone}` : first.name
}

/**
 * 能否取消 excused（回 pending）。
 *
 * `planned` 下後端只允許取消 `admin` 標記的——`leave` 與 `parent` 是別處的事實
 * （假單、家長端），要從那邊撤銷才對，從調度頁「取消」等於讓兩邊資料打架。
 * `in_progress` 下三種都開放：那是 spec 明訂的誤標救援路徑（車到現場發現學生
 * 在場），此時 excused 已經讓後端跳站，不救回來就真的漏接。
 */
function canUnexcuse(s: DispatchStop): boolean {
  if (!editable.value || s.status !== 'excused') return false
  return props.tripStatus === 'in_progress' || s.excuse_reason === 'admin'
}

/**
 * 能否移除這一站。後端條件是「非 `departed` **且**（`source === 'added'` 或
 * `status === 'pending'`）」——差集正是**預設名單裡今日不搭的人**
 * （`source='default'` 且 `status='excused'`），也就是每天最常見的那一群：
 * 只判「非 departed」會對每個請假的孩子亮出一顆按下去必定 422 的「移除」。
 *
 * 語意上也對：excused 的預設名單站要拿掉，該做的是從假單／家長端撤銷，
 * 而不是把人從當日名單刪掉（明天生成時他還是會回來）。
 */
function canRemove(s: DispatchStop): boolean {
  if (!canMutateRoster.value || s.status === 'departed') return false
  return s.source === 'added' || s.status === 'pending'
}

interface DragChangeEvent {
  moved?: { oldIndex: number; newIndex: number }
}

/**
 * 鍵盤上移／下移。拖拉是滑鼠專屬的——沒有這組按鈕，只用鍵盤或報讀器的行政
 * **完全無法完成這一頁的核心動作**（調整接送順序），而「自動排序」只能套演算法
 * 建議、不能指定順位。走的是同一個 `reorder` emit，index 語意與拖拉一致。
 */
function moveBy(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= pendingStops.value.length) return
  emit('reorder', index, target)
}

function onDragChange(evt: DragChangeEvent): void {
  if (!evt.moved) return
  emit('reorder', evt.moved.oldIndex, evt.moved.newIndex)
}
</script>

<template>
  <div class="bus-dispatch-stops">
    <el-alert
      v-if="etaStale"
      class="bus-dispatch-stops__stale"
      type="warning"
      :closable="false"
      show-icon
      data-test="eta-stale"
    >
      <template #title>
        ETA 可能已過期（出發時間有調整或有人不搭車），請按「自動排序」重算
      </template>
    </el-alert>

    <!-- ── 已處理／不搭車：純呈現，不可拖拉 ── -->
    <section v-if="settledStops.length" class="bus-dispatch-stops__section">
      <h4 class="bus-dispatch-stops__heading">已離站・不搭車</h4>
      <ul class="bus-dispatch-stops__list">
        <li
          v-for="s in settledStops"
          :key="s.student_id"
          class="bus-dispatch-stops__row bus-dispatch-stops__row--settled"
          :data-test="`settled-${s.student_id}`"
        >
          <span class="bus-dispatch-stops__seq">{{ s.seq }}</span>
          <span class="bus-dispatch-stops__name">
            {{ s.student_name }}
            <el-tag v-if="s.source === 'added'" size="small" type="info" data-test="added-tag">
              臨時
            </el-tag>
          </span>
          <!--
            原因與狀態 tag 併在同一個 grid cell：分成兩個 grid item 的話 excused 列
            會比其他列多一欄，最後一格（動作按鈕）就溢位到下一列最左邊，看起來像
            屬於下一位學生——而 excused 正是這張表最常出現的列。
          -->
          <span class="bus-dispatch-stops__status-cell">
            <el-tag :type="statusMeta(s.status).type" size="small" data-test="status-tag">
              {{ statusMeta(s.status).label }}
            </el-tag>
            <span
              v-if="s.status === 'excused'"
              class="bus-dispatch-stops__reason"
              :data-test="`excuse-${s.student_id}`"
            >
              {{ excuseReasonLabel(s.excuse_reason) }}
            </span>
          </span>
          <span class="bus-dispatch-stops__address">{{ s.address ?? '—' }}</span>
          <span class="bus-dispatch-stops__eta">
            {{ s.status === 'departed' ? (formatTaipeiClock(s.departed_at) ?? '—') : '—' }}
          </span>
          <span class="bus-dispatch-stops__actions">
            <el-button
              v-if="canUnexcuse(s)"
              link
              type="primary"
              size="small"
              :data-test="`unexcuse-${s.student_id}`"
              @click="emit('unmark-excused', s.student_id)"
            >
              取消不搭車
            </el-button>
            <el-button
              v-if="canRemove(s)"
              link
              type="danger"
              size="small"
              :data-test="`remove-${s.student_id}`"
              @click="emit('remove', s.student_id)"
            >
              移除
            </el-button>
          </span>
        </li>
      </ul>
    </section>

    <!-- ── 待接送：可拖拉重排（拖拉＝該站自動釘選，由後端在同一次 PATCH 完成） ── -->
    <section class="bus-dispatch-stops__section">
      <h4 class="bus-dispatch-stops__heading">
        待接送順序
        <span v-if="editable" class="bus-dispatch-stops__hint">（拖拉調整順序，調整後該站會自動釘選）</span>
      </h4>
      <!--
        拖拉是 controlled 用法：放手後列會先彈回原位，等 PATCH 回來才真的重排。
        慢網路下那兩秒畫面毫無變化，使用者會以為拖拉沒生效而重拖——此時 busy 已把
        握把收起來，看起來就像頁面壞了。
      -->
      <p v-if="busy" class="bus-dispatch-stops__saving" role="status" data-test="saving">
        順序儲存中⋯
      </p>
      <div v-if="!pendingStops.length" class="bus-dispatch-stops__empty" data-test="pending-empty">
        沒有待接送的站點
      </div>
      <draggable
        v-else
        :model-value="pendingStops"
        item-key="student_id"
        handle=".bus-dispatch-stops__handle"
        :disabled="!editable"
        tag="ul"
        class="bus-dispatch-stops__list"
        data-test="pending-list"
        @change="onDragChange"
      >
        <template #item="{ element: s, index }">
          <li class="bus-dispatch-stops__row" :data-test="`pending-${s.student_id}`">
            <span
              v-if="editable"
              class="bus-dispatch-stops__handle"
              role="button"
              tabindex="0"
              :aria-label="`調整 ${s.student_name} 的順序：拖拉，或用上下方向鍵`"
              :data-test="`handle-${s.student_id}`"
              @keydown.up.prevent="moveBy(index, -1)"
              @keydown.down.prevent="moveBy(index, 1)"
            >⠿</span>
            <span
              v-else
              class="bus-dispatch-stops__handle bus-dispatch-stops__handle--off"
              aria-hidden="true"
            >⠿</span>
            <span class="bus-dispatch-stops__seq">{{ index + 1 }}</span>
            <span class="bus-dispatch-stops__name">
              {{ s.student_name }}
              <el-tag v-if="s.source === 'added'" size="small" type="info" data-test="added-tag">
                臨時
              </el-tag>
              <span
                v-if="s.pinned"
                class="bus-dispatch-stops__pinned"
                role="img"
                aria-label="已釘選，自動排序不會改變此站順位"
                :data-test="`pinned-${s.student_id}`"
              >📌</span>
            </span>
            <el-tag :type="statusMeta(s.status).type" size="small" data-test="status-tag">
              {{ statusMeta(s.status).label }}
            </el-tag>
            <span class="bus-dispatch-stops__address">
              {{ s.address ?? '—' }}
              <small class="bus-dispatch-stops__contact">{{ contactText(s) }}</small>
            </span>
            <span class="bus-dispatch-stops__eta" :data-test="`eta-${s.student_id}`">
              {{ etaText(s) }}
            </span>
            <span class="bus-dispatch-stops__actions">
              <el-button
                v-if="editable"
                link
                type="primary"
                size="small"
                :disabled="index === 0"
                :aria-label="`把 ${s.student_name} 往前移一位`"
                :data-test="`up-${s.student_id}`"
                @click="moveBy(index, -1)"
              >
                ↑
              </el-button>
              <el-button
                v-if="editable"
                link
                type="primary"
                size="small"
                :disabled="index === pendingStops.length - 1"
                :aria-label="`把 ${s.student_name} 往後移一位`"
                :data-test="`down-${s.student_id}`"
                @click="moveBy(index, 1)"
              >
                ↓
              </el-button>
              <el-button
                v-if="editable"
                link
                type="primary"
                size="small"
                :data-test="`excuse-btn-${s.student_id}`"
                @click="emit('mark-excused', s.student_id)"
              >
                標記不搭車
              </el-button>
              <el-button
                v-if="canMutateRoster"
                link
                type="primary"
                size="small"
                :data-test="`address-btn-${s.student_id}`"
                @click="emit('change-address', s.student_id)"
              >
                接送地址
              </el-button>
              <el-button
                v-if="canRemove(s)"
                link
                type="danger"
                size="small"
                :data-test="`remove-${s.student_id}`"
                @click="emit('remove', s.student_id)"
              >
                移除
              </el-button>
            </span>
          </li>
        </template>
      </draggable>
    </section>
  </div>
</template>

<style scoped>
.bus-dispatch-stops__section {
  margin-top: 12px;
}

.bus-dispatch-stops__heading {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.bus-dispatch-stops__hint {
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.bus-dispatch-stops__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bus-dispatch-stops__row {
  display: grid;
  grid-template-columns: 24px 36px minmax(120px, 1fr) 120px minmax(160px, 2fr) 72px auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.bus-dispatch-stops__row--settled {
  opacity: 0.75;
}

/* 已離站區沒有拖拉握把；把 seq 明確定位到第 2 欄，與待接送區對齊 */
.bus-dispatch-stops__row--settled .bus-dispatch-stops__seq {
  grid-column: 2;
}

/* 狀態與不搭原因共用一格，避免 excused 列比其他列多一欄而把動作欄擠到下一列 */
.bus-dispatch-stops__status-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.bus-dispatch-stops__handle {
  cursor: grab;
  color: var(--el-text-color-secondary);
  user-select: none;
}

.bus-dispatch-stops__handle--off {
  cursor: default;
  opacity: 0.3;
}

.bus-dispatch-stops__seq {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.bus-dispatch-stops__name {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bus-dispatch-stops__reason,
.bus-dispatch-stops__contact {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.bus-dispatch-stops__address {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.bus-dispatch-stops__eta {
  font-variant-numeric: tabular-nums;
}

.bus-dispatch-stops__actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.bus-dispatch-stops__empty {
  padding: 12px 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.bus-dispatch-stops__stale {
  margin-bottom: 8px;
}

.bus-dispatch-stops__saving {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
