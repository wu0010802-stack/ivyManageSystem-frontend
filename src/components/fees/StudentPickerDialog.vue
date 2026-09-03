<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="560px"
    append-to-body
    data-test="student-picker"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p v-if="hint" class="hint">{{ hint }}</p>
    <div class="search-row">
      <el-input
        v-model="keyword"
        placeholder="輸入學生姓名"
        clearable
        data-test="picker-search"
        aria-label="搜尋學生姓名"
        @keyup.enter="runSearch"
      />
      <el-button type="primary" :loading="searching" data-test="picker-run" @click="runSearch">
        搜尋
      </el-button>
    </div>
    <table v-if="rows.length" class="picker-table">
      <thead>
        <tr>
          <th>姓名</th>
          <th>班級</th>
          <th>狀態</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in rows" :key="s.id" data-test="picker-row">
          <td>{{ s.name }}</td>
          <td>{{ s.classroom_name || '—' }}</td>
          <td>{{ statusLabel(s) }}</td>
          <td>
            <el-button size="small" type="primary" text data-test="picker-pick" @click="pick(s)">
              選這位
            </el-button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="searched" class="hint" data-test="picker-empty">查無在籍學生，請確認姓名</p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">關閉</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 學生挑選 dialog（SPEC-019 §5.2）：檢核檔姓名對不上在籍學生時人工指定；
 * 新生預繳登記也用它挑學生。只做搜尋＋挑選，不改任何資料。
 *
 * ⚠ `GET /students` 的 StudentListItemOut 目前沒有 classroom_name，
 * 只有 classroom_id；班級欄在後端補欄位前會顯示「—」，同名學生改看狀態欄辨識。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getStudents } from '@/api/students'
import { friendlyError } from '@/utils/errorMessages'

interface PickerStudent {
  id: number
  name: string
  classroom_name?: string | null
  lifecycle_status?: string | null
  status?: string | null
}

withDefaults(defineProps<{ modelValue: boolean; title?: string; hint?: string }>(), {
  title: '指定學生',
  hint: '',
})

const emit = defineEmits<{
  'update:modelValue': [visible: boolean]
  pick: [student: { id: number; name: string; classroom_name: string | null }]
}>()

const keyword = ref('')
const rows = ref<PickerStudent[]>([])
const searching = ref(false)
const searched = ref(false)

function statusLabel(s: PickerStudent): string {
  return s.lifecycle_status || s.status || '—'
}

async function runSearch() {
  const kw = keyword.value.trim()
  if (!kw) return
  searching.value = true
  try {
    const res = await getStudents({ search: kw, limit: 20 })
    const data = res.data as unknown as { items?: PickerStudent[] } | PickerStudent[]
    rows.value = Array.isArray(data) ? data : (data.items ?? [])
    searched.value = true
  } catch (e) {
    ElMessage.error(friendlyError('搜尋學生失敗', e))
  } finally {
    searching.value = false
  }
}

function pick(s: PickerStudent) {
  emit('pick', { id: s.id, name: s.name, classroom_name: s.classroom_name ?? null })
  emit('update:modelValue', false)
}
</script>

<style scoped>
.hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.picker-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.picker-table th,
.picker-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: left;
}
</style>
