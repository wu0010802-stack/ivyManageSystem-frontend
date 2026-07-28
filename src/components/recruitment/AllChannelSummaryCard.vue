<template>
  <el-card class="all-channel-card" shadow="never">
    <template #header><span>全管道彙整</span></template>
    <!-- 用純 HTML table（el-table 在 jsdom 不渲染 row，且此處不需互動）-->
    <table class="channel-table">
      <thead>
        <tr><th>管道</th><th>參觀/報名</th><th>預繳</th><th>註冊</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.channel" :class="{ 'total-row': r.channel === '合計' }">
          <td>{{ r.channel }}</td>
          <td class="num">{{ r.visit }}</td>
          <td class="num">{{ r.deposit }}</td>
          <td class="num">{{ r.enrolled }}</td>
        </tr>
      </tbody>
    </table>
    <p class="scope-note">註：內部為當月快照、官網為回報區間，scope 略有差異，合計為參考值。</p>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElCard } from 'element-plus'
import { getRecruitmentIvykidsStats } from '@/api/recruitmentIvykids'
import { combineChannels, type ChannelCounts } from '@/utils/recruitmentChannels'

const props = defineProps<{
  internalSnapshot: { visit?: number; deposit?: number; enrolled?: number } | null
}>()
const ivykids = ref<{ total_visit?: number; total_deposit?: number; total_enrolled?: number }>({})

onMounted(async () => {
  const resp = await getRecruitmentIvykidsStats()
  ivykids.value = (resp.data as typeof ivykids.value) ?? {}
})

const combined = computed(() => combineChannels(props.internalSnapshot ?? undefined, ivykids.value))
const mk = (channel: string, c: ChannelCounts) => ({ channel, ...c })
const rows = computed(() => [
  mk('內部訪視', combined.value.internal),
  mk('官網報名', combined.value.ivykids),
  mk('合計', combined.value.total),
])
</script>

<style scoped>
.all-channel-card {
  margin-bottom: 16px;
}
.channel-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.channel-table th,
.channel-table td {
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding: 7px 10px;
  text-align: left;
}
.channel-table th {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--text-tertiary);
}
.channel-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.channel-table th:not(:first-child) {
  text-align: right;
}
.channel-table .total-row td {
  font-weight: 700;
  border-bottom: none;
  border-top: 1px solid var(--el-border-color, #dcdfe6);
}
.scope-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
