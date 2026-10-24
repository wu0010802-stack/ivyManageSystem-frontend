<script setup lang="ts">
import { computed } from 'vue'
import { COURSE_STATUS_LABEL, COURSE_STATUS_TAG_TYPE } from '@/constants/activity'
import { formatActivityDate } from '@/utils/format'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

interface CourseTag { course_name: string; status: string; waitlist_position?: number }

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

const { isMobile } = useIsMobile()

const regCardColumns = [
  { label: '課程', prop: 'courses', block: true },   // tags → #cell-courses
  { label: '繳費', prop: 'is_paid' },                // tag → #cell-is_paid
  {
    label: '報名時間',
    prop: 'created_at',
    formatter: (i: Record<string, unknown>) => formatActivityDate(i.created_at as string),
  },
]
</script>

<template>
  <div class="registration-panel" v-if="data">
    <!-- 報名摘要（P2-07）：原本 4 個大數字方塊，值多半是 0，改成一句話 -->
    <p class="reg-summary">
      已報名 <strong>{{ summary?.total_registrations ?? 0 }}</strong> 人・
      正式 {{ summary?.total_enrolled ?? 0 }}・
      候補 {{ summary?.total_waitlist ?? 0 }}・
      已繳費 {{ summary?.total_paid ?? 0 }}
    </p>

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
    <!-- 桌機表格；手機用卡片（課程欄會塞多個 tag，390px 完全讀不了，P2-06） -->
    <el-table
      v-if="!isMobile"
      empty-text="目前沒有學生報名才藝課程"
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

    <AdminListCards
      v-else
      :items="registrations as unknown as Record<string, unknown>[]"
      :columns="regCardColumns"
      row-key="student_name"
      :loading="loading ?? false"
      empty-text="目前沒有學生報名才藝課程"
    >
      <template #title="{ item }">
        {{ item.student_name }}
        <span class="reg-card__class">{{ item.class_name }}</span>
      </template>
      <template #cell-courses="{ item }">
        <span v-if="(item.courses as unknown[]).length === 0" class="no-course">—</span>
        <el-tag
          v-for="(c, idx) in (item.courses as CourseTag[])"
          :key="idx"
          :type="((COURSE_STATUS_TAG_TYPE as Record<string, string>)[c.status] || 'info') as 'primary' | 'success' | 'warning' | 'info' | 'danger'"
          size="small"
          style="margin: 2px"
        >
          {{ c.course_name }}（{{ courseStatusLabel(c.status)
          }}<template v-if="c.status === 'waitlist' && c.waitlist_position"> #{{ c.waitlist_position }}</template>）
        </el-tag>
      </template>
      <template #cell-is_paid="{ item }">
        <el-tag :type="item.is_paid ? 'success' : 'warning'" size="small">
          {{ item.is_paid ? '已繳費' : '未繳費' }}
        </el-tag>
      </template>
    </AdminListCards>


  </div>
</template>

<style scoped>
.reg-summary {
  margin: 0 0 16px;
  font-size: var(--text-base);
  color: var(--el-text-color-primary);
}
.reg-summary strong {
  font-size: var(--text-xl);
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}
.reg-card__class {
  margin-left: 8px;
  font-size: var(--text-xs);
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.no-course { color: var(--text-tertiary); }
.empty-hint { text-align: center; color: var(--text-tertiary); padding: 24px 0; font-size: 14px; }
</style>
