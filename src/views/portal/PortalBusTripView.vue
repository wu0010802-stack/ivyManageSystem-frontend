<template>
  <div class="portal-bus" role="region" aria-label="娃娃車班次">
    <div v-if="loading" class="bus-state" data-testid="bus-loading">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- 快照失敗：不得退化成「沒有班次」的開班畫面，否則會開出第二張班次 -->
    <el-card v-else-if="snapshotFailed" class="bus-card" data-testid="bus-snapshot-failed">
      <h3 class="bus-title">目前無法確認班次狀態</h3>
      <p class="bus-hint">網路或伺服器忙碌中。請先確認連線後重試，不要直接開新班次。</p>
      <el-button type="primary" size="large" data-testid="bus-retry" @click="init">重新載入</el-button>
    </el-card>

    <!-- 尚未開班 -->
    <template v-else-if="!trip">
      <el-card v-if="routesBlocked" class="bus-card" data-testid="bus-routes-blocked">
        <h3 class="bus-title">無法載入路線清單</h3>
        <p class="bus-hint">
          您的帳號有「隨車操作」權限，但沒有「娃娃車檢視」權限，因此無法挑選路線開新班次。
          請洽行政人員開通，或改由已開班的同事把班次交接給您（已開始的班次本頁會自動接手）。
        </p>
      </el-card>

      <el-card v-else-if="routes.length === 0" class="bus-card" data-testid="bus-no-routes">
        <h3 class="bus-title">尚未設定娃娃車路線</h3>
        <p class="bus-hint">請洽行政人員於後台建立路線與站點後再開始班次。</p>
      </el-card>

      <el-card v-else class="bus-card" data-testid="bus-start-card">
        <h3 class="bus-title">開始娃娃車班次</h3>

        <div class="bus-field">
          <label class="bus-label" for="bus-route-select">路線</label>
          <el-select
            id="bus-route-select"
            v-model="selectedRouteId"
            placeholder="請選擇路線"
            size="large"
            class="bus-select"
            data-testid="bus-route-select"
          >
            <el-option v-for="r in routes" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </div>

        <div class="bus-field">
          <span class="bus-label" id="bus-direction-label">方向</span>
          <el-radio-group v-model="direction" size="large" aria-labelledby="bus-direction-label">
            <el-radio-button value="morning">早上接學生</el-radio-button>
            <el-radio-button value="afternoon">下午送學生</el-radio-button>
          </el-radio-group>
        </div>

        <el-button
          type="primary"
          size="large"
          class="bus-primary-btn"
          :loading="starting"
          data-testid="bus-start"
          @click="start"
        >
          開始班次
        </el-button>
      </el-card>
    </template>

    <!-- 班次進行中 -->
    <template v-else>
      <el-alert
        v-if="!gpsActive"
        type="warning"
        :closable="false"
        show-icon
        data-testid="bus-gps-warning"
        :title="gpsSupported ? 'GPS 尚未取得位置，家長端只會看到站點進度' : '此裝置不支援定位，家長端只會看到站點進度'"
      />
      <el-alert
        v-if="pendingPingCount > 0"
        type="info"
        :closable="false"
        show-icon
        data-testid="bus-pending-pings"
        :title="`有 ${pendingPingCount} 筆位置待重送（網路恢復後會自動補上）`"
      />

      <ul class="stop-list" aria-label="站點清單">
        <li v-for="stop in stops" :key="stop.stop_id" class="stop-item">
          <el-card :class="['stop-card', `stop-${stop.status}`]" :data-testid="`bus-stop-${stop.stop_id}`">
            <div class="stop-row">
              <span class="stop-seq">{{ stop.seq }}</span>
              <span class="stop-name">{{ stop.student_name }}</span>
              <el-tag v-if="stop.status === 'departed'" type="success">已離站</el-tag>
              <el-tag v-else-if="stop.status === 'skipped'" type="info">已跳過</el-tag>
            </div>
            <div class="stop-actions">
              <template v-if="stop.status === 'pending'">
                <el-button
                  type="primary"
                  size="large"
                  :loading="actingStopId === stop.stop_id"
                  :disabled="actingStopId !== null"
                  :aria-label="`${stop.student_name} 已離站`"
                  @click="departStop(stop)"
                >
                  離站
                </el-button>
                <el-button
                  size="large"
                  :disabled="actingStopId !== null"
                  :aria-label="`跳過 ${stop.student_name}`"
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
                :aria-label="`撤銷 ${stop.student_name}`"
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
 * 隱私：站點含學生姓名與家庭座標，屬個資——畫面上只呈現姓名與順序，座標不渲染、
 * 不進網址、不寫入任何 storage。
 *
 * 行車情境的可用性取捨：按鈕一律 `size="large"`（手套／晃動下也點得到）、
 * 操作進行中鎖住整列避免重複送出、結束班次為 danger 並帶二次確認。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { usePortalBusTrip } from '@/composables/usePortalBusTrip'

const {
  trip, stops, routes, selectedRouteId, direction,
  loading, starting, completing, actingStopId,
  gpsActive, gpsSupported, snapshotFailed, routesBlocked, pendingPingCount,
  init, start, departStop, skipStop, undoStop, complete, teardown,
} = usePortalBusTrip()

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
.bus-field { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
.bus-label { font-weight: 600; }
.bus-select { width: 100%; max-width: 320px; }
.bus-primary-btn { width: 100%; max-width: 320px; }
.stop-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.stop-row { display: flex; align-items: center; gap: 10px; }
.stop-seq { font-weight: 700; min-width: 1.5em; }
.stop-name { font-size: 16px; }
.stop-departed { opacity: 0.6; }
.stop-skipped { opacity: 0.5; }
.stop-actions { margin-top: 8px; display: flex; gap: 8px; }
.complete-btn { margin-top: 16px; }
</style>
