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
 * 拖拉只 emit `reorder`（由 composable 決定「被拖動的站自動釘選」），星期只 emit
 * bitmask（由 composable 檢查跨班次衝突）。元件自行改 props 會繞過那兩道檢查。
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
 * vuedraggable 只回「新陣列」，但 composable 的 `moveStop(from, to)` 需要位移對。
 * 用 student_id 比對出第一個位置不同的元素當 `to`，其在舊陣列的 index 當 `from`。
 */
function onDragUpdate(list: BusStopDraft[]): void {
  const before = props.stops.map((s) => s.student_id)
  const after = list.map((s) => s.student_id)
  const to = after.findIndex((id, i) => id !== before[i])
  if (to === -1) return
  const from = before.indexOf(after[to])
  if (from === -1 || from === to) return
  emit('reorder', from, to)
}
</script>

<template>
  <div class="bus-route-stops-table" data-test="bus-route-stops-table">
    <table class="bus-route-stops-table__table">
      <thead>
        <tr>
          <th scope="col" class="is-narrow">順序</th>
          <th scope="col">學生</th>
          <th scope="col">接送地址</th>
          <th scope="col">聯絡人</th>
          <th scope="col">搭乘日</th>
          <th scope="col" class="is-narrow">預計抵達</th>
          <th scope="col" class="is-narrow">釘選</th>
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
        @update:model-value="onDragUpdate"
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
                <span v-for="c in element.contacts" :key="c.name" class="bus-route-stops-table__contact">
                  {{ c.name }}<template v-if="c.phone"> {{ c.phone }}</template>
                </span>
              </template>
              <span v-else class="bus-route-stops-table__muted">—</span>
            </td>

            <td data-test="ride-days-cell">
              <el-checkbox-group
                :model-value="selectedWeekdays(element)"
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

            <td class="is-narrow">
              <el-button
                link
                :type="element.pinned ? 'primary' : 'info'"
                :disabled="readonly"
                :aria-pressed="element.pinned ? 'true' : 'false'"
                :title="element.pinned ? '已釘選（自動排序不會移動這一站）' : '未釘選'"
                :data-test="`pin-${element.student_id}`"
                @click="emit('toggle-pinned', index)"
              >
                {{ element.pinned ? '📌' : '📍' }}
              </el-button>
            </td>

            <td>
              <el-button
                link
                type="primary"
                :disabled="readonly"
                :data-test="`pick-address-${element.student_id}`"
                @click="emit('pick-address', index)"
              >
                設定接送地址
              </el-button>
              <el-button
                link
                type="primary"
                :disabled="readonly || isUnlocated(element)"
                :data-test="`tune-map-${element.student_id}`"
                @click="emit('tune-map', element.student_id)"
              >
                地圖微調
              </el-button>
              <el-button
                link
                type="danger"
                :disabled="readonly"
                :data-test="`remove-${element.student_id}`"
                @click="emit('remove', index)"
              >
                移除
              </el-button>
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
