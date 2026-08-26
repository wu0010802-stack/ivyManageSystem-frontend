<script setup lang="ts">
/**
 * 班次基本設定表單（FE-ROUTES-03，spec「已確認的關鍵決策—班次欄位」）。
 *
 * 取代第一期 BusRoutesView 內嵌的「改名／啟用停用」Dialog。
 *
 * 兩個刻意的唯讀：
 * - **方向**：migration 已依方向拆分班次（原 route id 保留給 morning），既有班次
 *   不可換向；後端 `RouteUpdateIn` 也沒有 `direction` 欄位。
 * - **結束時間**：`end_time_planned` 是最佳化演算法算出來的預估值，不是可輸入的
 *   設定值——標「演算法預估」，避免使用者以為它是承諾時間。
 *
 * `submit` 只帶**有變動**的欄位（後端 `RouteUpdateIn` 全欄選填、至少一項）：
 * 全欄照送會把「沒碰的欄位」也一起覆寫，兩個人同時編輯時會互相蓋掉。
 */
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { DIRECTION_LABELS } from '@/composables/useBusRouteEditor'
import type { BusRouteRow } from '@/composables/useBusRouteEditor'

export interface BusRouteFormPayload {
  name?: string
  depart_time?: string
  capacity?: number
  operator_employee_ids?: number[]
  is_active?: boolean
}

const props = defineProps<{
  route: BusRouteRow | null
  employees: Array<{ id: number; name: string }>
  saving: boolean
}>()

const emit = defineEmits<{
  submit: [payload: BusRouteFormPayload]
}>()

const name = ref('')
const departTime = ref('')
const capacity = ref(1)
const operatorIds = ref<number[]>([])
const isActive = ref(true)

/** 以 route 為權威重置表單；切換班次或外部重讀後都要跟著回到伺服器值。 */
watch(() => props.route, (route) => {
  name.value = route?.name ?? ''
  departTime.value = route?.depart_time ?? ''
  capacity.value = route?.capacity ?? 1
  operatorIds.value = (route?.operators ?? []).map((o) => o.employee_id)
  isActive.value = route?.is_active ?? true
}, { immediate: true })

const directionLabel = computed(() =>
  props.route ? DIRECTION_LABELS[props.route.direction] : '—',
)

const endTimeLabel = computed(() => {
  const t = props.route?.end_time_planned
  return t ? t.slice(0, 5) : '尚未計算'
})

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])
}

/** 只收集與伺服器值不同的欄位。 */
const changed = computed<BusRouteFormPayload>(() => {
  const route = props.route
  if (!route) return {}
  const payload: BusRouteFormPayload = {}
  const trimmed = name.value.trim()
  if (trimmed && trimmed !== route.name) payload.name = trimmed
  if (departTime.value && departTime.value !== route.depart_time) {
    payload.depart_time = departTime.value
  }
  if (capacity.value !== route.capacity) payload.capacity = capacity.value
  const currentIds = route.operators.map((o) => o.employee_id)
  if (!sameIds(operatorIds.value, currentIds)) {
    payload.operator_employee_ids = [...operatorIds.value]
  }
  if (isActive.value !== route.is_active) payload.is_active = isActive.value
  return payload
})

const hasChanges = computed(() => Object.keys(changed.value).length > 0)

async function onSubmit(): Promise<void> {
  const payload = changed.value
  if (!Object.keys(payload).length) return
  // 停用會讓司機開班選單看不到這個班次——沿用第一期的二次確認文案。
  if (payload.is_active === false) {
    try {
      await ElMessageBox.confirm(
        `停用「${props.route?.name ?? '此班次'}」後，司機在開班選單將看不到這個班次，確定要停用嗎？`,
        '停用班次',
        { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  emit('submit', payload)
}
</script>

<template>
  <el-form
    v-if="route"
    class="bus-route-form"
    label-width="110px"
    data-test="bus-route-form"
    @submit.prevent="onSubmit"
  >
    <el-form-item label="班次名稱">
      <el-input v-model="name" maxlength="50" show-word-limit data-test="name-input" />
    </el-form-item>

    <el-form-item label="方向">
      <span data-test="direction-readonly">{{ directionLabel }}</span>
      <el-tag class="bus-route-form__hint" size="small" type="info">建立後不可更改</el-tag>
    </el-form-item>

    <el-form-item label="出發時間">
      <el-time-picker
        v-model="departTime"
        value-format="HH:mm:ss"
        format="HH:mm"
        placeholder="選擇出發時間"
        data-test="depart-time"
      />
    </el-form-item>

    <el-form-item label="預計結束">
      <span data-test="end-time-readonly">{{ endTimeLabel }}</span>
      <el-tag class="bus-route-form__hint" size="small" type="info">演算法預估</el-tag>
    </el-form-item>

    <el-form-item label="座位上限">
      <el-input-number v-model="capacity" :min="1" :step="1" data-test="capacity-input" />
      <span class="bus-route-form__hint">硬限制，名單不可超過</span>
    </el-form-item>

    <el-form-item label="預設隨車老師">
      <el-select
        v-model="operatorIds"
        multiple
        clearable
        placeholder="選擇隨車老師"
        data-test="operators-select"
      >
        <el-option v-for="e in employees" :key="e.id" :label="e.name" :value="e.id" />
      </el-select>
    </el-form-item>

    <el-form-item label="啟用">
      <el-switch
        v-model="isActive"
        active-text="啟用中"
        inactive-text="已停用（司機開班選單看不到）"
        data-test="active-switch"
      />
    </el-form-item>

    <el-form-item>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!hasChanges"
        data-test="submit-btn"
        @click="onSubmit"
      >
        儲存班次設定
      </el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.bus-route-form__hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
