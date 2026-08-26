<script setup lang="ts">
/**
 * 學生接送地址下拉＋就地新增（FE-ROUTES-07，spec「新表：student_pickup_addresses」
 * 與「後台 API 一覽—pickup-addresses」）。
 *
 * ⚠ **`pickup_address_id = null` 的語意是「住家地址」，不是「無地址」**。
 * 後端 `GET /bus/students/{id}/pickup-addresses` 回應的第一筆就是住家虛擬項
 * （`id: null`／`is_home: true`／address＝`students.address`），不入地址簿表。
 * 因此本元件的 `null` 是一個**正常選項**，不可當空值濾掉或顯示 placeholder。
 *
 * 建立地址時後端即 geocode，失敗不擋建立（`lat`/`lng` 為 null，可後補）——
 * 這種情況要明說「尚未定位」，不要讓使用者以為地址設好就一定能發車
 * （spec：班次內任一站無座標即無法發車）。
 *
 * 刪除：被任何 `pickup_address_id` 引用中的地址禁刪，後端 422 訊息會列出引用班次，
 * 一律**直接呈現後端訊息**，不自行推測原因。
 *
 * 隱私：地址是個資，只渲染在選單內；不進 console／Sentry／URL query／storage。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  createStudentPickupAddress, deleteStudentPickupAddress, listStudentPickupAddresses,
} from '@/api/bus'
import { apiError } from '@/utils/error'

export interface PickupAddressOption {
  id: number | null
  label: string
  address: string | null
  lat: number | null
  lng: number | null
  is_home: boolean
}

const props = defineProps<{
  studentId: number
  modelValue: number | null
  /** 後端住家項缺 address 時的備援顯示（例：學生資料未填住址）。 */
  homeAddress: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [id: number | null]
  resolved: [payload: { id: number | null; lat: number | null; lng: number | null; address: string }]
}>()

const options = ref<PickupAddressOption[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const creating = ref(false)
const deletingId = ref<number | null>(null)
const showCreateForm = ref(false)
const newLabel = ref('')
const newAddress = ref('')

/**
 * el-option 的 `value` 不吃 `null`，但 `null`（＝住家）是本元件的正常選項。
 * 內部用一個不可能與 address id 相撞的哨兵值（後端 id 恆 > 0）承載它，
 * **只活在元件內部**——emit 出去的一律是契約上的 `number | null`。
 */
const HOME_VALUE = -1

const MAX_LABEL_LENGTH = 30
const MAX_ADDRESS_LENGTH = 200

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function normalize(raw: unknown): PickupAddressOption[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const r = asRecord(item)
    if (!r) return []
    return [{
      id: asNum(r.id),
      label: asStr(r.label) ?? '',
      address: asStr(r.address),
      lat: asNum(r.lat),
      lng: asNum(r.lng),
      is_home: r.is_home === true,
    }]
  })
}

/**
 * 住家項恆在第一位。後端已經把它排第一，但這裡不依賴那個順序——
 * 「住家不見了」在畫面上等同「這孩子不能用住家地址」，是誤導性的空狀態。
 */
const sortedOptions = computed(() => {
  const home = options.value.filter((o) => o.is_home)
  const rest = options.value.filter((o) => !o.is_home)
  return [...home, ...rest]
})

const selected = computed(
  () => sortedOptions.value.find((o) => o.id === props.modelValue) ?? null,
)

const selectValue = computed(() => props.modelValue ?? HOME_VALUE)

/**
 * 地址簿實際存在的那幾筆（不含住家虛擬項）。刪除操作掛在這份清單上而不是
 * `el-option` 的 slot 裡——下拉未展開時 option slot 不在 DOM，等於一個看得到
 * 卻點不到的按鈕。
 */
const bookAddresses = computed(() => sortedOptions.value.filter((o) => !o.is_home && o.id !== null))

function optionLabel(option: PickupAddressOption): string {
  const address = option.address ?? (option.is_home ? props.homeAddress : null)
  const base = option.is_home ? '住家' : (option.label || '未命名地址')
  const suffix = address ? `（${address}）` : '（尚未填寫地址）'
  return `${base}${suffix}`
}

/** 已建立但 geocode 失敗＝地址有了、座標沒有，仍然無法發車。 */
function isUnlocated(option: PickupAddressOption): boolean {
  return option.lat === null || option.lng === null
}

async function load(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const res = await listStudentPickupAddresses(props.studentId)
    const data = asRecord((res as { data?: unknown }).data) ?? {}
    options.value = normalize(data.addresses)
  } catch (e) {
    loadFailed.value = true
    options.value = []
    ElMessage.error(apiError(e, '載入接送地址失敗，請稍後再試'))
  } finally {
    loading.value = false
  }
}

watch(() => props.studentId, () => {
  showCreateForm.value = false
  void load()
}, { immediate: true })

function onSelect(raw: number): void {
  const id = raw === HOME_VALUE ? null : raw
  emit('update:modelValue', id)
  const option = sortedOptions.value.find((o) => o.id === id)
  if (!option) return
  emit('resolved', {
    id: option.id,
    lat: option.lat,
    lng: option.lng,
    address: option.address ?? (option.is_home ? (props.homeAddress ?? '') : ''),
  })
}

async function onCreate(): Promise<void> {
  const address = newAddress.value.trim()
  if (!address) {
    ElMessage.error('請輸入地址')
    return
  }
  creating.value = true
  try {
    const res = await createStudentPickupAddress(props.studentId, {
      label: newLabel.value.trim() || null,
      address,
    })
    const created = normalize([(res as { data?: unknown }).data])[0] ?? null
    await load()
    if (created && created.id !== null) {
      // 剛建立的地址自動選中——使用者的意圖就是「這個站要用這個地址」。
      onSelect(created.id)
      if (isUnlocated(created)) {
        ElMessage.warning('地址已新增，但尚未定位成功，請用地圖微調補上座標後才能發車')
      } else {
        ElMessage.success('已新增接送地址')
      }
    }
    showCreateForm.value = false
    newLabel.value = ''
    newAddress.value = ''
  } catch (e) {
    ElMessage.error(apiError(e, '新增接送地址失敗，請稍後再試'))
  } finally {
    creating.value = false
  }
}

async function onDelete(id: number): Promise<void> {
  deletingId.value = id
  try {
    await deleteStudentPickupAddress(props.studentId, id)
    if (props.modelValue === id) onSelect(HOME_VALUE)
    await load()
    ElMessage.success('已刪除接送地址')
  } catch (e) {
    // 422＝引用中禁刪，後端訊息會列出引用班次；直接呈現，不自行推測。
    ElMessage.error(apiError(e, '刪除失敗，此地址可能仍被班次使用中'))
  } finally {
    deletingId.value = null
  }
}
</script>

<template>
  <div class="bus-pickup-address-select" data-test="bus-pickup-address-select">
    <el-alert
      v-if="loadFailed"
      type="error"
      :closable="false"
      show-icon
      data-test="load-failed"
      title="載入接送地址失敗，暫時無法選擇地址"
    />

    <el-select
      :model-value="selectValue"
      :loading="loading"
      class="bus-pickup-address-select__select"
      data-test="address-select"
      @update:model-value="onSelect"
    >
      <el-option
        v-for="option in sortedOptions"
        :key="option.id === null ? 'home' : option.id"
        :label="optionLabel(option)"
        :value="option.id ?? HOME_VALUE"
      />
    </el-select>

    <ul
      v-if="bookAddresses.length"
      class="bus-pickup-address-select__book"
      data-test="address-book"
    >
      <li v-for="option in bookAddresses" :key="option.id as number">
        <span>{{ optionLabel(option) }}</span>
        <el-tag v-if="isUnlocated(option)" size="small" type="warning">尚未定位</el-tag>
        <el-button
          link
          type="danger"
          size="small"
          :loading="deletingId === option.id"
          :data-test="`delete-${option.id}`"
          @click="onDelete(option.id as number)"
        >
          刪除
        </el-button>
      </li>
    </ul>

    <el-tag
      v-if="selected && isUnlocated(selected)"
      type="warning"
      size="small"
      data-test="selected-unlocated"
    >
      此地址尚未定位，無法發車
    </el-tag>

    <el-button
      v-if="!showCreateForm"
      link
      type="primary"
      data-test="show-create-btn"
      @click="showCreateForm = true"
    >
      新增地址
    </el-button>

    <div v-else class="bus-pickup-address-select__form" data-test="create-form">
      <el-input
        v-model="newLabel"
        :maxlength="MAX_LABEL_LENGTH"
        show-word-limit
        placeholder="名稱（例：阿嬤家）"
        data-test="new-label"
      />
      <el-input
        v-model="newAddress"
        :maxlength="MAX_ADDRESS_LENGTH"
        placeholder="地址（必填）"
        data-test="new-address"
      />
      <div class="bus-pickup-address-select__form-actions">
        <el-button :loading="creating" type="primary" data-test="create-btn" @click="onCreate">
          新增
        </el-button>
        <el-button data-test="cancel-create-btn" @click="showCreateForm = false">取消</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bus-pickup-address-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bus-pickup-address-select__select {
  width: 100%;
}
.bus-pickup-address-select__form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bus-pickup-address-select__form-actions {
  display: flex;
  gap: 8px;
}
.bus-pickup-address-select__book {
  margin: 0;
  padding: 0;
  list-style: none;
}
.bus-pickup-address-select__book li {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
