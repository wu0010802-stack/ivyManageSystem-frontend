<!--
  跨分校報表指標值的通用渲染元件（PLT-01/02/03/05 根因修復）。

  `formatMetric` 只處理原始型別；物件／陣列改由本元件遞迴渲染成巢狀
  `el-descriptions`（物件）或清單（陣列），每個子欄位各自套用 `metricLabel`
  中文標籤——不再有任何一處把物件塞成 JSON 字串直接顯示。

  三個呼叫點共用本元件：`PlatformOverviewView.vue` 卡片、
  `PlatformReportsView.vue` 的總計卡片與表格儲存格。
-->
<template>
  <span v-if="kind === 'text'" class="metric-value">{{ text }}</span>
  <div v-else-if="kind === 'array'" class="metric-value metric-value--list">
    <span v-if="!items.length" class="metric-value">—</span>
    <ol v-else class="metric-value__list">
      <li v-for="(item, idx) in items" :key="idx">
        <MetricValue v-if="isMetricObject(item) || isMetricArray(item)" :metric-key="String(idx)" :value="item" />
        <span v-else class="metric-value">{{ formatMetric(metricKey, item) }}</span>
      </li>
    </ol>
  </div>
  <el-descriptions v-else :column="1" size="small" border class="metric-value metric-value--object">
    <el-descriptions-item v-for="[k, v] in entries" :key="k" :label="metricLabel(k)">
      <MetricValue :metric-key="k" :value="v" />
    </el-descriptions-item>
  </el-descriptions>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatMetric, isMetricArray, isMetricObject, metricLabel } from './reportFormat'

const props = defineProps<{
  /** 指標 key（比率/金額格式提示、清單項目的格式繼承皆靠它）。 */
  metricKey: string
  value: unknown
}>()

const kind = computed<'text' | 'object' | 'array'>(() => {
  if (isMetricArray(props.value)) return 'array'
  if (isMetricObject(props.value)) return 'object'
  return 'text'
})

const text = computed(() => formatMetric(props.metricKey, props.value))
const items = computed(() => (isMetricArray(props.value) ? props.value : []))
const entries = computed(() => (isMetricObject(props.value) ? Object.entries(props.value) : []))
</script>

<style scoped>
/* 數字／金額等純值一律單行顯示，不換行、不 ellipsis 截斷——只有 `<span>` 這種
   葉節點（`kind === 'text'`）才會命中，物件／陣列容器（`<div>`/`<el-descriptions>`）
   雖然共用 `.metric-value` class 但標籤不是 span，用標籤限定選擇器避免誤套用。 */
span.metric-value {
  white-space: nowrap;
}

.metric-value__list {
  margin: 0;
  padding-left: var(--space-5);
  text-align: left;
}

.metric-value--object {
  text-align: left;
}
</style>
