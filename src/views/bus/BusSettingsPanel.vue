<script setup lang="ts">
/**
 * 娃娃車設定面板（FE-SETTINGS-01，spec「園所座標與車輛數」＋「後台 API 一覽—
 * GET/PUT /settings」）。
 *
 * 讀寫 `system_configs` 四個 `bus.*` key（後端 `api/bus/settings.py`）：
 * `bus.school_lat`／`bus.school_lng`／`bus.school_address`／`bus.bus_count`。
 *
 * 四個必須照著後端語意做、不能自己發明的地方：
 *
 * 1. **PUT 是部分更新**：未帶的欄位不動、**顯式帶 null 才是清除**。所以送出前只
 *    收集與伺服器值不同的欄位（比照 BusRouteForm）；全欄照送會把別人同時改的欄位
 *    一起蓋掉，清空地址也必須送 `school_address: null` 而不是省略。
 * 2. **「查座標」是寫入不是預覽**：後端只有 `PUT /bus/settings` 帶 `geocode: true`
 *    這一條 geocode 路徑（`geocodeBusStudent` 是學生專用），它會連同地址與新座標
 *    一起落庫。按鈕文案與二次確認都必須說出「會立即儲存」——標成「查詢」卻偷偷
 *    寫入是說謊。失敗時後端回 502 且**不落任何變更**，提示改用「地圖微調」手動定位。
 *    既然它本來就要寫，就把**其他待存欄位一起帶上**（見 `onGeocode`）：只送地址會讓
 *    回應的 `fill()` 把使用者剛改好還沒存的車輛數靜默蓋回舊值。
 * 3. **兩個寫入動作必須互斥**：儲存與查座標打同一支 PUT，併發時「後回應者」決定
 *    `saved`，而它的回應可能算在對方寫入之前——`saved` 是 diff 基準，一旦退回舊值，
 *    下一次儲存就會拿舊值當基準把剛寫進去的設定覆寫掉。`busy` 從**進二次確認之前**
 *    就鎖住（不是等 confirm resolve），否則連點兩下會排出兩個確認框與兩次 PUT，
 *    geocode 情境還會多打一次付費的地圖服務。
 * 4. **載入失敗就不給編輯**：送出的 payload 是「和伺服器值的 diff」，讀不到伺服器值
 *    時那個 diff 是拿預設值算出來的假差異，按下儲存會把沒看過的設定覆寫掉。
 *    因此讀取失敗一律停在錯誤狀態＋重試，不做「用預設值先給你編」的降級。
 *
 * 座標**只覆寫、不清除**：值只來自伺服器、geocode 或地圖微調，三者都必為數字，
 * 所以 payload 不可能產出 `school_lat: null`。後端支援顯式 null 清除，但產品上沒有
 * 「把園所位置清空」的需求（清掉只會讓最佳化失去起終點），故不開這個入口。
 *
 * 權限：後端 GET 要 `BUS_READ`、PUT 要 `BUS_WRITE`。只有讀權限的帳號照樣進得來，
 * 這裡把輸入與寫入鈕鎖成唯讀——這是 **UI 鎖不是安全邊界**（同 useBusDailyDispatch
 * 的說法），只負責避免使用者改半天才吃一個 403。
 *
 * 隱私：本頁座標是**園所自己的**位置（非學生住址），但仍沿用本模組規範，不寫進
 * console／Sentry／URL query／storage。
 *
 * 版面：分頁列由 BusLayout 負責（分頁註冊在 FE-NAV-02），頁面標題比照四個姊妹分頁
 * 由各自的 view 自帶 PageHeader（與 FE-NAV-02 議定：BusLayout 不再另加標題）。
 *
 * ⚠ 掛載前提：未儲存保護走 `onBeforeRouteLeave`，只在本元件是 `/bus` 底下**被 matched
 * 的子路由**時有效。若改用 `<component :is>` 或 el-tab-pane 內嵌來掛這個分頁，
 * vue-router 只會印一行 dev warning，離頁保護會**靜默失效**。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getBusSettings, putBusSettings } from '@/api/bus'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { busWriteLabel } from '@/constants/bus'
import PageHeader from '@/components/common/PageHeader.vue'
import BusStopMapTuner from '@/components/bus/BusStopMapTuner.vue'
import type { ApiBody, Schema } from '@/api/_generated/typed'

type BusSettings = Schema<'BusSettingsOut'>
type BusSettingsPayload = ApiBody<'/bus/settings', 'put'>

/** 後端 `BusSettingsUpdate.school_address` 的 max_length。 */
const ADDRESS_MAX = 200

/**
 * 使用者可見文案集中管理（同慣例見 BusDispatchView 的 `RESET_COPY`）：同一句話
 * 在提示與二次確認各出現一次，抄兩份就會在其中一份改文案時悄悄分叉。
 * 術語沿用本模組既有的「路徑最佳化」（`useBusDailyDispatch` 的錯誤文案），不新造。
 */
const COPY = {
  /** 主詞由呼叫端組：貼在「園所座標」label 右邊當提示時，再帶一次主詞會變成同義反覆。 */
  coordsRole: '路徑最佳化的起終點',
  busCountRole: '同時進行中班次的總數上限，超過時無法再發車',
} as const

/** 伺服器上的現值；null＝還沒讀到（載入中或載入失敗）。 */
const saved = ref<BusSettings | null>(null)

const address = ref('')
const lat = ref<number | null>(null)
const lng = ref<number | null>(null)
// el-input-number 可被清成 undefined——那不是 0 也不是「沒改」，直接送出去會撞後端
// `ge=1` 的 422（比照 BusRouteForm 的 capacity）。
const busCount = ref<number | undefined>(1)

const loading = ref(false)
const loadError = ref<string | null>(null)
// saving／geocoding 只餵按鈕的 loading 狀態；互斥一律看 writing。
const saving = ref(false)
const geocoding = ref(false)
/**
 * 寫入互斥鎖，**涵蓋二次確認開著的整段期間**（見檔頭 3.）。
 * 由 onSave／onGeocode 在函式入口取得、在同一個 finally 釋放——不下放給
 * `confirmWrite` 自己釋放：那樣「確認框關閉」到「送出」之間就會出現一個沒有鎖的
 * 空窗，今天沒有 await 所以安全，但只要有人在中間插一段前置檢查，洞就開了。
 */
const writing = ref(false)
/** 最近一次寫入失敗訊息；留在原地而不是彈一次就消失的 toast。 */
const lastError = ref<string | null>(null)
const tuneVisible = ref(false)

const canWrite = computed(() => hasPermission('BUS_WRITE'))
const busy = computed(() => writing.value)
/** 唯讀（無寫入權限）或有寫入在途時，所有編輯入口一律鎖住。 */
const locked = computed(() => busy.value || !canWrite.value)

function fill(data: BusSettings): void {
  saved.value = data
  address.value = data.school_address ?? ''
  lat.value = data.school_lat
  lng.value = data.school_lng
  busCount.value = data.bus_count
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = null
  try {
    const res = await getBusSettings()
    fill(res.data)
  } catch (e) {
    // 不留半套狀態：讀不到就整個停在錯誤態，避免拿預設值當 diff 基準（見檔頭 4.）。
    // 保留後端 detail——403（沒授權，重試永遠不會好）與網路斷線要看得出差別。
    saved.value = null
    loadError.value = apiError(e, '讀取娃娃車設定失敗')
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

// 後端是 `int`，小數會被 pydantic 拒成 422；`:min` 不擋鍵盤直接輸入的 2.5。
const busCountInvalid = computed(
  () => typeof busCount.value !== 'number'
    || !Number.isInteger(busCount.value)
    || busCount.value < 1,
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

// 分頁切走／關分頁的未儲存保護（沿用共用 composable，文案與全站一致）。
useUnsavedChangesGuard(() => hasChanges.value)

/**
 * 二次確認文案依「這次真的會變什麼」組裝：座標沒動卻警告座標影響最佳化，只是
 * 訓練使用者把確認框當成噪音按掉。
 */
function confirmLines(payload: BusSettingsPayload): string[] {
  const lines: string[] = []
  const coordsChanged = 'school_lat' in payload || 'school_lng' in payload
  if ('school_address' in payload) {
    lines.push(
      payload.school_address
        ? `園所地址將改為「${payload.school_address}」。`
        : '園所地址將被清除。',
    )
    if (!coordsChanged) {
      // 最佳化吃的是座標不是地址；只改地址就存，兩者從此互相矛盾而畫面不會提。
      lines.push('座標不會跟著地址更新，如需同步請改按「查座標」。')
    }
  }
  if (coordsChanged) {
    lines.push(
      `園所座標是${COPY.coordsRole}：儲存後，之後的自動排序建議與 ETA 都會依新座標`
      + '計算（既有班次已排好的順序不會自動重排）。',
    )
  }
  if ('bus_count' in payload) {
    lines.push(`車輛數將改為 ${payload.bus_count}：${COPY.busCountRole}。`)
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
  if (locked.value || !hasChanges.value) return
  writing.value = true
  try {
    const payload = changed.value
    if (!(await confirmWrite(confirmLines(payload), '儲存娃娃車設定', '儲存'))) return

    saving.value = true
    lastError.value = null
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
    writing.value = false
  }
}

/**
 * 以園所地址向後端要座標。後端沒有「只查不存」的入口，這一步會連地址一起落庫，
 * 因此照樣走二次確認（見檔頭 2.）。
 *
 * payload 帶上其他待存欄位：座標由後端依地址覆寫，送了也沒用，故從 diff 剔除；
 * 車輛數不送則會被回應的 `fill()` 蓋回舊值，使用者的編輯就無聲消失了。
 */
async function onGeocode(): Promise<void> {
  if (locked.value) return
  const trimmed = address.value.trim()
  if (!trimmed) {
    // 後端沒地址會回 422；先擋在前面，錯誤訊息才講得出下一步。
    ElMessage.warning('請先填園所地址再查座標')
    return
  }

  writing.value = true
  try {
    const { school_lat: tunedLat, school_lng: tunedLng, ...rest } = changed.value
    const payload: BusSettingsPayload = { ...rest, school_address: trimmed, geocode: true }

    const lines = [
      `將以「${trimmed}」向地圖服務查詢座標，並立即儲存地址與查到的座標。`,
      `園所座標是${COPY.coordsRole}：之後的自動排序建議與 ETA 都會依新座標計算。`,
    ]
    if ('bus_count' in payload) {
      lines.push(`同時會一併儲存目前的車輛數 ${payload.bus_count}。`)
    }
    if (tunedLat !== undefined || tunedLng !== undefined) {
      lines.push('你剛才用地圖微調的座標會被查到的座標取代。')
    }
    if (!(await confirmWrite(lines, '查座標並儲存', '查座標並儲存'))) return

    geocoding.value = true
    lastError.value = null
    const res = await putBusSettings(payload)
    fill(res.data)
    if (res.data.school_lat == null || res.data.school_lng == null) {
      // 200 但沒座標：不能說「已取得座標」，畫面上那一格還是「尚未設定」。
      ElMessage.warning('地址已儲存，但沒有取得座標，請用「地圖微調」手動定位')
    } else {
      ElMessage.success('已取得座標並儲存')
    }
  } catch (e) {
    // 502＝地圖服務查不到；後端不落任何變更——連一起帶上的車輛數也沒存，所以
    // 訊息要講「都沒有儲存」，不能只講座標失敗（表單維持 dirty，重按儲存即可）。
    const message = apiError(e, '地址轉座標失敗')
    lastError.value = `${message}（這次的變更都沒有儲存；可改用「地圖微調」手動定位）`
    ElMessage.error(lastError.value)
  } finally {
    geocoding.value = false
    writing.value = false
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
    <PageHeader title="娃娃車設定" subtitle="園所位置與可同時發車的車輛數" />

    <el-skeleton v-if="loading" :rows="4" animated data-test="loading" />

    <el-alert
      v-else-if="loadError"
      type="error"
      :closable="false"
      show-icon
      :title="loadError"
      data-test="load-failed"
    >
      <p>讀不到目前設定就無法判斷你改了哪些欄位，儲存會覆寫沒看過的設定，因此先不開放編輯。</p>
      <!--
        後端 GET 要 BUS_READ、PUT 才要 BUS_WRITE，而路由 gate 是 OR 語意寫不出 AND：
        只被授予編輯權限的帳號進得來、卻在第一支 GET 就 403（既有 /bus/routes 同症狀）。
        錯誤卡本身已經是誠實的降級，但光看「權限不足」猜不到缺的是哪一個，故明說。
      -->
      <p class="bus-settings-panel__hint" data-test="permission-hint">
        若你只被授予娃娃車的編輯權限，讀取設定仍需要檢視權限，請一併請管理員授予。
      </p>
      <el-button size="small" data-test="reload-btn" @click="load">重新載入</el-button>
    </el-alert>

    <el-form v-else class="bus-settings-panel__form" label-width="110px" @submit.prevent="onSave">
      <el-alert
        v-if="!canWrite"
        class="bus-settings-panel__notice"
        type="info"
        :closable="false"
        show-icon
        title="你沒有編輯娃娃車設定的權限，以下為唯讀檢視"
        data-test="readonly-notice"
      >
        <!--
          權限名稱一律取自 navigation manifest（唯一事實來源）：手抄一份中文到頁面裡，
          manifest 改文案時畫面就會指向一個權限清單裡找不到的名字。
        -->
        <p data-test="readonly-permission-name">
          需要調整請聯絡系統管理員授權「{{ busWriteLabel() }}」。
        </p>
      </el-alert>

      <el-alert
        v-if="lastError"
        class="bus-settings-panel__notice"
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
            :disabled="locked"
            show-word-limit
            placeholder="例：高雄市左營區博愛二路 777 號"
            data-test="address-input"
          />
          <el-button
            :loading="geocoding"
            :disabled="locked"
            data-test="geocode-btn"
            @click="onGeocode"
          >
            查座標
          </el-button>
        </div>
        <span class="bus-settings-panel__hint">
          按「查座標」會立即儲存地址與查到的座標；查不到時可用「地圖微調」手動定位。
        </span>
      </el-form-item>

      <el-form-item label="園所座標">
        <span data-test="coords-readonly">{{ coordsLabel }}</span>
        <el-button
          class="bus-settings-panel__tune"
          size="small"
          :disabled="locked"
          data-test="tune-btn"
          @click="tuneVisible = true"
        >
          地圖微調
        </el-button>
        <span class="bus-settings-panel__hint">{{ COPY.coordsRole }}</span>
      </el-form-item>

      <el-form-item label="車輛數">
        <el-input-number
          v-model="busCount"
          :min="1"
          :step="1"
          :precision="0"
          step-strictly
          :disabled="locked"
          data-test="bus-count-input"
        />
        <span v-if="busCountInvalid" class="bus-settings-panel__warn" data-test="bus-count-warn">
          車輛數需為 1 以上的整數；目前這一欄不會一起儲存
        </span>
        <span v-else class="bus-settings-panel__hint">{{ COPY.busCountRole }}</span>
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="locked || !hasChanges"
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

.bus-settings-panel__notice {
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
