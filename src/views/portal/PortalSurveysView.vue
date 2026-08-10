<template>
  <div class="portal-survey-list" v-loading="loading">
    <el-empty v-if="!loading && rows.length === 0" description="尚無調查資料" />

    <div
      v-for="row in rows"
      :key="row.id"
      class="survey-card"
      data-test="survey-card"
      @click="goDetail(row.id)"
    >
      <div class="survey-card__title">{{ row.title }}</div>
      <div class="survey-card__meta">
        <span>活動日：{{ row.event_date ?? '-' }}</span>
        <span>回覆截止：{{ row.reply_deadline }}</span>
        <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listPortalSurveys } from '@/api/surveys'

interface Row {
  id: number
  title: string
  event_date: string | null
  reply_deadline: string
  status: string
  fee_note: string | null
}

const rows = ref<Row[]>([])
const loading = ref(false)
const router = useRouter()

function statusLabel(status: string): string {
  if (status === 'published') return '進行中'
  if (status === 'closed') return '已結束'
  return status
}

function statusTagType(status: string): 'success' | 'warning' | 'info' {
  if (status === 'published') return 'success'
  if (status === 'closed') return 'warning'
  return 'info'
}

async function fetchData() {
  loading.value = true
  try {
    const res = await listPortalSurveys()
    const data = res.data as unknown as { items?: Row[] }
    rows.value = data?.items ?? []
  } finally {
    loading.value = false
  }
}

function goDetail(id: number) {
  router.push({ name: 'portal-survey-detail', params: { id } })
}

onMounted(fetchData)
</script>

<style scoped>
.survey-card {
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 10px;
  cursor: pointer;
}
.survey-card__title {
  font-weight: 600;
  margin-bottom: 6px;
}
.survey-card__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
