<script setup>
import { computed } from 'vue'
import { Money, Calendar, User, Warning, ArrowRight } from '@element-plus/icons-vue'

const props = defineProps({
  profile: { type: Object, required: true },
})
const emit = defineEmits(['goto-tab'])

const basic = computed(() => props.profile?.basic || {})
const lifecycle = computed(() => props.profile?.lifecycle || {})
const attendance = computed(() => props.profile?.attendance_summary || {})
const fee = computed(() => props.profile?.fee_summary || {})
const guardians = computed(() => props.profile?.guardians || [])
const incidents = computed(() => props.profile?.incident_summary || [])

const recentIncidents = computed(() => incidents.value.slice(0, 3))

const attendanceCount = (status) => attendance.value?.by_status?.[status] || 0

const primaryGuardian = computed(() =>
  guardians.value.find((g) => g.is_primary) || guardians.value[0] || null,
)

const formatDate = (iso) => {
  if (!iso) return '—'
  const s = String(iso)
  return s.length >= 10 ? s.slice(0, 10) : s
}
</script>

<template>
  <div class="overview-tab" v-if="profile">
    <!-- 統計摘要 -->
    <div class="stat-grid">
      <div class="stat-card stat-card--primary" @click="emit('goto-tab', 'attendance')">
        <div class="stat-icon"><el-icon :size="20"><Calendar /></el-icon></div>
        <div class="stat-body">
          <div class="stat-label">本學期出席</div>
          <div class="stat-value">{{ attendance.total_records || 0 }}</div>
          <div class="stat-sub">
            出席 {{ attendanceCount('出席') }}・缺席 {{ attendanceCount('缺席') }}
            <br />病假 {{ attendanceCount('病假') }}・事假 {{ attendanceCount('事假') }}
          </div>
        </div>
      </div>

      <div class="stat-card stat-card--success" @click="emit('goto-tab', 'fees')">
        <div class="stat-icon"><el-icon :size="20"><Money /></el-icon></div>
        <div class="stat-body">
          <div class="stat-label">學費狀態</div>
          <div class="stat-value">${{ fee.total_due || 0 }}</div>
          <div class="stat-sub">
            已繳 ${{ fee.total_paid || 0 }}<br />
            <span :class="{ 'text-danger': (fee.outstanding || 0) > 0 }">
              未繳 ${{ fee.outstanding || 0 }}
            </span>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card--info" @click="emit('goto-tab', 'guardians')">
        <div class="stat-icon"><el-icon :size="20"><User /></el-icon></div>
        <div class="stat-body">
          <div class="stat-label">監護人</div>
          <div class="stat-value">{{ guardians.length }}</div>
          <div class="stat-sub">
            <template v-if="primaryGuardian">
              主要：{{ primaryGuardian.name }}<br />
              <span class="muted">{{ primaryGuardian.phone || '無電話' }}</span>
            </template>
            <template v-else>
              <span class="text-warning">尚無主要聯絡人</span>
            </template>
          </div>
        </div>
      </div>

      <div class="stat-card stat-card--danger" @click="emit('goto-tab', 'records')">
        <div class="stat-icon"><el-icon :size="20"><Warning /></el-icon></div>
        <div class="stat-body">
          <div class="stat-label">最近事件</div>
          <div class="stat-value">{{ incidents.length }}</div>
          <div class="stat-sub">
            <template v-if="incidents.length">最近：{{ incidents[0].incident_type }}</template>
            <template v-else>無紀錄</template>
          </div>
        </div>
      </div>
    </div>

    <!-- 入學/離園資訊 -->
    <div class="info-row">
      <el-card shadow="never" class="info-card">
        <template #header>
          <div class="info-header">
            <span>學籍狀態</span>
          </div>
        </template>
        <el-descriptions :column="1" size="small">
          <el-descriptions-item label="入學日">{{ formatDate(lifecycle.enrollment_date) }}</el-descriptions-item>
          <el-descriptions-item v-if="lifecycle.graduation_date" label="畢業日">
            {{ formatDate(lifecycle.graduation_date) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="lifecycle.withdrawal_date" label="離園日">
            {{ formatDate(lifecycle.withdrawal_date) }}
          </el-descriptions-item>
          <el-descriptions-item label="學籍備註">{{ basic.notes || '—' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never" class="info-card">
        <template #header>
          <div class="info-header">
            <span>近期事件</span>
            <el-button v-if="incidents.length > 3" size="small" link @click="emit('goto-tab', 'records')">
              查看全部 <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </template>
        <el-empty v-if="!recentIncidents.length" description="無近期事件" :image-size="60" />
        <ul v-else class="event-list">
          <li v-for="(it, idx) in recentIncidents" :key="idx" class="event-item">
            <el-tag size="small" type="danger">{{ it.incident_type }}</el-tag>
            <span class="event-date">{{ formatDate(it.occurred_at) }}</span>
            <span class="event-text">{{ it.description }}</span>
          </li>
        </ul>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  cursor: pointer;
  transition: all 0.18s;
}
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card--primary .stat-icon { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.stat-card--success .stat-icon { background: var(--el-color-success-light-9); color: var(--el-color-success); }
.stat-card--info .stat-icon { background: var(--el-color-info-light-9); color: var(--el-color-info); }
.stat-card--danger .stat-icon { background: var(--el-color-danger-light-9); color: var(--el-color-danger); }

.stat-body {
  flex: 1;
  min-width: 0;
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 2px;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 4px;
  color: var(--el-text-color-primary);
}
.stat-sub {
  font-size: 12px;
  color: var(--el-text-color-regular);
  line-height: 1.4;
}

.info-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 768px) {
  .info-row { grid-template-columns: 1fr; }
}

.info-card :deep(.el-card__header) {
  padding: 10px 14px;
}
.info-card :deep(.el-card__body) {
  padding: 12px 14px;
}
.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.event-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.event-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 13px;
}
.event-item:last-child { border-bottom: none; }
.event-date {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
}
.event-text {
  flex: 1;
  color: var(--el-text-color-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted { color: var(--el-text-color-secondary); }
.text-danger { color: var(--el-color-danger); font-weight: 600; }
.text-warning { color: var(--el-color-warning); font-weight: 600; }
</style>
