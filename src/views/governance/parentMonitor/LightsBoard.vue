<template>
  <div class="lights-board">
    <el-card
      v-for="light in props.lights"
      :key="light.key"
      :data-testid="`light-${light.key}`"
      class="light-card"
      :class="`light-card--${light.level}`"
    >
      <div class="light-card__header">
        <span class="light-card__label">{{ labelFor(light.key) }}</span>
        <el-tag :type="tagTypeFor(light.level)">{{ levelLabelFor(light.level) }}</el-tag>
      </div>
      <p class="light-card__reason">{{ light.reason }}</p>
      <span
        v-if="light.metric !== null"
        data-testid="light-metric"
        class="light-card__metric"
      >{{ light.metric }}</span>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 九盞燈卡片（SPEC-023 批次 1，Task 13）。
 *
 * key 對中文名稱、level 對 el-tag type 的對照表放模組層，與後端
 * `services/parent_monitor/lights.py` 的 `LIGHT_KEYS` 一一對應——後端改名
 * （或半年後加第十盞燈）要一起改這裡。對不到的 key fallback 顯示原字串，
 * 元件不會炸掉，但正常情況下不應該讓使用者看到原始 key（見下方 fallback）。
 *
 * `metric` 為 `null` 時完全不渲染數字區塊：「尚未收集」與「收集到零筆」
 * 是兩種不同狀態，不可用空字串或 0 佔位混淆——這是本頁最核心的防呆規則。
 *
 * 燈的數量不寫死九個：`v-for` 直接跑 `props.lights`，後端之後多回或
 * 少回燈號都照收，不需要改本元件。
 */

export interface MonitorLight {
  key: string
  level: 'green' | 'yellow' | 'red' | 'gray'
  reason: string
  metric: string | null
}

const props = defineProps<{
  lights: MonitorLight[]
}>()

// 九盞燈的中文名稱。key 與後端 services/parent_monitor/lights.py 的 LIGHT_KEYS
// 一一對應，後端改名要一起改這裡（沒對到的 key 會 fallback 顯示原字串）。
const LIGHT_LABELS: Record<string, string> = {
  login_channel: '家長登入通道',
  tenant_entry: '租戶解析與入口',
  line_push: 'LINE 推播',
  storage: '附件儲存',
  db_rls: '資料庫與隔離',
  schedulers: '家長相關排程',
  api_errors: 'API 錯誤與延遲',
  silence: '流量靜默偵測',
  client_events: '家長端前端事件',
}

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

const TAG_TYPES: Record<MonitorLight['level'], TagType> = {
  green: 'success',
  yellow: 'warning',
  red: 'danger',
  gray: 'info',
}

const LEVEL_LABELS: Record<MonitorLight['level'], string> = {
  green: '正常',
  yellow: '警示',
  red: '異常',
  gray: '未知',
}

function labelFor(key: string): string {
  return LIGHT_LABELS[key] ?? key
}

function tagTypeFor(level: MonitorLight['level']): TagType {
  return TAG_TYPES[level] ?? 'info'
}

function levelLabelFor(level: MonitorLight['level']): string {
  return LEVEL_LABELS[level] ?? level
}
</script>

<style scoped>
.lights-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.light-card {
  border-left: 4px solid var(--el-border-color, #dcdfe6);
}

.light-card--green {
  border-left-color: var(--el-color-success, #67c23a);
}

.light-card--yellow {
  border-left-color: var(--el-color-warning, #e6a23c);
}

.light-card--red {
  border-left-color: var(--el-color-danger, #f56c6c);
}

.light-card--gray {
  border-left-color: var(--el-border-color, #dcdfe6);
}

.light-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.light-card__label {
  font-weight: 600;
}

.light-card__reason {
  font-size: 13px;
  margin: 0;
}

.light-card__metric {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}
</style>
