<script setup lang="ts">
/**
 * 班次清單側欄（FE-ROUTES-02，spec「前端（admin）模組拆分—班次設定」）。
 *
 * 「早上接學生」／「下午送學生」兩組（文案沿用 `DIRECTION_LABELS`），
 * 組內依 `sort_order` 排序、可拖拉調整順序（**僅組內、不可跨組**——方向是
 * 班次自己的欄位，migration 已依方向拆分，拖過去並不會換向）。
 *
 * `select` 一律經 emit 讓頁面先跑未儲存確認（比照現況 BusRoutesView
 * 「:model-value 單向綁定＋事件回寫」的理由：元件自行改狀態會繞過 confirmDiscard，
 * 使用者按錯一個班次就丟掉剛排好的名單）。
 */
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { DIRECTION_LABELS } from '@/composables/useBusRouteEditor'
import type { BusDirection, BusRouteRow } from '@/composables/useBusRouteEditor'

const props = defineProps<{
  routes: BusRouteRow[]
  activeRouteId: number | null
  reordering: boolean
}>()

const emit = defineEmits<{
  select: [routeId: number]
  reorder: [payload: { direction: BusDirection; ids: number[] }]
  create: []
}>()

const DIRECTIONS: BusDirection[] = ['morning', 'afternoon']

/** 組內依 sort_order 排序；同 sort_order 時以 id 決定，避免順序不穩定。 */
function sorted(direction: BusDirection): BusRouteRow[] {
  return props.routes
    .filter((r) => r.direction === direction)
    .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
}

const groups = computed(() =>
  DIRECTIONS.map((direction) => ({
    direction,
    label: DIRECTION_LABELS[direction],
    routes: sorted(direction),
  })),
)

/** 出發時間顯示到分即可（後端回 `HH:MM:SS`）。 */
function departLabel(route: BusRouteRow): string {
  return route.depart_time ? route.depart_time.slice(0, 5) : '—'
}

function onDragEnd(direction: BusDirection, list: BusRouteRow[]): void {
  emit('reorder', { direction, ids: list.map((r) => r.id) })
}
</script>

<template>
  <aside class="bus-route-sidebar" data-test="bus-route-sidebar">
    <div
      v-for="group in groups"
      :key="group.direction"
      class="bus-route-sidebar__group"
      :data-test="`group-${group.direction}`"
    >
      <h3 class="bus-route-sidebar__group-title">{{ group.label }}</h3>

      <p
        v-if="group.routes.length === 0"
        class="bus-route-sidebar__empty"
        :data-test="`empty-${group.direction}`"
      >
        尚未建立班次
      </p>

      <draggable
        v-else
        :model-value="group.routes"
        :disabled="reordering"
        item-key="id"
        :animation="150"
        handle=".bus-route-sidebar__handle"
        ghost-class="bus-route-sidebar__item--ghost"
        class="bus-route-sidebar__list"
        @update:model-value="(list: BusRouteRow[]) => onDragEnd(group.direction, list)"
      >
        <template #item="{ element }">
          <button
            type="button"
            class="bus-route-sidebar__item"
            :class="{ 'is-active': element.id === activeRouteId }"
            :data-test="`route-${element.id}`"
            :aria-current="element.id === activeRouteId ? 'true' : undefined"
            @click="emit('select', element.id)"
          >
            <span class="bus-route-sidebar__handle" aria-hidden="true" data-test="drag-handle">⋮⋮</span>
            <span class="bus-route-sidebar__name">{{ element.name }}</span>
            <span class="bus-route-sidebar__time">{{ departLabel(element) }}</span>
            <el-tag
              v-if="!element.is_active"
              size="small"
              type="info"
              :data-test="`inactive-${element.id}`"
            >
              已停用
            </el-tag>
          </button>
        </template>
      </draggable>
    </div>

    <el-button
      class="bus-route-sidebar__create"
      type="primary"
      plain
      data-test="create-route-btn"
      @click="emit('create')"
    >
      新增班次
    </el-button>
  </aside>
</template>

<style scoped>
.bus-route-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.bus-route-sidebar__group-title {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.bus-route-sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.bus-route-sidebar__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
  cursor: pointer;
  text-align: left;
}
.bus-route-sidebar__item.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.bus-route-sidebar__handle {
  cursor: grab;
  color: var(--el-text-color-placeholder);
}
.bus-route-sidebar__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bus-route-sidebar__time {
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.bus-route-sidebar__empty {
  margin: 0;
  color: var(--el-text-color-placeholder);
  font-size: 13px;
}
</style>
