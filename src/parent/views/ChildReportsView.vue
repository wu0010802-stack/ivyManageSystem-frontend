<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { fetchChildReports, childReportDownloadUrl } from '../api/childReports'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

const route = useRoute()
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

function formatDate(s) {
  if (!s) return ''
  try { return new Date(s).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return s }
}

onMounted(load)
</script>

<template>
  <div class="reports-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">成長報告</p>
      <h1 class="pt-page-hero-title">歷次完整報告</h1>
      <p class="pt-page-hero-note">期末由老師整理的學期回顧 PDF</p>
    </header>

    <template v-if="loading">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="2" />
      </div>
    </template>

    <EmptyState
      v-else-if="items.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      title="目前還沒有成長報告"
      description="期末時老師會幫您準備"
    />

    <div v-else class="pt-stack-12 pt-section-pad-x">
      <article v-for="r in items" :key="r.id" class="report-card">
        <div class="report-icon" aria-hidden="true">
          <span class="material-symbols-rounded">menu_book</span>
        </div>
        <div class="report-info">
          <h2 class="report-title">{{ r.period_label }}</h2>
          <p class="report-period">{{ r.period_start }} ~ {{ r.period_end }}</p>
          <p v-if="r.generated_at" class="report-meta">生成於 {{ formatDate(r.generated_at) }}</p>
        </div>
        <button type="button" class="pt-action-btn download-btn" @click="onDownload(r)">
          <span class="material-symbols-rounded" aria-hidden="true">download</span>
          下載 PDF
        </button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.reports-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

.report-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 16px;
  padding: 14px 14px 14px 16px;
}
.report-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--leaf-100, #dcf4e6);
  color: var(--brand-primary, #0d9053);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.report-icon .material-symbols-rounded {
  font-size: 24px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.report-info { flex: 1; min-width: 0; }
.report-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.3;
}
.report-period {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--pt-text-muted);
  letter-spacing: 0.02em;
}
.report-meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--pt-text-faint);
}

.download-btn {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 13px;
}
</style>
