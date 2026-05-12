<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchChildReports, childReportDownloadUrl } from '../api/childReports'
import { toast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const studentId = computed(() => Number(route.params.studentId))

const items = ref([])
const loading = ref(false)

async function load() {
  if (!studentId.value) return
  loading.value = true
  try {
    const r = await fetchChildReports(studentId.value)
    items.value = r.data.items || []
  } catch (e) {
    toast.error(e?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

function onDownload(report) {
  window.open(childReportDownloadUrl(studentId.value, report.id), '_blank')
}

function goBack() {
  router.back()
}

onMounted(load)
</script>

<template>
  <div class="child-reports-view">
    <header>
      <button class="back-btn" @click="goBack">← 返回</button>
      <h2>📄 歷次成長報告</h2>
    </header>

    <div v-if="loading" class="placeholder">載入中…</div>
    <div v-else-if="items.length === 0" class="placeholder">
      <p>目前還沒有成長報告</p>
      <p class="hint">期末時老師會幫您準備</p>
    </div>
    <div v-else class="list">
      <div v-for="r in items" :key="r.id" class="report-card">
        <div class="info">
          <div class="title">{{ r.period_label }}</div>
          <div class="meta">{{ r.period_start }} ~ {{ r.period_end }}</div>
          <div v-if="r.generated_at" class="meta">
            生成：{{ new Date(r.generated_at).toLocaleDateString() }}
          </div>
        </div>
        <button class="download-btn" @click="onDownload(r)">下載 PDF</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.child-reports-view {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
header { display: flex; align-items: center; gap: 12px; }
header > h2 { margin: 0; font-size: 17px; color: #0d9053; }
.back-btn {
  background: none;
  border: none;
  font-size: 14px;
  color: #0d9053;
}
.placeholder {
  padding: 32px 16px;
  text-align: center;
  color: #9ca3af;
}
.placeholder .hint { font-size: 13px; margin-top: 4px; }
.list { display: flex; flex-direction: column; gap: 10px; }
.report-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.title { font-weight: 600; color: #0d9053; }
.meta { font-size: 13px; color: #6b7280; }
.download-btn {
  background: #0d9053;
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
}
</style>
