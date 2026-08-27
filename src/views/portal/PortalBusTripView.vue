<template>
  <div class="portal-bus" role="region" aria-label="娃娃車班次">
    <div v-if="loading" class="bus-state" data-testid="bus-loading">
      <el-skeleton :rows="3" animated />
    </div>

    <!--
      帳號未綁員工（`mine=true` 回 403）：排在快照失敗之前。這條路徑按「重新載入」
      不會變好（開班同樣會 403），得有人去後台把帳號綁上員工資料，文案要講得出下一步。
    -->
    <el-card
      v-else-if="employeeUnlinked"
      class="bus-card"
      data-testid="bus-employee-unlinked"
    >
      <h3 class="bus-title">此帳號尚未綁定員工資料</h3>
      <p class="bus-hint">
        無法查詢您的班次，也無法開始新班次。請洽行政人員將您的帳號綁定員工資料後，再重新載入。
      </p>
      <el-button size="large" data-testid="bus-retry-unlinked" @click="init">重新載入</el-button>
    </el-card>

    <!-- 快照失敗：不得退化成「沒有班次」的開班畫面，否則會開出第二張班次 -->
    <el-card v-else-if="snapshotFailed" class="bus-card" data-testid="bus-snapshot-failed">
      <h3 class="bus-title">目前無法確認班次狀態</h3>
      <p class="bus-hint">網路或伺服器忙碌中。請先確認連線後重試，不要直接開新班次。</p>
      <el-button type="primary" size="large" data-testid="bus-retry" @click="init">重新載入</el-button>
    </el-card>

    <!-- 尚未開班 -->
    <template v-else-if="!trip">
      <!--
        班次清單載入失敗**不得**畫成「尚未設定娃娃車班次」的空狀態——那會讓司機
        去追一個不存在的問題（與 Task 13 在 BusRoutesView 修掉的是同一個缺口）。
        排在空狀態之前。
      -->
      <el-card v-if="routesFailed" class="bus-card" data-testid="bus-routes-failed">
        <h3 class="bus-title">無法載入班次清單</h3>
        <p class="bus-hint">目前無法開始新班次。請確認連線後重新載入；若持續失敗請洽行政人員。</p>
        <el-button type="primary" size="large" data-testid="bus-retry-routes" @click="init">
          重新載入
        </el-button>
      </el-card>

      <el-card v-else-if="routes.length === 0" class="bus-card" data-testid="bus-no-routes">
        <h3 class="bus-title">尚未設定娃娃車班次</h3>
        <p class="bus-hint">請洽行政人員於後台建立班次與名單後再開始班次。</p>
      </el-card>

      <el-card v-else class="bus-card" data-testid="bus-start-card">
        <h3 class="bus-title">開始娃娃車班次</h3>

        <!--
          方向 radio 已移除（spec「第一期契約破壞清單」：TripStartIn.direction 移除，
          方向由班次衍生）。改為依 sort_order 的班次列表，每列自帶方向＋出發時間＋
          當日狀態，司機選的是「哪一班」而不是「哪條路線的哪個方向」。
        -->
        <ul class="route-list" aria-label="班次清單">
          <li v-for="r in routes" :key="r.id">
            <button
              type="button"
              class="route-item"
              :class="{ 'route-item--selected': selectedRouteId === r.id }"
              :aria-pressed="selectedRouteId === r.id"
              :data-testid="`bus-route-${r.id}`"
              @click="selectRoute(r.id)"
            >
              <span class="route-main">
                <span class="route-direction">{{ DIRECTION_LABELS[r.direction] ?? r.direction }}</span>
                <span class="route-name">{{ r.name }}</span>
              </span>
              <span class="route-meta">
                <!-- 後端 Time.isoformat() 帶秒（07:30:00），司機只需要 HH:mm -->
                <span class="route-time">{{ r.depart_time.slice(0, 5) }}</span>
                <el-tag
                  :type="TODAY_STATUS_TAG[r.today_status]"
                  size="small"
                  :data-testid="`bus-route-status-${r.id}`"
                >
                  {{ TODAY_STATUS_LABELS[r.today_status] }}
                </el-tag>
              </span>
            </button>
          </li>
        </ul>

        <!--
          發車被擋（422 缺座標／超座位上限，或 409 車輛數達上限且接手落空）：
          持久顯示而非 toast——司機在車上手邊在忙，一閃即逝的提示看不到就再也回不來，
          而這幾種錯誤都要人去後台改資料才會好。
        -->
        <el-alert
          v-if="startBlockedMessage"
          type="error"
          :closable="false"
          show-icon
          class="bus-blocked"
          data-testid="bus-start-blocked"
          :title="startBlockedMessage"
        />

        <el-button
          type="primary"
          size="large"
          class="bus-primary-btn"
          :loading="starting"
          :disabled="selectedRouteId === null"
          data-testid="bus-start"
          @click="start"
        >
          {{ startButtonLabel }}
        </el-button>
      </el-card>
    </template>

    <!-- 班次進行中 -->
    <template v-else>
      <!-- 班次與方向必須看得見：接手到別班時，這是司機唯一能自己察覺的訊號 -->
      <h2 class="trip-summary" data-testid="bus-trip-summary">{{ tripSummary }}</h2>
      <!--
        定位權限被拒與其他定位失敗（POSITION_UNAVAILABLE / TIMEOUT）分開呈現：
        `watchPosition` 一旦被拒不會再自動跳權限提示，「重新整理」對這條路徑沒用，
        要給司機一個可行動的下一步（去瀏覽器/系統設定開權限）。排在通用 GPS 警示之前。
      -->
      <el-alert
        v-if="!gpsActive && gpsPermissionDenied"
        type="error"
        :closable="false"
        show-icon
        data-testid="bus-gps-permission-denied"
        title="定位權限已被拒絕，家長端看不到車輛位置"
        description="請至瀏覽器或手機系統設定開啟此頁面的定位權限，開啟後重新整理頁面"
      />
      <el-alert
        v-else-if="!gpsActive"
        type="warning"
        :closable="false"
        show-icon
        data-testid="bus-gps-warning"
        :title="gpsSupported ? 'GPS 尚未取得位置，家長端只會看到站點進度' : '此裝置不支援定位，家長端只會看到站點進度'"
      />
      <el-alert
        v-if="gpsClockSuspect"
        type="warning"
        :closable="false"
        show-icon
        data-testid="bus-clock-suspect"
        title="此裝置回報的定位時間異常，已改用系統時間標記位置"
      />
      <el-alert
        v-if="pendingPingCount > 0"
        type="info"
        :closable="false"
        show-icon
        data-testid="bus-pending-pings"
        :title="`有 ${pendingPingCount} 筆位置待重送（網路恢復後會自動補上）`"
      />
      <el-alert
        v-if="pendingStopActionCount > 0"
        type="info"
        :closable="false"
        show-icon
        data-testid="bus-pending-stop-actions"
        :title="`有 ${pendingStopActionCount} 個站點操作待重送（網路恢復後會自動補上）`"
      />

      <ul class="stop-list" aria-label="站點清單">
        <li v-for="stop in stops" :key="stop.stop_id" class="stop-item">
          <el-card
            :class="['stop-card', `stop-${stop.status}`]"
            :data-testid="`bus-stop-${stop.stop_id}`"
          >
            <div class="stop-row">
              <span class="stop-seq">{{ stop.seq }}</span>
              <!--
                `:id` 供下方操作鈕與聯絡人連結以 `aria-labelledby` 引用——姓名／電話
                一律不進 `aria-label`，理由見 script 區塊的「隱私」段。
              -->
              <span :id="`stop-name-${stop.stop_id}`" class="stop-name">{{ stop.student_name }}</span>
              <el-tag v-if="stop.status === 'departed'" type="success">已離站</el-tag>
              <el-tag v-else-if="stop.status === 'skipped'" type="info">已跳過</el-tag>
              <!--
                excused＝當日不搭的既成事實（請假核准／家長今天不搭／後台排除三條
                路徑的單一落點）。第一期的 `on_leave`「標示但仍要司機自己按跳過」
                已退場；司機端**不提供恢復**（spec「司機端（Portal）」明文）。
              -->
              <el-tag
                v-else-if="stop.status === 'excused'"
                type="warning"
                :data-testid="`bus-stop-excused-${stop.stop_id}`"
              >
                {{ excuseLabel(stop.excuse_reason) }}
              </el-tag>
              <span
                v-if="stopEta(stop)"
                class="stop-eta"
                :data-testid="`bus-stop-eta-${stop.stop_id}`"
              >{{ stopEta(stop) }}</span>
            </div>

            <p v-if="stop.address" class="stop-address" :data-testid="`bus-stop-address-${stop.stop_id}`">
              {{ stop.address }}
            </p>

            <!--
              聯絡人電話：行車情境用 `tel:` 直撥（司機不必抄號碼再切到撥號 App）。
              後端已依 is_primary／is_emergency／fallback 規則挑好，前端不再篩。
            -->
            <div v-if="callableContacts(stop).length" class="stop-contacts">
              <!--
                無電話者**整個不進 DOM**（不是 v-show 隱藏）：v-show 只是
                display:none，會留下一個 tel: 後面沒有號碼的空連結，對輔助技術
                仍然可見可聚焦。
                `:key` 用索引而非 name+phone——後端沒回 guardian id，同名同號的
                兩筆（資料重複建檔）會撞 key。
              -->
              <a
                v-for="(c, i) in callableContacts(stop)"
                :key="`${stop.stop_id}-${i}`"
                class="stop-contact"
                :href="`tel:${c.phone}`"
                :data-testid="`bus-stop-contact-${stop.stop_id}`"
              >
                <span class="stop-contact-name">{{ c.name }}</span>
                <span class="stop-contact-phone">{{ c.phone }}</span>
              </a>
            </div>

            <!-- excused 站不渲染任何操作鈕（灰態、不可操作、不提供恢復） -->
            <div v-if="stop.status !== 'excused'" class="stop-actions">
              <template v-if="stop.status === 'pending'">
                <el-button
                  type="primary"
                  size="large"
                  :loading="actingStopId === stop.stop_id"
                  :disabled="actingStopId !== null"
                  :id="`stop-depart-${stop.stop_id}`"
                  :aria-labelledby="`stop-name-${stop.stop_id} stop-depart-${stop.stop_id}`"
                  @click="departStop(stop)"
                >
                  離站
                </el-button>
                <el-button
                  size="large"
                  :disabled="actingStopId !== null"
                  :id="`stop-skip-${stop.stop_id}`"
                  :aria-labelledby="`stop-name-${stop.stop_id} stop-skip-${stop.stop_id}`"
                  @click="skipStop(stop)"
                >
                  跳過
                </el-button>
              </template>
              <el-button
                v-else
                text
                size="large"
                :disabled="actingStopId !== null"
                :id="`stop-undo-${stop.stop_id}`"
                :aria-labelledby="`stop-name-${stop.stop_id} stop-undo-${stop.stop_id}`"
                @click="undoStop(stop)"
              >
                撤銷
              </el-button>
            </div>
          </el-card>
        </li>
      </ul>

      <el-button
        type="danger"
        size="large"
        class="bus-primary-btn complete-btn"
        :loading="completing"
        data-testid="bus-complete"
        @click="complete"
      >
        結束班次
      </el-button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 隨車老師娃娃車班次操作頁（route `/portal/bus-trip`，`meta.permission = BUS_TRIPS_OPERATE`）。
 *
 * 本檔只負責畫面與生命週期；班次狀態、GPS 節流上報、站點推進全在
 * `@/composables/usePortalBusTrip`（可獨立測試）。
 *
 * ── 第二期揭露面（spec「司機端（Portal）」）──────────────────────────────────
 * 站點卡片新增**接送地址**與**聯絡人姓名＋電話**（`tel:` 直撥）。這是
 * `BUS_TRIPS_OPERATE` 授權範圍內的刻意揭露——但既有隱私硬規則完全不變，反而更要緊：
 * 電話與地址**只渲染在卡片上**，不進 console／Sentry／URL query／任何 storage。
 *
 * ⚠ **任何 PII 都不得寫進 `aria-label`／`title`／`alt`／`name` 這四個屬性**
 * （隱私 review must-fix）。理由不是 a11y 而是 Sentry：`@sentry/core` 的
 * `htmlTreeAsString()` 對 DOM click breadcrumb 會**逐字抄走**這四個屬性
 * （見 `node_modules/@sentry/core/build/cjs/utils/browser.js` 的屬性白名單），
 * 而 `src/utils/sentry.ts::scrubBreadcrumb` 對 breadcrumb message 只跑
 * `redactPiiValue()`（身分證／手機／市話／LINE uid 四條正則）——**中文姓名一個字
 *都不遮**。於是「撥打給 王媽媽」會原樣進 Sentry，被沒有 `BUS_TRIPS_OPERATE` 的人
 * 看到。它抄的是**屬性**不是文字節點，所以做法是：可及名稱交給可見文字，需要額外
 * 語境時用 `aria-labelledby` 引用 id（屬性值只有 id，不含 PII）。座標仍完全不渲染。
 *
 * 行車情境的可用性取捨：按鈕一律 `size="large"`（手套／晃動下也點得到）、
 * 操作進行中鎖住整列避免重複送出、結束班次為 danger 並帶二次確認。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  DIRECTION_LABELS,
  usePortalBusTrip,
  type BusRouteTodayStatus,
  type BusStopContact,
  type BusTripStop,
} from '@/composables/usePortalBusTrip'
import { formatTaipeiClock } from '@/utils/taipeiTime'

const {
  trip, stops, routes, selectedRouteId,
  loading, starting, completing, actingStopId, startBlockedMessage,
  gpsActive, gpsSupported, gpsClockSuspect, gpsPermissionDenied,
  snapshotFailed, employeeUnlinked, routesFailed,
  pendingPingCount, pendingStopActionCount, tripSummary,
  init, start, departStop, skipStop, undoStop, complete, teardown,
} = usePortalBusTrip()

/** 當日四態的徽章文案（spec「司機端（Portal）」）。 */
const TODAY_STATUS_LABELS: Record<BusRouteTodayStatus, string> = {
  none: '未生成',
  planned: '已排定',
  in_progress: '進行中',
  completed: '已完成',
}
const TODAY_STATUS_TAG: Record<BusRouteTodayStatus, 'info' | 'warning' | 'success' | 'primary'> = {
  none: 'info',
  planned: 'primary',
  in_progress: 'warning',
  completed: 'success',
}

/**
 * 主按鈕文案隨所選班次的當日狀態變化。`completed` 仍可開同日第二趟（spec 明文），
 * 所以那一態的文案是「再開一趟」而不是把按鈕擋掉——擋掉會讓下午的第二趟開不了。
 */
/**
 * 選班次時一併清掉上一輪的阻擋訊息：A 線因缺座標被擋（紅色 alert）後改選 B 線，
 * 那則針對 A 線的訊息若留在按鈕上方，行車情境下極易誤讀成「B 線也被擋」。
 */
function selectRoute(routeId: number): void {
  selectedRouteId.value = routeId
  startBlockedMessage.value = null
}

const startButtonLabel = computed(() => {
  const selected = routes.value.find((r) => r.id === selectedRouteId.value)
  if (!selected) return '開始班次'
  if (selected.today_status === 'completed') return '再開一趟'
  if (selected.today_status === 'in_progress') return '接手這一班'
  return '開始班次'
})

/** 可直撥的聯絡人（沒有電話的不渲染——`tel:` 空連結點下去沒有意義）。 */
function callableContacts(stop: BusTripStop): BusStopContact[] {
  return (stop.contacts ?? []).filter((c) => !!c.phone)
}

const EXCUSE_LABELS: Record<string, string> = {
  leave: '今日請假',
  parent: '家長回報不搭',
  admin: '後台排除',
}
/** excuse_reason 缺值或未知值時只講結論，不編造原因。 */
function excuseLabel(reason?: string | null): string {
  return (reason && EXCUSE_LABELS[reason]) || '今日不搭'
}

/**
 * 站點 ETA：`eta_live`（行進間動態重算）優先、無值退 `eta_planned`。
 * 已離站／已跳過／不搭的站不顯示——「預計 07:35 到」對已經發生的事只會誤導。
 * naive 台北牆鐘字串一律走 formatTaipeiClock，禁裸 `new Date()`。
 */
function stopEta(stop: BusTripStop): string | null {
  if (stop.status !== 'pending') return null
  const clock = formatTaipeiClock(stop.eta_live || stop.eta_planned)
  return clock ? `預計 ${clock}` : null
}

onMounted(init)
// 離開頁面 = 停止追蹤：殘留的 watchPosition 回呼不得再收集座標（隱私守衛），
// 同時把最後一批已收集的點送出去。
onBeforeUnmount(teardown)
</script>

<style scoped>
.portal-bus {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bus-card { border-radius: 10px; }
.bus-title { margin: 0 0 8px; font-size: 18px; }
.bus-hint { margin: 0 0 16px; color: var(--el-text-color-regular); line-height: 1.6; }
.bus-primary-btn { width: 100%; max-width: 320px; }
.bus-blocked { margin-bottom: 12px; }

/* 班次列表：整列可點（行車情境的觸控目標要夠大），選中狀態靠邊框與底色雙訊號 */
.route-list { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.route-item {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 2px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.route-item--selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.route-main { display: flex; flex-direction: column; gap: 2px; }
.route-direction { font-size: 13px; color: var(--el-text-color-regular); }
.route-name { font-size: 16px; font-weight: 700; }
.route-meta { display: flex; align-items: center; gap: 8px; }
.route-time { font-variant-numeric: tabular-nums; font-weight: 600; }

.trip-summary { margin: 0; font-size: 18px; font-weight: 700; }
.stop-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.stop-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.stop-seq { font-weight: 700; min-width: 1.5em; }
.stop-name { font-size: 16px; }
.stop-eta { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--el-text-color-regular); }
.stop-address { margin: 6px 0 0; font-size: 14px; color: var(--el-text-color-regular); line-height: 1.5; }
.stop-contacts { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
/* 直撥連結做成大按鈕：行車中單手點，不能是一行小字 */
.stop-contact {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  text-decoration: none;
  font-size: 15px;
}
.stop-contact-name { font-weight: 600; }
.stop-contact-phone { font-variant-numeric: tabular-nums; }
.stop-departed { opacity: 0.6; }
.stop-skipped { opacity: 0.5; }
/* excused 灰態：一瞄就知道這站不用停，且卡片內不渲染任何操作鈕 */
.stop-excused { opacity: 0.55; border-style: dashed; }
.stop-actions { margin-top: 8px; display: flex; gap: 8px; }
.complete-btn { margin-top: 16px; }
</style>
