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
  /** 表單有未儲存變更；由頁面納入離頁／切換班次的未儲存保護。 */
  'update:dirty': [dirty: boolean]
}>()

const name = ref('')
const departTime = ref('')
// el-input-number 可以被清成 undefined；那不是「改成 0」也不是「沒改」，
// 直接送出去會讓 payload 掉成 {} 而撞後端 RouteUpdateIn 的「至少一項」422。
const capacity = ref<number | undefined>(1)
const operatorIds = ref<number[]>([])
const isActive = ref(true)

/**
 * 只在**換班次**時重置表單。
 *
 * ⚠ 刻意 watch `route?.id` 而不是 `route` 物件本身：`loadRoutes()` 每次都用
 * `flatMap` 重建全新物件，reference 必變。若 watch 整個物件，使用者改了座位上限
 * 沒按儲存、只是按一下「儲存名單」或拖一下側欄排序（兩者都會重讀），表單編輯就
 * 被伺服器值靜默蓋掉。更新成功後 `changed` 自然變空、儲存鈕自動 disable，
 * 本來就不需要靠 reference 變更來重置。
 */
watch(() => props.route?.id, () => {
  const route = props.route
  name.value = route?.name ?? ''
  departTime.value = route?.depart_time ?? ''
  capacity.value = route?.capacity ?? 1
  operatorIds.value = (route?.operators ?? []).map((o) => o.employee_id)
  isActive.value = route?.is_active ?? true
}, { immediate: true })

const directionLabel = computed(() =>
  props.route ? DIRECTION_LABELS[props.route.direction] : '—',
)

/**
 * 選單＝候選員工 ∪ 這個班次**已設定**的隨車老師。
 * `getEmployees({ is_active: true })` 會濾掉已停用的老師，而 `el-select multiple`
 * 找不到對應 option 時會直接把原始 value（employee id 數字）渲染出來——名單載入
 * 失敗或老師已停用時，畫面就變成一串看不懂的數字。
 */
const operatorOptions = computed(() => {
  const seen = new Set(props.employees.map((e) => e.id))
  const extra = (props.route?.operators ?? [])
    .filter((o) => !seen.has(o.employee_id))
    .map((o) => ({ id: o.employee_id, name: o.name }))
  return [...props.employees, ...extra]
})

const endTimeLabel = computed(() => {
  const t = props.route?.end_time_planned
  return t ? t.slice(0, 5) : '尚未計算'
})

/** 隨車老師是「集合」語意：只有順序不同不算變更，不必送出一次無意義的覆寫。 */
function sameIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort((x, y) => x - y)
  const sortedB = [...b].sort((x, y) => x - y)
  return sortedA.every((v, i) => v === sortedB[i])
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
  if (typeof capacity.value === 'number' && capacity.value !== route.capacity) {
    payload.capacity = capacity.value
  }
  const currentIds = route.operators.map((o) => o.employee_id)
  if (!sameIds(operatorIds.value, currentIds)) {
    payload.operator_employee_ids = [...operatorIds.value]
  }
  if (isActive.value !== route.is_active) payload.is_active = isActive.value
  return payload
})

const hasChanges = computed(() => Object.keys(changed.value).length > 0)

watch(hasChanges, (v) => emit('update:dirty', v), { immediate: true })

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
        <el-option v-for="e in operatorOptions" :key="e.id" :label="e.name" :value="e.id" />
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
