<script setup lang="ts">
/**
 * 娃娃車設定面板（FE-SETTINGS-01，spec「園所座標與車輛數」＋「後台 API 一覽—
 * GET/PUT /settings」）。
 *
 * 讀寫 `system_configs` 四個 `bus.*` key（後端 `api/bus/settings.py`）：
 * `bus.school_lat`／`bus.school_lng`／`bus.school_address`／`bus.bus_count`。
 *
 * 三個必須照著後端語意做、不能自己發明的地方：
 *
 * 1. **PUT 是部分更新**：未帶的欄位不動、**顯式帶 null 才是清除**。所以送出前只
 *    收集與伺服器值不同的欄位（比照 BusRouteForm）；全欄照送會把別人同時改的欄位
 *    一起蓋掉，清空地址也必須送 `school_address: null` 而不是省略。
 * 2. **「查座標」是寫入不是預覽**：後端只有 `PUT /bus/settings` 帶 `geocode: true`
 *    這一條 geocode 路徑（`geocodeBusStudent` 是學生專用），它會連同地址與新座標
 *    一起落庫。按鈕文案與二次確認都必須說出「會立即儲存」——標成「查詢」卻偷偷
 *    寫入是說謊。失敗時後端回 502 且**不落任何變更**，提示改用「地圖微調」手動定位。
 * 3. **載入失敗就不給編輯**：送出的 payload 是「和伺服器值的 diff」，讀不到伺服器值
 *    時那個 diff 是拿預設值算出來的假差異，按下儲存會把沒看過的設定覆寫掉。
 *    因此讀取失敗一律停在錯誤狀態＋重試，不做「用預設值先給你編」的降級。
 *
 * 地圖微調（BusStopMapTuner，FE-ROUTES-06）只回寫本地表單，落庫時機仍統一在
 * 「儲存設定」——與名單編輯頁同一條「呼叫端決定落庫時機」的約定。
 *
 * 隱私：本頁座標是**園所自己的**位置（非學生住址），但仍沿用本模組規範，不寫進
 * console／Sentry／URL query／storage。
 *
 * 版面：本元件只出內容區，分頁列／頁面標題由 BusLayout 負責（分頁註冊在 FE-NAV-02）。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getBusSettings, putBusSettings } from '@/api/bus'
import { apiError } from '@/utils/error'
import BusStopMapTuner from '@/components/bus/BusStopMapTuner.vue'
import type { ApiBody, Schema } from '@/api/_generated/typed'

type BusSettings = Schema<'BusSettingsOut'>
type BusSettingsPayload = ApiBody<'/bus/settings', 'put'>

/** 後端 `BusSettingsUpdate.school_address` 的 max_length。 */
const ADDRESS_MAX = 200

/** 伺服器上的現值；null＝還沒讀到（載入中或載入失敗）。 */
const saved = ref<BusSettings | null>(null)

const address = ref('')
const lat = ref<number | null>(null)
const lng = ref<number | null>(null)
// el-input-number 可被清成 undefined——那不是 0 也不是「沒改」，直接送出去會撞後端
// `ge=1` 的 422（比照 BusRouteForm 的 capacity）。
const busCount = ref<number | undefined>(1)

const loading = ref(false)
const loadFailed = ref(false)
const saving = ref(false)
const geocoding = ref(false)
/** 最近一次寫入失敗訊息；留在原地而不是彈一次就消失的 toast。 */
const lastError = ref<string | null>(null)
const tuneVisible = ref(false)

function fill(data: BusSettings): void {
  saved.value = data
  address.value = data.school_address ?? ''
  lat.value = data.school_lat
  lng.value = data.school_lng
  busCount.value = data.bus_count
}

async function load(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const res = await getBusSettings()
    fill(res.data)
  } catch {
    // 不留半套狀態：讀不到就整個停在錯誤態，避免拿預設值當 diff 基準（見檔頭 3.）
    saved.value = null
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}
void load()

const coordsLabel = computed(() =>
  lat.value != null && lng.value != null
    ? `${lat.value.toFixed(6)}, ${lng.value.toFixed(6)}`
    : '尚未設定',
)

const busCountInvalid = computed(
  () => typeof busCount.value !== 'number' || busCount.value < 1,
)

/** 只收集與伺服器值不同的欄位；`geocode` 一律顯式帶值（後端 schema 為必填）。 */
const changed = computed<BusSettingsPayload>(() => {
  const base = saved.value
  const payload: BusSettingsPayload = { geocode: false }
  if (!base) return payload

  const trimmed = address.value.trim()
  const nextAddress = trimmed ? trimmed : null
  if (nextAddress !== base.school_address) payload.school_address = nextAddress

  if (lat.value !== base.school_lat) payload.school_lat = lat.value
  if (lng.value !== base.school_lng) payload.school_lng = lng.value

  if (!busCountInvalid.value && busCount.value !== base.bus_count) {
    payload.bus_count = busCount.value
  }
  return payload
})

const changedFields = computed(() =>
  Object.keys(changed.value).filter((k) => k !== 'geocode'),
)
const hasChanges = computed(() => changedFields.value.length > 0)

/**
 * 二次確認文案依「這次真的會變什麼」組裝：座標沒動卻警告座標影響最佳化，只是
 * 訓練使用者把確認框當成噪音按掉。
 */
function confirmLines(payload: BusSettingsPayload): string[] {
  const lines: string[] = []
  if ('school_address' in payload) {
    lines.push(
      payload.school_address
        ? `園所地址將改為「${payload.school_address}」。`
        : '園所地址將被清除。',
    )
  }
  if ('school_lat' in payload || 'school_lng' in payload) {
    lines.push(
      '園所座標是路線最佳化的起終點：儲存後，之後的自動排序建議與 ETA 都會'
      + '依新座標計算（既有班次已排好的順序不會自動重排）。',
    )
  }
  if ('bus_count' in payload) {
    lines.push(
      `車輛數將改為 ${payload.bus_count}：這是同時進行中班次的總數上限，`
      + '發車超過時會被拒絕。',
    )
  }
  return lines
}

async function confirmWrite(lines: string[], title: string, confirmText: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(lines.join('\n'), title, {
      type: 'warning',
      confirmButtonText: confirmText,
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
}

async function onSave(): Promise<void> {
  const payload = changed.value
  if (!hasChanges.value) return
  if (!(await confirmWrite(confirmLines(payload), '儲存娃娃車設定', '儲存'))) return

  saving.value = true
  lastError.value = null
  try {
    const res = await putBusSettings(payload)
    fill(res.data)
    ElMessage.success('娃娃車設定已儲存')
  } catch (e) {
    // 後端 422 的 detail 可行動（座標超出範圍、車輛數 < 1），吞成通用文案等於丟掉它。
    const message = apiError(e, '儲存娃娃車設定失敗，請稍後再試')
    lastError.value = message
    ElMessage.error(message)
  } finally {
    saving.value = false
  }
}

/**
 * 以園所地址向後端要座標。後端沒有「只查不存」的入口，這一步會連地址一起落庫，
 * 因此照樣走二次確認（見檔頭 2.）。
 */
async function onGeocode(): Promise<void> {
  const trimmed = address.value.trim()
  if (!trimmed) {
    // 後端沒地址會回 422；先擋在前面，錯誤訊息才講得出下一步。
    ElMessage.warning('請先填園所地址再查座標')
    return
  }
  const ok = await confirmWrite(
    [
      `將以「${trimmed}」向地圖服務查詢座標，並立即儲存地址與查到的座標。`,
      '園所座標是路線最佳化的起終點：之後的自動排序建議與 ETA 都會依新座標計算。',
    ],
    '查座標並儲存',
    '查座標並儲存',
  )
  if (!ok) return

  geocoding.value = true
  lastError.value = null
  try {
    const res = await putBusSettings({ school_address: trimmed, geocode: true })
    fill(res.data)
    ElMessage.success('已取得座標並儲存')
  } catch (e) {
    // 502＝地圖服務查不到；後端不落任何變更，畫面也不能動（fill 只在成功路徑）。
    const message = apiError(e, '地址轉座標失敗')
    lastError.value = `${message}（可改用「地圖微調」在地圖上手動定位）`
    ElMessage.error(lastError.value)
  } finally {
    geocoding.value = false
  }
}

function onTuneConfirm(nextLat: number, nextLng: number): void {
  lat.value = nextLat
  lng.value = nextLng
  tuneVisible.value = false
}
</script>

<template>
  <div class="bus-settings-panel" data-test="bus-settings-panel">
    <el-skeleton v-if="loading" :rows="4" animated data-test="loading" />

    <el-alert
      v-else-if="loadFailed"
      type="error"
      :closable="false"
      show-icon
      title="讀取娃娃車設定失敗"
      data-test="load-failed"
    >
      <p>讀不到目前設定就無法判斷你改了哪些欄位，儲存會覆寫沒看過的設定，因此先不開放編輯。</p>
      <el-button size="small" data-test="reload-btn" @click="load">重新載入</el-button>
    </el-alert>

    <el-form v-else class="bus-settings-panel__form" label-width="110px" @submit.prevent="onSave">
      <el-alert
        v-if="lastError"
        class="bus-settings-panel__error"
        type="error"
        :closable="false"
        show-icon
        :title="lastError"
        data-test="last-error"
      />

      <el-form-item label="園所地址">
        <div class="bus-settings-panel__row">
          <el-input
            v-model="address"
            :maxlength="ADDRESS_MAX"
            show-word-limit
            placeholder="例：高雄市左營區博愛二路 777 號"
            data-test="address-input"
          />
          <el-button
            :loading="geocoding"
            data-test="geocode-btn"
            @click="onGeocode"
          >
            查座標
          </el-button>
        </div>
        <span class="bus-settings-panel__hint">
          按「查座標」會立即儲存地址與查到的座標；查不到時可用下方「地圖微調」手動定位。
        </span>
      </el-form-item>

      <el-form-item label="園所座標">
        <span data-test="coords-readonly">{{ coordsLabel }}</span>
        <el-button
          class="bus-settings-panel__tune"
          size="small"
          data-test="tune-btn"
          @click="tuneVisible = true"
        >
          地圖微調
        </el-button>
        <span class="bus-settings-panel__hint">路線最佳化的起終點</span>
      </el-form-item>

      <el-form-item label="車輛數">
        <el-input-number v-model="busCount" :min="1" :step="1" data-test="bus-count-input" />
        <span v-if="busCountInvalid" class="bus-settings-panel__warn" data-test="bus-count-warn">
          車輛數至少 1，未填時這一欄不會送出
        </span>
        <span v-else class="bus-settings-panel__hint">
          同時進行中班次總數上限；發車超過時會被拒絕
        </span>
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!hasChanges"
          data-test="save-btn"
          @click="onSave"
        >
          儲存設定
        </el-button>
      </el-form-item>
    </el-form>

    <BusStopMapTuner
      :visible="tuneVisible"
      :lat="lat"
      :lng="lng"
      label="園所位置"
      :school-coords="null"
      @confirm="onTuneConfirm"
      @cancel="tuneVisible = false"
    />
  </div>
</template>

<style scoped>
.bus-settings-panel__form {
  max-width: 640px;
}

.bus-settings-panel__error {
  margin-bottom: 12px;
}

.bus-settings-panel__row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.bus-settings-panel__tune {
  margin-left: 8px;
}

.bus-settings-panel__hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.bus-settings-panel__warn {
  margin-left: 8px;
  color: var(--el-color-warning);
  font-size: 12px;
}
</style>
