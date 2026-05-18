<template>
  <el-card v-if="total > 0" class="disability-expiry-card" shadow="never">
    <template #header>
      <div class="card-title">
        <el-icon><Warning /></el-icon>
        <span>身障鑑定即將到期</span>
        <el-tag size="small" type="warning" effect="dark">{{ total }}</el-tag>
      </div>
    </template>
    <ul class="expiry-list">
      <li v-for="s in students" :key="s.id">
        <span class="name">{{ s.name }}</span>
        <span class="meta">{{ s.disability_cert_expiry }}（剩 {{ s.days_remaining }} 天）</span>
      </li>
    </ul>
    <p class="hint">鑑定到期後補助與 IEP 無法續辦，請及早協助家長辦理重新鑑定。</p>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Warning } from '@element-plus/icons-vue'
import * as govMoe from '@/api/govMoe'

interface DisabilityStudent {
  id: number | string
  name?: string
  disability_cert_expiry?: string
  days_remaining?: number
}

const total = ref(0)
const students = ref<DisabilityStudent[]>([])

onMounted(async () => {
  try {
    const { data } = await govMoe.getDisabilityExpiryWidget(30)
    total.value = (data.total as number) || 0
    students.value = (data.students as DisabilityStudent[]) || []
  } catch (e) {
    // silently ignore (admin perm may be absent)
    total.value = 0
  }
})
</script>

<style scoped>
.disability-expiry-card {
  margin-bottom: 16px;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.expiry-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.expiry-list li {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--el-border-color-lighter, #eee);
}
.expiry-list li:last-child {
  border-bottom: none;
}
.name {
  font-weight: 500;
}
.meta {
  color: var(--el-text-color-secondary, #888);
  font-size: 13px;
}
.hint {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary, #888);
  font-size: 12px;
}
</style>
