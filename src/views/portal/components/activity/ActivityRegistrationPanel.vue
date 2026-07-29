<script setup lang="ts">
import { computed } from 'vue'
import { COURSE_STATUS_LABEL, COURSE_STATUS_TAG_TYPE } from '@/constants/activity'
import { formatActivityDate } from '@/utils/format'

interface Registration { class_name?: string | null; [key: string]: unknown }
interface ActivityData {
  summary?: Record<string, unknown> | null
  registrations?: Registration[]
  classrooms?: string[]
  [key: string]: unknown
}

const props = defineProps<{
  data?: ActivityData | null
  activeClass?: string | null
  loading?: boolean
}>()

defineEmits<{ 'update:activeClass': [value: string] }>()

const summary = computed(() => props.data?.summary || null)
const registrations = computed(() => {
  if (!props.data) return []
  if (!props.activeClass) return props.data.registrations ?? []
  return (props.data.registrations ?? []).filter((r: Registration) => r.class_name === props.activeClass)
})
const classrooms = computed(() => props.data?.classrooms || [])
const showClassTabs = computed(() => classrooms.value.length > 1)

function courseStatusLabel(status: string): string {
  return (COURSE_STATUS_LABEL as Record<string, string>)[status] || status
}
</script>

<template>
  <div class="registration-panel" v-if="data">
    <!-- 摘要統計卡片 -->
    <el-row :gutter="12" class="summary-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card">
          <div class="card-val">{{ summary?.total_registrations ?? 0 }}</div>
          <div class="card-label">已報名人數</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card">
          <div class="card-val">{{ summary?.total_enrolled ?? 0 }}</div>
          <div class="card-label">正式報名數</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card">
          <div class="card-val">{{ summary?.total_waitlist ?? 0 }}</div>
          <div class="card-label">候補人次</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="summary-card">
          <div class="card-val">{{ summary?.total_paid ?? 0 }}</div>
          <div class="card-label">已繳費人數</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 班級切換 Tabs（多班時顯示） -->
    <el-tabs
      v-if="showClassTabs"
      :model-value="(activeClass as string)"
      @update:model-value="(v) => $emit('update:activeClass', String(v))"
      style="margin-top: 16px"
    >
      <el-tab-pane
        v-for="cls in classrooms"
        :key="cls"
        :label="cls"
        :name="cls"
      />
    </el-tabs>

    <!-- 報名列表 -->
    <el-table
      :data="registrations"
      border
      stripe
      style="margin-top: 12px"
      v-loading="loading ?? false"
    >
      <el-table-column label="學生" prop="student_name" min-width="90" />
      <el-table-column label="班級" prop="class_name" width="90" align="center" />
      <el-table-column label="課程" min-width="200">
        <template #default="{ row }">
          <span v-if="row.courses.length === 0" class="no-course">—</span>
          <el-tag
            v-for="(c, idx) in row.courses"
            :key="idx"
            :type="((COURSE_STATUS_TAG_TYPE as Record<string, string>)[c.status as string] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger'"
            size="small"
            style="margin: 2px"
          >
            {{ c.course_name }}
            <span>
              （{{ courseStatusLabel(c.status) }}<template
                v-if="c.status === 'waitlist' && c.waitlist_position"
              > #{{ c.waitlist_position }}</template>）
            </span>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="繳費" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_paid ? 'success' : 'warning'" size="small">
            {{ row.is_paid ? '已繳費' : '未繳費' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="報名時間" min-width="130">
        <template #default="{ row }">{{ formatActivityDate(row.created_at) }}</template>
      </el-table-column>
    </el-table>

    <div v-if="registrations.length === 0 && !loading" class="empty-hint">
      目前沒有學生報名才藝課程。
    </div>
  </div>
</template>

<style scoped>
.summary-row { margin-bottom: 16px; }
.summary-card { text-align: center; padding: 4px 0; }
.card-val { font-size: 28px; font-weight: 700; color: var(--color-info-darker); }
.card-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.no-course { color: var(--text-tertiary); }
.empty-hint { text-align: center; color: var(--text-tertiary); padding: 24px 0; font-size: 14px; }
</style>
