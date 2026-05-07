<script setup>
import { computed } from 'vue'

const props = defineProps({
  sessions: { type: Array, required: true },
  filterCourseId: { type: [Number, null], default: null },
  filterStartDate: { type: String, default: null },
  filterEndDate: { type: String, default: null },
  activeMonth: { type: [String, null], default: null },
  loading: { type: Boolean, default: false },
})

defineEmits([
  'update:filterCourseId',
  'update:filterStartDate',
  'update:filterEndDate',
  'set-month',
  'manual-date-change',
  'open-rollcall',
])

const courses = computed(() => {
  const map = new Map()
  props.sessions.forEach(s => {
    if (!map.has(s.course_id)) {
      map.set(s.course_id, { id: s.course_id, name: s.course_name })
    }
  })
  return Array.from(map.values())
})

const filteredSessions = computed(() => {
  if (!props.filterCourseId) return props.sessions
  return props.sessions.filter(s => s.course_id === props.filterCourseId)
})
</script>

<template>
  <div class="session-list">
    <!-- 篩選列 -->
    <el-row :gutter="12" class="filter-row" align="middle">
      <el-col :xs="24" :sm="9">
        <el-select
          :model-value="filterCourseId"
          placeholder="選擇課程（全部）"
          clearable
          style="width: 100%"
          @update:model-value="$emit('update:filterCourseId', $event)"
          @change="$emit('manual-date-change')"
        >
          <el-option
            v-for="c in courses"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
      </el-col>
      <el-col :xs="24" :sm="15">
        <el-space wrap>
          <el-button-group>
            <el-button
              :type="activeMonth === 'prev' ? 'primary' : ''"
              size="small"
              @click="$emit('set-month', 'prev')"
            >上月</el-button>
            <el-button
              :type="activeMonth === 'current' ? 'primary' : ''"
              size="small"
              @click="$emit('set-month', 'current')"
            >本月</el-button>
            <el-button
              :type="activeMonth === 'next' ? 'primary' : ''"
              size="small"
              @click="$emit('set-month', 'next')"
            >下月</el-button>
          </el-button-group>
          <el-date-picker
            :model-value="filterStartDate"
            type="date"
            placeholder="開始日期"
            value-format="YYYY-MM-DD"
            style="width: 140px"
            @update:model-value="$emit('update:filterStartDate', $event)"
            @change="$emit('manual-date-change')"
          />
          <el-date-picker
            :model-value="filterEndDate"
            type="date"
            placeholder="結束日期"
            value-format="YYYY-MM-DD"
            style="width: 140px"
            @update:model-value="$emit('update:filterEndDate', $event)"
            @change="$emit('manual-date-change')"
          />
        </el-space>
      </el-col>
    </el-row>

    <!-- 場次列表 -->
    <div v-if="loading" v-loading="true" style="min-height: 200px" />
    <template v-else>
      <el-table
        v-if="filteredSessions.length > 0"
        :data="filteredSessions"
        border
        stripe
        style="margin-top: 12px"
      >
        <el-table-column label="日期" prop="session_date" width="120" align="center" />
        <el-table-column label="課程" prop="course_name" min-width="120" />
        <el-table-column label="自班出席" width="140" align="center">
          <template #default="{ row }">
            <span v-if="row.recorded_count === 0" class="no-record">尚未點名</span>
            <span v-else>
              <span class="present-count">{{ row.present_count }}</span>
              <span class="count-sep"> / {{ row.recorded_count }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              size="small"
              @click="$emit('open-rollcall', row)"
            >點名</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="empty-hint">目前沒有相關場次。</div>
    </template>
  </div>
</template>

<style scoped>
.session-list { display: flex; flex-direction: column; }
.filter-row { margin-top: 12px; margin-bottom: 12px; }
.no-record { color: #94a3b8; font-size: 13px; }
.present-count { color: #22c55e; font-weight: 600; }
.count-sep { color: #94a3b8; }
.empty-hint { text-align: center; color: #94a3b8; padding: 24px 0; font-size: 14px; }
</style>
