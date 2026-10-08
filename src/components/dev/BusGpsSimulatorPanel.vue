<script setup lang="ts">
/**
 * 娃娃車 GPS 模擬器的控制面板——**測試用，正式環境永不載入**。
 *
 * 只在 `VITE_BUS_GPS_SIMULATOR=1` 的 build 出現（呼叫端是動態 import，見
 * `PortalBusTripView.vue`）。刻意做成右下角常駐的紅色面板：一旦有人誤在正式環境
 * 開啟這個旗標，畫面上不可能看不見。
 *
 * 站點來源由父層傳入（司機端當前班次的站點），本元件不自己打 API——面板的職責是
 * 操作模擬器，不是取得資料。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { getBusGpsSimulator, type SimWaypoint } from '@/utils/busGpsSimulator'

const props = defineProps<{
  /** 當前班次的站點；座標缺失的會在本元件內被過濾掉。 */
  stops: Array<{ lat?: number | null; lng?: number | null; student_name?: string; seq?: number }>
}>()

const sim = getBusGpsSimulator()
const collapsed = ref(false)

const state = computed(() => sim?.state.value ?? null)

/** 有座標的站點才能當路徑點；沒座標的站無法內插，會讓車輛瞬移。 */
const waypoints = computed<SimWaypoint[]>(() => props.stops
  .filter((s): s is typeof s & { lat: number; lng: number } => (
    typeof s.lat === 'number' && typeof s.lng === 'number'
  ))
  .map((s) => ({ lat: s.lat, lng: s.lng, label: s.student_name ?? `第 ${s.seq ?? 0} 站` })))

const skippedCount = computed(() => props.stops.length - waypoints.value.length)

const currentLabel = computed(() => {
  const s = state.value
  if (!s || s.waypoints.length === 0) return '尚未載入站點'
  if (s.finished) return '已抵達終點'
  const to = s.waypoints[s.segmentIndex + 1]
  return to ? `前往 ${to.label ?? '下一站'}` : '停在起點'
})

const progressText = computed(() => {
  const s = state.value
  if (!s || s.waypoints.length < 2) return '—'
  return `${Math.min(s.segmentIndex + 1, s.waypoints.length)} / ${s.waypoints.length}`
})

function loadStops(): void {
  sim?.setWaypoints(waypoints.value)
}

// 站點一到位就自動載入，省掉「開班後還要記得按載入」這一步；行駛中不覆寫，
// 否則每次站點刷新（離站後重抓）都會把車瞬間拉回起點。
watch(waypoints, (next) => {
  if (!sim || next.length === 0) return
  if (sim.state.value.running) return
  sim.setWaypoints(next)
}, { immediate: true })

onMounted(loadStops)
</script>

<template>
  <div v-if="sim" class="bus-gps-sim" :class="{ 'is-collapsed': collapsed }">
    <header class="bus-gps-sim__bar" @click="collapsed = !collapsed">
      <span class="bus-gps-sim__dot" :class="{ 'is-live': state?.running }" />
      <strong>GPS 模擬器</strong>
      <span class="bus-gps-sim__hint">{{ collapsed ? '展開' : '收合' }}</span>
    </header>

    <div v-if="!collapsed" class="bus-gps-sim__body">
      <p class="bus-gps-sim__warn">
        這個畫面正在回報**模擬座標**，不是真實位置。正式環境不得啟用。
      </p>

      <dl class="bus-gps-sim__stat">
        <dt>狀態</dt>
        <dd>{{ state?.running ? '行駛中' : '暫停' }}</dd>
        <dt>路段</dt>
        <dd>{{ progressText }}</dd>
        <dt>目標</dt>
        <dd>{{ currentLabel }}</dd>
      </dl>

      <div class="bus-gps-sim__row">
        <button type="button" @click="sim.toggle()">
          {{ state?.running ? '暫停' : '開始行駛' }}
        </button>
        <button type="button" @click="loadStops()">重新載入站點</button>
      </div>

      <label class="bus-gps-sim__speed">
        車速 {{ state?.speedKmh ?? 0 }} km/h
        <input
          type="range" min="5" max="80" step="5"
          :value="state?.speedKmh ?? 30"
          @input="sim.setSpeedKmh(Number(($event.target as HTMLInputElement).value))"
        >
      </label>

      <label class="bus-gps-sim__speed">
        跳到第幾站
        <input
          type="range" min="0" :max="Math.max(0, (state?.waypoints.length ?? 1) - 1)" step="1"
          :value="state?.segmentIndex ?? 0"
          @input="sim.jumpTo(Number(($event.target as HTMLInputElement).value))"
        >
      </label>

      <p v-if="skippedCount > 0" class="bus-gps-sim__skip">
        有 {{ skippedCount }} 站沒有座標，已排除在路徑外。
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 這是測試工具，不套用設計 token（token 棘輪只管業務畫面），
   刻意用最刺眼的紅色，讓誤啟用一眼可見。 */
.bus-gps-sim {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 3000;
  width: 260px;
  font-size: 12px;
  color: #fff;
  background: #b3261e;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 35%);
  overflow: hidden;
}

.bus-gps-sim__bar {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  background: rgb(0 0 0 / 18%);
}

.bus-gps-sim__hint {
  margin-left: auto;
  opacity: 0.8;
}

.bus-gps-sim__dot {
  width: 8px;
  height: 8px;
  background: #ffd75e;
  border-radius: 50%;
}

.bus-gps-sim__dot.is-live {
  background: #7ef29d;
  animation: bus-gps-sim-pulse 1s ease-in-out infinite;
}

@keyframes bus-gps-sim-pulse {
  50% { opacity: 0.3; }
}

.bus-gps-sim__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.bus-gps-sim__warn {
  margin: 0;
  line-height: 1.4;
  opacity: 0.9;
}

.bus-gps-sim__stat {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 8px;
  margin: 0;
}

.bus-gps-sim__stat dt { opacity: 0.75; }
.bus-gps-sim__stat dd { margin: 0; }

.bus-gps-sim__row {
  display: flex;
  gap: 6px;
}

.bus-gps-sim__row button {
  flex: 1;
  padding: 5px 6px;
  font: inherit;
  color: #b3261e;
  cursor: pointer;
  background: #fff;
  border: 0;
  border-radius: 4px;
}

.bus-gps-sim__speed {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bus-gps-sim__speed input { width: 100%; }

.bus-gps-sim__skip {
  margin: 0;
  opacity: 0.85;
}

@media (prefers-reduced-motion: reduce) {
  .bus-gps-sim__dot.is-live { animation: none; }
}
</style>
