<script setup lang="ts">
/**
 * 班次名單編輯表格（FE-ROUTES-04，spec「前端（admin）模組拆分—名單表格」）。
 *
 * ── 2026-08-26 決策（接送地址簿上線）─────────────────────────────────────────
 * 操作欄與座標欄一律**改地址導向**：
 * - 舊版「座標」欄（顯示經緯度數字）→ 改顯示**接送地址文字**（住家或地址簿該筆）。
 * - 舊版「定位」按鈕（單一學生 geocode）→ 改「設定接送地址」，交給
 *   `BusPickupAddressSelect` 選址／就地新增（後端建立時即 geocode）。
 * - 「地圖微調」保留，但入口改掛在**地址已選定之後**（微調實際上下車點），
 *   不是取代地址設定。
 *
 * ── 隱私 ────────────────────────────────────────────────────────────────────
 * 經緯度**不渲染成任何欄位、title、aria-label**——座標只供最佳化、ETA 與地圖微調
 * 起始位置使用。電話同理只在聯絡人欄呈現，不進 console／URL／storage。
 *
 * ── 元件不改資料 ────────────────────────────────────────────────────────────
 * 拖拉只 emit `reorder`、星期只 emit bitmask（由 composable 檢查跨班次衝突）。
 * 元件自行改 props 會繞過那道檢查。
 *
 * ── 2026-08-27 決策（釘選一律手動）──────────────────────────────────────────
 * 調整順序（拖拉／上下移）**不再自動釘選**，釘選改成操作欄裡的顯式按鈕。
 * 原本自動釘選會讓站數一多就整批變釘選，而全站釘選使自動排序變成 no-op。
 */
import { computed } from 'vue'
import draggable from 'vuedraggable'
import {
  WEEKDAY_LABELS, rideDaysToWeekdays, weekdaysToRideDays,
} from '@/composables/useBusRouteEditor'
import type { BusStopDraft } from '@/composables/useBusRouteEditor'

const props = defineProps<{
  stops: BusStopDraft[]
  capacity: number
  readonly: boolean
}>()

const emit = defineEmits<{
  reorder: [from: number, to: number]
  remove: [index: number]
  'toggle-pinned': [index: number]
  'update-ride-days': [index: number, rideDays: number]
  'pick-address': [index: number]
  'tune-map': [studentId: number]
  relocate: [index: number]
}>()

/** 逐星期（一~五）載客數；後端 capacity 檢查是逐星期取 max，不是總站數。 */
const weekdayLoads = computed(() =>
  WEEKDAY_LABELS.map((_, i) => props.stops.filter((s) => s.ride_days & (1 << i)).length),
)
const overloaded = computed(() =>
  weekdayLoads.value.map((load) => props.capacity > 0 && load > props.capacity),
)

function studentLabel(stop: BusStopDraft): string {
  return stop.classroom_name ? `${stop.student_name}（${stop.classroom_name}）` : stop.student_name
}

/** 顯示接送地址文字；缺地址時是警示，不是空白（缺座標無法發車）。 */
function addressLabel(stop: BusStopDraft): string {
  return stop.address_snapshot ?? ''
}
function isUnlocated(stop: BusStopDraft): boolean {
  return stop.lat === null || stop.lng === null
}

function etaLabel(stop: BusStopDraft): string {
  return stop.eta_planned ? stop.eta_planned.slice(0, 5) : '—'
}

function selectedWeekdays(stop: BusStopDraft): number[] {
  return rideDaysToWeekdays(stop.ride_days)
}

/**
 * el-checkbox-group 的值型別是 `(string | number | boolean)[]`；本元件的 value 恆為
 * 星期 index（number），其餘型別直接濾掉而不是硬轉，避免混入 NaN。
 */
function onWeekdaysChange(index: number, days: Array<string | number | boolean>): void {
  const indices = days.filter((d): d is number => typeof d === 'number')
  emit('update-ride-days', index, weekdaysToRideDays(indices))
}

/**
 * 拖拉位移。用 vuedraggable 的 `change` 事件（`{ moved: { oldIndex, newIndex } }`）
 * 而**不是**從新舊陣列反推——反推在「往後拖」的情境會算錯：
 * `[A,B,C] → [B,C,A]`（把 A 拖到最後）用「第一個不同的位置」推出來會是
 * `moveStop(1, 0)`（把 B 往前移），送出的接送順序就錯了。
 */
/**
 * 鍵盤替代方案。拖拉對鍵盤與螢幕閱讀器使用者不可用，而排序**是這張表的主要工作**
 * ——舊版 BusRoutesView 的「↑／↓」上下移按鈕在改成拖拉後不能就這樣消失。
 * 兩條路徑都走同一個 `reorder`，語意一致。
 */
function moveBy(index: number, delta: number): void {
  const to = index + delta
  if (to < 0 || to >= props.stops.length) return
  emit('reorder', index, to)
}

function onDragChange(event: unknown): void {
  const moved = (event as { moved?: { oldIndex?: number; newIndex?: number } } | null)?.moved
  const from = moved?.oldIndex
  const to = moved?.newIndex
  if (typeof from !== 'number' || typeof to !== 'number' || from === to) return
  emit('reorder', from, to)
}
</script>

<template>
  <div class="bus-route-stops-table" data-test="bus-route-stops-table">
    <table class="bus-route-stops-table__table">
      <caption class="bus-route-stops-table__caption">班次名單（拖拉把手或上下移按鈕可調整順序）</caption>
      <thead>
        <tr>
          <th scope="col" class="is-narrow">順序</th>
          <th scope="col">學生</th>
          <th scope="col">接送地址</th>
          <th scope="col">聯絡人</th>
          <th scope="col">搭乘日</th>
          <th scope="col" class="is-narrow">預計抵達</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <draggable
        :model-value="stops"
        tag="tbody"
        item-key="student_id"
        :disabled="readonly"
        :animation="150"
        handle=".bus-route-stops-table__handle"
        @change="onDragChange"
      >
        <template #item="{ element, index }">
          <tr :data-test="`stop-${element.student_id}`">
            <td class="is-narrow">
              <span
                class="bus-route-stops-table__handle"
                aria-hidden="true"
                data-test="drag-handle"
              >⋮⋮</span>
              <span class="bus-route-stops-table__seq">{{ index + 1 }}</span>
              <el-button
                link
                size="small"
                :disabled="readonly || index === 0"
                :aria-label="`將 ${element.student_name} 上移一位`"
                :data-test="`move-up-${element.student_id}`"
                @click="moveBy(index, -1)"
              >
                ↑
              </el-button>
              <el-button
                link
                size="small"
                :disabled="readonly || index === stops.length - 1"
                :aria-label="`將 ${element.student_name} 下移一位`"
                :data-test="`move-down-${element.student_id}`"
                @click="moveBy(index, 1)"
              >
                ↓
              </el-button>
            </td>

            <td data-test="student-cell">{{ studentLabel(element) }}</td>

            <td data-test="address-cell">
              <span v-if="addressLabel(element)">{{ addressLabel(element) }}</span>
              <el-tag v-else size="small" type="warning" data-test="address-missing">
                尚未設定接送地址
              </el-tag>
              <el-tag
                v-if="addressLabel(element) && isUnlocated(element)"
                size="small"
                type="warning"
                data-test="address-unlocated"
              >
                尚未定位
              </el-tag>
              <el-tag
                v-if="element.address_stale"
                size="small"
                type="warning"
                data-test="address-stale"
              >
                地址已變更
              </el-tag>
            </td>

            <td data-test="contacts-cell">
              <template v-if="element.contacts.length">
                <span
                  v-for="(c, ci) in element.contacts"
                  :key="`${c.name}-${ci}`"
                  class="bus-route-stops-table__contact"
                >
                  {{ c.name }}<template v-if="c.phone"> {{ c.phone }}</template>
                </span>
              </template>
              <span v-else class="bus-route-stops-table__muted">—</span>
            </td>

            <td data-test="ride-days-cell">
              <el-checkbox-group
                :model-value="selectedWeekdays(element)"
                :aria-label="`${element.student_name} 的搭乘日`"
                :disabled="readonly"
                @update:model-value="(days: Array<string | number | boolean>) => onWeekdaysChange(index, days)"
              >
                <el-checkbox
                  v-for="(label, i) in WEEKDAY_LABELS"
                  :key="label"
                  :value="i"
                  :label="label"
                />
              </el-checkbox-group>
            </td>

            <td class="is-narrow" data-test="eta-cell">
              <span>{{ etaLabel(element) }}</span>
              <span v-if="element.eta_planned" class="bus-route-stops-table__muted">預計</span>
            </td>

            <td>
              <div class="bus-route-stops-table__actions">
                <!--
                  釘選：2026-08-27 起唯一的釘選入口（調整順序不再自動釘選）。
                  已釘選用實心 warning 撐出狀態差，未釘選用 plain 與其他操作同級。
                -->
                <el-button
                  size="small"
                  :type="element.pinned ? 'warning' : ''"
                  :plain="!element.pinned"
                  :disabled="readonly"
                  :aria-pressed="element.pinned ? 'true' : 'false'"
                  :aria-label="element.pinned
                    ? `取消釘選 ${element.student_name} 這一站`
                    : `釘選 ${element.student_name} 這一站（自動排序不會移動）`"
                  :title="element.pinned
                    ? '已釘選：自動排序不會移動這一站'
                    : '未釘選：自動排序可能移動這一站'"
                  :data-test="`pin-${element.student_id}`"
                  @click="emit('toggle-pinned', index)"
                >
                  <span aria-hidden="true">{{ element.pinned ? '📌' : '📍' }}</span>
                  {{ element.pinned ? '已釘選' : '釘選' }}
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="readonly"
                  :data-test="`pick-address-${element.student_id}`"
                  @click="emit('pick-address', index)"
                >
                  設定接送地址
                </el-button>
              <!--
                重新定位：對這一站目前用著的地址（住家或地址簿該筆）無條件重跑一次
                geocode，不改地址文字。用於「尚未定位」或懷疑座標不準時手動重試，
                跟「地圖微調」互補（前者是自動重查、後者是手動拖曳）。
              -->
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="readonly"
                  :data-test="`relocate-${element.student_id}`"
                  @click="emit('relocate', index)"
                >
                  重新定位
                </el-button>
              <!--
                無座標時**不 disable**：BusStopMapTuner 支援「無座標時以園所座標為
                初始中心」，那是使用者唯一能替一個 geocode 失敗的站補上座標的路徑。
                在這裡 disable 等於把死巷變成死路。
              -->
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :disabled="readonly"
                  :data-test="`tune-map-${element.student_id}`"
                  @click="emit('tune-map', element.student_id)"
                >
                  地圖微調
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="readonly"
                  :data-test="`remove-${element.student_id}`"
                  @click="emit('remove', index)"
                >
                  移除
                </el-button>
              </div>
            </td>
          </tr>
        </template>
      </draggable>
    </table>

    <p v-if="stops.length === 0" class="bus-route-stops-table__empty" data-test="empty">
      這個班次還沒有任何站點
    </p>

    <div class="bus-route-stops-table__footer" data-test="capacity-footer">
      <span
        v-for="(label, i) in WEEKDAY_LABELS"
        :key="label"
        class="bus-route-stops-table__load"
        :class="{ 'is-overloaded': overloaded[i] }"
        :data-test="`load-${i}`"
      >
        週{{ label }} {{ weekdayLoads[i] }}/{{ capacity }}
      </span>
      <span
        v-if="overloaded.some(Boolean)"
        class="bus-route-stops-table__overload-hint"
        data-test="overload-hint"
      >
        有星期超過座位上限，儲存會被擋下
      </span>
    </div>
  </div>
</template>

<style scoped>
.bus-route-stops-table__table {
  width: 100%;
  border-collapse: collapse;
}
/* 只給輔助科技用；視覺上由頁面既有標題承擔。 */
.bus-route-stops-table__caption {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.bus-route-stops-table__table th,
.bus-route-stops-table__table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
  vertical-align: middle;
}
.bus-route-stops-table__table th.is-narrow,
.bus-route-stops-table__table td.is-narrow {
  width: 1%;
  white-space: nowrap;
}
.bus-route-stops-table__handle {
  cursor: grab;
  margin-right: 6px;
  color: var(--el-text-color-placeholder);
}
.bus-route-stops-table__seq {
  font-variant-numeric: tabular-nums;
}
.bus-route-stops-table__contact + .bus-route-stops-table__contact {
  margin-left: 8px;
}
/*
  操作欄按鈕改為有底色（原本是無背景的 link），需要顯式 gap——el-button 相鄰
  margin 只處理同層兄弟，換行後上下會黏在一起。
*/
.bus-route-stops-table__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.bus-route-stops-table__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.bus-route-stops-table__muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 4px;
}
.bus-route-stops-table__empty {
  color: var(--el-text-color-placeholder);
}
.bus-route-stops-table__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 8px;
}
.bus-route-stops-table__load.is-overloaded {
  color: var(--el-color-danger);
  font-weight: 600;
}
.bus-route-stops-table__overload-hint {
  color: var(--el-color-danger);
}
</style>
