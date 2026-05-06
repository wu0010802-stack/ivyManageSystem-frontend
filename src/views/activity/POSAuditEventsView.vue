<template>
  <div class="pos-audit">
    <el-card>
      <template #header>
        <div class="pos-audit__head">
          <h2 class="pos-audit__title">POS 日結異常稽核軌跡</h2>
          <el-select
            v-model="days"
            size="small"
            style="width: 140px"
            @change="load"
          >
            <el-option :value="7" label="近 7 天" />
            <el-option :value="30" label="近 30 天" />
            <el-option :value="90" label="近 90 天" />
            <el-option :value="180" label="近 180 天" />
          </el-select>
        </div>
      </template>

      <el-empty
        v-if="!loading && events.length === 0"
        :description="`近 ${days} 天無解鎖事件`"
        :image-size="80"
      />

      <el-timeline v-else>
        <el-timeline-item
          v-for="ev in events"
          :key="ev.id"
          :timestamp="ev.occurred_at || ''"
          :type="ev.action === 'admin_override' ? 'danger' : 'warning'"
          placement="top"
        >
          <div class="pos-audit__event">
            <strong class="pos-audit__event-title">
              {{ ev.action === 'admin_override' ? '🔓 Admin Override 解鎖' : '🔓 解鎖' }}
              — {{ ev.close_date || '—' }}
            </strong>
            <div class="pos-audit__event-meta">
              解鎖人：<code>{{ ev.unlocker_username }}</code>
              <span v-if="ev.unlocker_role">（{{ ev.unlocker_role }}）</span>
            </div>
            <div class="pos-audit__event-comment">{{ ev.comment }}</div>
          </div>
        </el-timeline-item>
      </el-timeline>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import { getPOSUnlockEvents } from '@/api/activity'

const days = ref(30)
const events = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await getPOSUnlockEvents(days.value)
    events.value = data?.events || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.pos-audit {
  padding: 16px;
}

.pos-audit__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.pos-audit__title {
  margin: 0;
  font-size: 18px;
}

.pos-audit__event-title {
  display: block;
  margin-bottom: 4px;
}

.pos-audit__event-meta {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 4px;
}

.pos-audit__event-comment {
  font-size: 13px;
  color: #475569;
  white-space: pre-wrap;
  background: #f8fafc;
  padding: 8px 10px;
  border-radius: 6px;
}
</style>
