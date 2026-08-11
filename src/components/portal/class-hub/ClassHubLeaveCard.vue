<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { listPortalStudentLeaves } from '@/api/portalStudentLeaves'
import { apiError } from '@/utils/error'

interface LeaveItem {
  id: number
  student_name: string | null
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
}

const items = ref<LeaveItem[]>([])
const loading = ref(false)
const errorMessage = ref('')

const periodText = (item: LeaveItem) =>
  item.start_date === item.end_date
    ? item.start_date
    : `${item.start_date} ~ ${item.end_date}`

const load = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await listPortalStudentLeaves()
    items.value = (res.data?.items ?? []) as unknown as LeaveItem[]
  } catch (error) {
    items.value = []
    errorMessage.value = apiError(error, '載入失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <!-- error 與 empty 必須分辨：網路失敗被誤讀為「今天沒人請假」是安全隱患
       （同 PortalClassHubView 的既有約束）。 -->
  <section class="leave-card pt-card-elevated" v-loading="loading && !items.length">
    <header class="leave-card__head">
      <span class="emoji" role="img" aria-label="請假">🏠</span>
      <h3>近期請假</h3>
    </header>

    <p v-if="errorMessage" class="leave-card__error">
      {{ errorMessage }}
      <button type="button" class="leave-card__retry" @click="load">重試</button>
    </p>
    <p v-else-if="!items.length" class="leave-card__empty">近期沒有請假</p>
    <ul v-else class="leave-card__list">
      <li v-for="item in items" :key="item.id">
        <span class="name">{{ item.student_name }}</span>
        <span class="type">{{ item.leave_type }}</span>
        <span class="period">{{ periodText(item) }}</span>
        <span v-if="item.reason" class="reason">{{ item.reason }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.leave-card {
  padding: 16px;
}

.leave-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.leave-card__head h3 {
  margin: 0;
  font-size: 16px;
}

.leave-card__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.leave-card__list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--el-border-color-lighter);
}

.leave-card__list .name {
  font-weight: 600;
}

.leave-card__list .reason {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.leave-card__empty,
.leave-card__error {
  margin: 0;
  color: var(--el-text-color-secondary);
}

.leave-card__retry {
  margin-left: 8px;
  border: none;
  background: none;
  color: var(--el-color-primary);
  cursor: pointer;
}
</style>
