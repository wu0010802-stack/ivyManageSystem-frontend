<script setup lang="ts">
/**
 * 今日調度：名單外學生臨時插入 Dialog（FE-DISPATCH-05，spec「planned 階段編輯」
 * 第 3 點）。
 *
 * 純呈現元件——落庫、錯誤解讀與清單重載一律由 `useBusDailyDispatch` 負責。
 *
 * ── 為什麼沒有「插入位置」選項 ─────────────────────────────────────────────
 * 任務描述原本列了 `position`，但後端 `DailyPlanStopInsertIn`（2026-08-26 實查）
 * **沒有這個欄位**：`patch_daily_plan_stops` 一律 `max_seq + 1` 接在末端。硬做一個
 * 選單只會送出後端忽略的欄位，然後在畫面上顯示一個並沒有發生的順序。插入後要調
 * 位置，走名單表的拖拉（那條路徑後端有支援；2026-08-27 起拖拉不動釘選）。
 *
 * ── 無座標一律擋在送出前 ───────────────────────────────────────────────────
 * 後端對缺座標的插入回 422，但更重要的是**發車驗證**會因為任一站無座標而整批擋下
 * ——真正的代價是「早上七點司機按不下開始」。所以這裡在按鈕層就擋，並明說要先去
 * 地址簿補一個可定位的地址，而不是讓人送出後才看到一句錯誤。
 *
 * ── 422 不清空表單 ─────────────────────────────────────────────────────────
 * 跨班次重複（同日其他班次已排這個學生）與超 capacity 都是整批 422、什麼都沒落庫。
 * 此時把選好的學生與地址清掉，等於要人重做一次才能看懂錯在哪。
 */
import { computed, ref, watch } from 'vue'
import BusPickupAddressSelect from '@/components/bus/BusPickupAddressSelect.vue'
import type { Schema } from '@/api/_generated/typed'

const props = defineProps<{
  visible: boolean
  /** 可插入的學生（呼叫端已過濾掉當日任一班次已在名單上的人）。 */
  candidates: Array<{ id: number; name: string }>
  /** 全園名冊載入中——此時候選是空的，但那不是「沒有人可插入」。 */
  candidatesLoading: boolean
  /** 全園名冊載入失敗——同上，且要給重試而不是一句空狀態。 */
  candidatesFailed: boolean
  inserting: boolean
  /** 後端 422 的訊息；有值時表單保留、只在上方顯示原因。 */
  errorMessage: string | null
}>()

const emit = defineEmits<{
  submit: [payload: Schema<'DailyPlanStopInsertIn'>]
  retryCandidates: []
  cancel: []
}>()

const studentId = ref<number | null>(null)
const pickupAddressId = ref<number | null>(null)
/** `BusPickupAddressSelect` 解析出的實際座標與地址快照（住家項也會帶）。 */
const resolved = ref<{ id: number | null; lat: number | null; lng: number | null; address: string } | null>(null)

/** 開啟時重置；關閉時不動（父層可能是因為 422 而保持開啟）。 */
watch(() => props.visible, (open) => {
  if (!open) return
  studentId.value = null
  pickupAddressId.value = null
  resolved.value = null
})

/** 換學生就作廢上一個學生的地址解析，否則會把 A 的座標送成 B 的站。 */
watch(studentId, () => {
  pickupAddressId.value = null
  resolved.value = null
})

const hasCoordinates = computed(
  () => resolved.value?.lat != null && resolved.value?.lng != null,
)
const canSubmit = computed(
  () => studentId.value !== null && resolved.value !== null && hasCoordinates.value && !props.inserting,
)

function onResolved(payload: { id: number | null; lat: number | null; lng: number | null; address: string }) {
  resolved.value = payload
}

function onSubmit(): void {
  const id = studentId.value
  const addr = resolved.value
  if (id === null || addr === null || !hasCoordinates.value) return
  emit('submit', {
    student_id: id,
    pickup_address_id: addr.id,
    lat: addr.lat,
    lng: addr.lng,
  })
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="臨時插入學生"
    width="520px"
    :close-on-click-modal="false"
    @close="emit('cancel')"
  >
    <el-alert
      v-if="errorMessage"
      class="bus-insert-student__error"
      type="error"
      :closable="false"
      show-icon
      data-test="error"
    >
      <template #title>{{ errorMessage }}</template>
    </el-alert>

    <el-form label-width="96px">
      <el-form-item label="學生">
        <el-select
          v-model="studentId"
          filterable
          clearable
          placeholder="搜尋學生姓名"
          style="width: 100%"
          data-test="student-select"
        >
          <el-option v-for="c in candidates" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <!--
          三態必須分開：候選為空可能是「還在載」「載失敗」或「真的沒有」。
          把前兩者講成「今天沒有可插入的學生」，管理員的結論會是「全園都排好了」
          ——而實際上是名冊根本沒撈到。
        -->
        <p v-if="candidatesLoading" class="bus-insert-student__hint" data-test="candidates-loading">
          正在載入學生名冊…
        </p>
        <p
          v-else-if="candidatesFailed"
          class="bus-insert-student__hint bus-insert-student__hint--error"
          data-test="candidates-failed"
        >
          學生名冊載入失敗，目前無法判斷有哪些學生可插入。
          <el-button link type="primary" data-test="candidates-retry" @click="emit('retryCandidates')">
            重試
          </el-button>
        </p>
        <p v-else-if="!candidates.length" class="bus-insert-student__hint" data-test="no-candidates">
          今天沒有可插入的學生（其餘學生都已排在某一班次的當日名單上）
        </p>
      </el-form-item>

      <el-form-item v-if="studentId !== null" label="接送地址">
        <BusPickupAddressSelect
          v-model="pickupAddressId"
          :student-id="studentId"
          :home-address="null"
          data-test="address-select"
          @resolved="onResolved"
        />
      </el-form-item>
    </el-form>

    <!--
      「還沒選地址」與「選了但沒座標」是兩件事：前者只是流程還沒走完，後者是
      使用者已經選好卻不能用，必須講出下一步（去地址簿補一個可定位的地址）。
    -->
    <el-alert
      v-if="resolved && !hasCoordinates"
      class="bus-insert-student__error"
      type="warning"
      :closable="false"
      show-icon
      data-test="no-coordinates"
    >
      <template #title>
        這個地址尚未定位，插入後會讓整條班次無法發車。請先在上方地址簿新增一筆可定位的地址。
      </template>
    </el-alert>

    <p class="bus-insert-student__hint" data-test="position-hint">
      插入的站會排在待接送順序的最後，之後可在名單表拖拉調整順序。
    </p>

    <template #footer>
      <el-button data-test="cancel-btn" @click="emit('cancel')">取消</el-button>
      <el-button
        type="primary"
        :disabled="!canSubmit"
        :loading="inserting"
        data-test="submit-btn"
        @click="onSubmit"
      >
        插入
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bus-insert-student__error {
  margin-bottom: 12px;
}

.bus-insert-student__hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.bus-insert-student__hint--error {
  color: var(--el-color-danger);
}
</style>
