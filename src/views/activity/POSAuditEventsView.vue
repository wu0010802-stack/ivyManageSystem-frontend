<template>
  <div class="pos-audit">
    <el-card>
      <template #header>
        <h2 class="pos-audit__title">{{ PAGE_TERMS.activityPosAudit }}</h2>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="解鎖事件" name="unlock">
          <div class="pos-audit__unlock-head">
            <el-select
              v-model="days"
              size="small"
              style="width: 140px"
              @change="loadUnlock"
            >
              <el-option :value="7" label="近 7 天" />
              <el-option :value="30" label="近 30 天" />
              <el-option :value="90" label="近 90 天" />
              <el-option :value="180" label="近 180 天" />
            </el-select>
          </div>

          <el-empty
            v-if="!loadingUnlock && events.length === 0"
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
        </el-tab-pane>

        <el-tab-pane label="操作員活動" name="operator">
          <OperatorActivityTab v-if="activeTab === 'operator'" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import OperatorActivityTab from '@/components/activity/OperatorActivityTab.vue'
import { getPOSUnlockEvents } from '@/api/activity'
import { PAGE_TERMS } from '@/constants/moduleTerms'

interface UnlockEvent { id: string | number; occurred_at?: string; action?: string; close_date?: string; unlocker_username?: string; unlocker_role?: string; comment?: string }

const activeTab = ref('unlock')
const days = ref(30)
const events = ref<UnlockEvent[]>([])
const loadingUnlock = ref(false)

async function loadUnlock() {
  loadingUnlock.value = true
  try {
    const { data } = await getPOSUnlockEvents(days.value)
    events.value = ((data as { events?: UnlockEvent[] })?.events || [])
  } catch (e) {
    const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ElMessage.error(detail || '載入失敗')
  } finally {
    loadingUnlock.value = false
  }
}

onMounted(loadUnlock)
</script>

<style scoped>
.pos-audit {
  padding: 16px;
}

.pos-audit__title {
  margin: 0;
  font-size: 18px;
}

.pos-audit__unlock-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.pos-audit__event-title {
  display: block;
  margin-bottom: 4px;
}

.pos-audit__event-meta {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.pos-audit__event-comment {
  font-size: 13px;
  color: var(--neutral-600);
  white-space: pre-wrap;
  background: var(--bg-color);
  padding: 8px 10px;
  border-radius: 6px;
}
</style>
