<template>
  <div class="pos-changes" v-loading="loading">
    <div class="pos-changes__filters">
      <el-checkbox-group :model-value="selectedTypes" @change="onTypesChange">
        <el-checkbox v-for="t in CHANGE_TYPES" :key="t" :value="t" :label="t" />
      </el-checkbox-group>
    </div>

    <el-alert
      v-if="!loading && truncated"
      type="warning"
      :closable="false"
      show-icon
      class="pos-changes__trunc-warn"
    >
      異動筆數超過系統單次查詢上限，僅顯示部分（共 {{ total }} 筆），請縮小類型篩選。
    </el-alert>

    <el-empty
      v-if="!loading && items.length === 0"
      description="本期無退課/加報"
      :image-size="48"
    />

    <el-timeline v-else class="pos-changes__timeline">
      <el-timeline-item
        v-for="(c, i) in items"
        :key="i"
        :timestamp="formatTaipeiDateTimeMinute(c.created_at)"
        :type="c.change_type === '退課' ? 'danger' : 'primary'"
      >
        <strong>{{ c.student_name }}</strong>
        <span v-if="c.class_name">（{{ c.class_name }}）</span>
        <el-tag
          size="small"
          :type="c.change_type === '退課' ? 'danger' : 'success'"
        >
          {{ c.change_type }}
        </el-tag>
        <div class="pos-changes__desc">{{ c.description }}</div>
        <div v-if="c.changed_by" class="pos-changes__by">by {{ c.changed_by }}</div>
      </el-timeline-item>
    </el-timeline>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { getPOSSemesterRegistrationChanges } from '@/api/activity'
import { formatTaipeiDateTimeMinute } from '@/utils/format'

interface ChangeItem {
  created_at?: string | null
  student_name: string
  class_name: string
  change_type: string
  description: string
  changed_by?: string | null
}

const CHANGE_TYPES = ['新增課程', '新增用品', '移除用品', '退課']

const props = defineProps<{
  schoolYear: number | null
  semester: number | null
}>()

const loading = ref(false)
const items = ref<ChangeItem[]>([])
const total = ref(0)
const truncated = ref(false)
const selectedTypes = ref<string[]>([...CHANGE_TYPES])

let reloadSeq = 0

async function reload() {
  if (!props.schoolYear || !props.semester) return
  const seq = ++reloadSeq
  loading.value = true
  try {
    const res = await getPOSSemesterRegistrationChanges({
      school_year: props.schoolYear,
      semester: props.semester,
      types: selectedTypes.value.join(','),
    })
    if (seq !== reloadSeq) return
    items.value = (res.data.items || []) as ChangeItem[]
    total.value = Number(res.data.total || 0)
    truncated.value = !!res.data.truncated
  } catch {
    if (seq !== reloadSeq) return
    ElMessage.error('異動記錄載入失敗')
  } finally {
    if (seq === reloadSeq) loading.value = false
  }
}

function onTypesChange(v: (string | number | boolean)[]) {
  selectedTypes.value = v.map(String)
  reload()
}

watch(() => [props.schoolYear, props.semester], reload, { immediate: true })

defineExpose({ reload })
</script>

<style scoped>
.pos-changes__filters {
  margin-bottom: 12px;
}

.pos-changes__trunc-warn {
  margin-bottom: 12px;
}

.pos-changes__timeline {
  padding-left: 4px;
}

.pos-changes__desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.pos-changes__by {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}
</style>
