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
 * ── 住家自動定位（2026-09-02）────────────────────────────────────────────
 * 後端住家虛擬項是**寫死** `lat/lng: null` 的（住家地址不入地址簿表，自然沒有
 * geocode 結果，見 `api/bus/pickup_addresses.py`）。若照單全收，每一位學生的
 * 「住家」都會被標成「尚未定位，無法發車」——那是誤報：住家明明可以定位，只是還
 * 沒查；使用者被這句話逼去手動新增一筆一模一樣的地址（staging 回報）。所以清單
 * 載入後若住家有地址文字但沒座標，元件自己打 `POST /bus/routes/geocode`（依
 * `students.address` 查座標、不落庫）補上，三個使用端（班次設定／今日調度改地址
 * ／臨時插入）才會一致拿到座標。結果快取在元件內：新增／編輯／刪除後的重載不重打。
 *
 * 補到座標時若「目前選的就是住家」，另外 emit `resolved` 帶 `reason: 'located'`
 * ——這不是使用者的選擇（不動 v-model、頁面不該關 Dialog），只是把座標交給頁面去
 * 填「還沒有座標」的站；已有（微調好的）座標的站由頁面自行忽略。定位失敗也回報
 * 一次（座標 null），讓臨時插入 Dialog 能講出「請新增可定位的地址」的下一步。
 *
 * 編輯：沿用同一份新增表單（`editingId` 區分新增／編輯，不重複刻一套 UI）；
 * PATCH 端點只在**地址文字**有異動時才重新 geocode，只改 label 不必白打一次
 * 外部 API。編輯完成後自動重選該筆——`useBusRouteEditor.setPickupAddress` 的
 * `sameAddress` 保護只鎖座標（避免蓋掉地圖微調過的值），文字一律採用最新值，
 * 所以編輯地址文字後既有站點的顯示會同步更新。
 *
 * 刪除：被任何 `pickup_address_id` 引用中的地址禁刪，後端 422 訊息會列出引用班次，
 * 一律**直接呈現後端訊息**，不自行推測原因。
 *
 * 重新定位：地址文字不變、無條件重跑一次 geocode（`relocate` 端點），用於「尚未
 * 定位」或懷疑座標不準時手動重試。**刻意不透過 `onSelect`／`resolved` 回寫座標**
 * ——那條路徑會經過 `useBusRouteEditor.setPickupAddress` 的 `sameAddress` 保護
 * （見上方「編輯」段），選同一筆地址時鎖住既有座標不被動覆蓋；但這裡是使用者
 * 主動要求刷新座標，語意剛好相反，因此另外 emit `relocated` 讓頁面直接呼叫
 * `setCoordinates` 覆寫，跳過那道保護。
 *
 * 隱私：地址是個資，只渲染在選單內；不進 console／Sentry／URL query／storage。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createStudentPickupAddress, deleteStudentPickupAddress, geocodeBusStudent,
  listStudentPickupAddresses, updateStudentPickupAddress, relocateStudentPickupAddress,
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
  /**
   * `reason` 讓頁面分辨三種來源：`'selected'`＝使用者主動選了一筆（頁面可以收
   * Dialog）；`'fallback'`＝刪除「目前選中」的地址後被動退回住家（使用者還在
   * 管理地址簿，頁面不該把整個 Dialog 關掉）；`'located'`＝目前選的是住家而元件
   * 剛替它補到座標（不是選擇，頁面只該拿來填「還沒有座標」的站、不關 Dialog）。
   */
  resolved: [payload: {
    id: number | null
    lat: number | null
    lng: number | null
    address: string
    reason: 'selected' | 'fallback' | 'located'
  }]
  /** 重新定位完成，把最新座標交給頁面直接覆寫該站（跳過 sameAddress 保護）。 */
  relocated: [payload: { id: number; lat: number | null; lng: number | null }]
}>()

const options = ref<PickupAddressOption[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const homeLocating = ref(false)
/**
 * 住家 geocode 結果快取：同一位學生只查一次，`load()` 重載清單（新增／編輯／刪除
 * 後）把它重新套回住家項。`null`＝還沒查或查不到。
 */
const homeCoords = ref<{ lat: number; lng: number } | null>(null)
/** 進行中的住家定位；定位中選住家要等它完成再回報，別帶著 null 座標出去。 */
let homeLocatePromise: Promise<void> | null = null
const submitting = ref(false)
const deletingId = ref<number | null>(null)
const relocatingId = ref<number | null>(null)
const showCreateForm = ref(false)
const newLabel = ref('')
const newAddress = ref('')
/** `null`＝表單目前是「新增」；非 null＝正在編輯地址簿第幾筆（後端 id）。 */
const editingId = ref<number | null>(null)

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

const homeOption = computed(() => sortedOptions.value.find((o) => o.is_home) ?? null)
/** 住家能不能定位：後端 geocode 端點讀 `students.address`，主檔沒住址必 422，不必白打。 */
const canLocateHome = computed(() => !!homeOption.value?.address)

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

/** 把快取的住家座標套回（後端住家項恆無座標；若哪天後端自己帶了就不覆蓋）。 */
function applyHomeCoords(list: PickupAddressOption[]): PickupAddressOption[] {
  const coords = homeCoords.value
  if (!coords) return list
  return list.map((o) => (o.is_home && isUnlocated(o) ? { ...o, lat: coords.lat, lng: coords.lng } : o))
}

function emitResolved(option: PickupAddressOption, reason: 'selected' | 'fallback' | 'located'): void {
  emit('resolved', {
    id: option.id,
    lat: option.lat,
    lng: option.lng,
    address: option.address ?? (option.is_home ? (props.homeAddress ?? '') : ''),
    reason,
  })
}

/**
 * 依學生主檔住址查座標（`POST /bus/routes/geocode`，不落庫）補進住家項。
 * 途中換了學生就把結果作廢——否則會把 A 的座標套到 B 的住家上。
 * 失敗（主檔無住址 422／provider 502／網路）一律「維持尚未定位」，畫面上留
 * 「重新定位」可重試；不彈 toast，開一次 Dialog 不該就被罵一次。
 */
async function locateHome(): Promise<void> {
  const studentId = props.studentId
  homeLocating.value = true
  const run = (async () => {
    let coords: { lat: number; lng: number } | null = null
    try {
      const res = await geocodeBusStudent(studentId)
      const data = asRecord((res as { data?: unknown }).data)
      const lat = asNum(data?.lat)
      const lng = asNum(data?.lng)
      if (lat !== null && lng !== null) coords = { lat, lng }
    } catch {
      coords = null
    }
    if (studentId !== props.studentId) return
    homeCoords.value = coords
    options.value = applyHomeCoords(options.value)
    homeLocating.value = false
    const home = homeOption.value
    if (home && props.modelValue === null) emitResolved(home, 'located')
  })()
  homeLocatePromise = run
  try {
    await run
  } finally {
    if (homeLocatePromise === run) homeLocatePromise = null
  }
}

function locateHomeIfNeeded(): void {
  const home = homeOption.value
  if (!home || !isUnlocated(home) || !canLocateHome.value || homeLocatePromise) return
  void locateHome()
}

async function load(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const res = await listStudentPickupAddresses(props.studentId)
    const data = asRecord((res as { data?: unknown }).data) ?? {}
    options.value = applyHomeCoords(normalize(data.addresses))
  } catch (e) {
    loadFailed.value = true
    options.value = []
    ElMessage.error(apiError(e, '載入接送地址失敗，請稍後再試'))
  } finally {
    loading.value = false
  }
  locateHomeIfNeeded()
}

watch(() => props.studentId, () => {
  showCreateForm.value = false
  editingId.value = null
  homeCoords.value = null
  homeLocating.value = false
  homeLocatePromise = null
  void load()
}, { immediate: true })

async function onSelect(raw: number, reason: 'selected' | 'fallback' = 'selected'): Promise<void> {
  const id = raw === HOME_VALUE ? null : raw
  emit('update:modelValue', id)
  // 定位中選住家：等結果再回報，否則頁面拿到 null 座標又得自己補一次。
  if (id === null && homeLocatePromise) await homeLocatePromise
  const option = sortedOptions.value.find((o) => o.id === id)
  if (!option) return
  emitResolved(option, reason)
}

async function onRelocateHome(): Promise<void> {
  if (homeLocatePromise) return
  await locateHome()
}

function onStartCreate(): void {
  editingId.value = null
  newLabel.value = ''
  newAddress.value = ''
  showCreateForm.value = true
}

/** 把地址簿既有一筆帶入表單進入編輯模式（沿用同一份新增表單，不重複刻一套 UI）。 */
function onStartEdit(option: PickupAddressOption): void {
  if (option.id === null) return
  editingId.value = option.id
  newLabel.value = option.label
  newAddress.value = option.address ?? ''
  showCreateForm.value = true
}

function onCancelForm(): void {
  showCreateForm.value = false
  editingId.value = null
  newLabel.value = ''
  newAddress.value = ''
}

async function onSubmitForm(): Promise<void> {
  const address = newAddress.value.trim()
  if (!address) {
    ElMessage.error('請輸入地址')
    return
  }
  submitting.value = true
  try {
    const payload = { label: newLabel.value.trim() || null, address }
    const res = editingId.value === null
      ? await createStudentPickupAddress(props.studentId, payload)
      : await updateStudentPickupAddress(props.studentId, editingId.value, payload)
    const wasEditingId = editingId.value
    const saved = normalize([(res as { data?: unknown }).data])[0] ?? null
    await load()
    if (saved && saved.id !== null) {
      // 剛新增／編輯完的地址自動選中——使用者的意圖就是「這個站要用這個地址」；
      // 純改 label／地址文字（id 沒變）時 onSelect 內的 sameAddress 保護也不會
      // 誤清掉已經微調過的座標。
      onSelect(saved.id)
      if (isUnlocated(saved)) {
        ElMessage.warning(
          wasEditingId === null
            ? '地址已新增，但尚未定位成功，請用地圖微調補上座標後才能發車'
            : '地址已更新，但尚未定位成功，請用地圖微調補上座標後才能發車',
        )
      } else {
        ElMessage.success(wasEditingId === null ? '已新增接送地址' : '已更新接送地址')
      }
    }
    onCancelForm()
  } catch (e) {
    ElMessage.error(apiError(
      e, editingId.value === null ? '新增接送地址失敗，請稍後再試' : '更新接送地址失敗，請稍後再試',
    ))
  } finally {
    submitting.value = false
  }
}

async function onDelete(id: number): Promise<void> {
  // 地址是使用者手動輸入、後端 geocode 過的資料，刪掉沒有還原入口——與同 codebase
  // 的「停用班次」「清空站點」同一條二次確認標準。
  const option = sortedOptions.value.find((o) => o.id === id)
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${option ? optionLabel(option) : '這筆地址'}」嗎？刪除後需要重新輸入地址。`,
      '刪除接送地址',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingId.value = id
  try {
    await deleteStudentPickupAddress(props.studentId, id)
    // 被動退回住家（不能留一個指向已刪除地址的 id）；標 fallback，頁面不關 Dialog。
    if (props.modelValue === id) void onSelect(HOME_VALUE, 'fallback')
    if (editingId.value === id) onCancelForm()
    await load()
    ElMessage.success('已刪除接送地址')
  } catch (e) {
    // 422＝引用中禁刪，後端訊息會列出引用班次；直接呈現，不自行推測。
    ElMessage.error(apiError(e, '刪除失敗，此地址可能仍被班次使用中'))
  } finally {
    deletingId.value = null
  }
}

async function onRelocate(id: number): Promise<void> {
  relocatingId.value = id
  try {
    const res = await relocateStudentPickupAddress(props.studentId, id)
    const relocated = normalize([(res as { data?: unknown }).data])[0] ?? null
    await load()
    if (relocated) {
      emit('relocated', { id, lat: relocated.lat, lng: relocated.lng })
      if (isUnlocated(relocated)) {
        ElMessage.warning('重新定位仍查無座標，請改用「地圖微調」手動設定')
      } else {
        ElMessage.success('已重新定位')
      }
    }
  } catch (e) {
    ElMessage.error(apiError(e, '重新定位失敗，請稍後再試'))
  } finally {
    relocatingId.value = null
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
          type="primary"
          size="small"
          :loading="relocatingId === option.id"
          :data-test="`relocate-${option.id}`"
          @click="onRelocate(option.id as number)"
        >
          重新定位
        </el-button>
        <el-button
          link
          type="primary"
          size="small"
          :data-test="`edit-${option.id}`"
          @click="onStartEdit(option)"
        >
          編輯
        </el-button>
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

    <!--
      住家定位中不得顯示「尚未定位，無法發車」——那是誤報，使用者會照字面去手動
      新增一筆一樣的地址。定位失敗才顯示，並附「重新定位住家」讓人有下一步。
    -->
    <el-tag
      v-if="selected?.is_home && homeLocating"
      type="info"
      size="small"
      data-test="home-locating"
    >
      住家定位中…
    </el-tag>
    <div
      v-else-if="selected && isUnlocated(selected)"
      class="bus-pickup-address-select__unlocated"
    >
      <el-tag type="warning" size="small" data-test="selected-unlocated">
        {{ selected.is_home && !selected.address ? '學生資料未填住址，無法定位' : '此地址尚未定位，無法發車' }}
      </el-tag>
      <el-button
        v-if="selected.is_home && canLocateHome"
        link
        type="primary"
        size="small"
        data-test="relocate-home"
        @click="onRelocateHome"
      >
        重新定位住家
      </el-button>
    </div>

    <el-button
      v-if="!showCreateForm"
      link
      type="primary"
      data-test="show-create-btn"
      @click="onStartCreate"
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
        <el-button :loading="submitting" type="primary" data-test="create-btn" @click="onSubmitForm">
          {{ editingId === null ? '新增' : '儲存' }}
        </el-button>
        <el-button data-test="cancel-create-btn" @click="onCancelForm">取消</el-button>
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
.bus-pickup-address-select__unlocated {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
