<script setup lang="ts">
import { computed } from 'vue'

// 稽核 changes 呈現共用元件：table expand 與歷史軌跡 drawer 兩處使用。
// changes 結構不一致：舊紀錄 {field: {before, after}}；新紀錄
// {action, ..., diff: {...}, risk_tags: [...]}。splitChanges 拆成
// nested-diff / flat-fields / meta 三段（邏輯自 AuditLogView 抽出，行為不變）。
const props = defineProps<{
  changes?: Record<string, unknown> | null
  fieldLabels?: Record<string, string>
}>()

const MAX_VALUE_LEN = 120

const hasChanges = computed(() => {
  const c = props.changes
  return !!c && typeof c === 'object' && Object.keys(c).length > 0
})

const label = (field: string) => props.fieldLabels?.[field] ?? field

const formatValue = (v: unknown): string => {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

const truncated = (v: unknown): string => {
  const s = formatValue(v)
  return s.length > MAX_VALUE_LEN ? s.slice(0, MAX_VALUE_LEN) + '…' : s
}

const META_KEYS = new Set([
  'risk_tags', 'failed', 'requested_ids', 'succeeded_ids',
  'approval_log_ids', 'sampled_student_ids',
])

const split = computed(() => {
  const c = (props.changes || {}) as Record<string, unknown>
  const nestedDiff: { field: string; before: unknown; after: unknown }[] = []
  const flatFields: { field: string; value: unknown }[] = []
  const meta: Record<string, unknown> = {}
  if (c.diff && typeof c.diff === 'object') {
    for (const [field, v] of Object.entries(c.diff as Record<string, unknown>)) {
      if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
        const entry = v as { before: unknown; after: unknown }
        nestedDiff.push({ field, before: entry.before, after: entry.after })
      }
    }
  }
  for (const [k, v] of Object.entries(c)) {
    if (k === 'diff' || k === 'before' || k === 'after') continue
    if (v && typeof v === 'object' && 'before' in v && 'after' in v) {
      const entry = v as { before: unknown; after: unknown }
      nestedDiff.push({ field: k, before: entry.before, after: entry.after })
    } else if (META_KEYS.has(k)) {
      meta[k] = v
    } else {
      flatFields.push({ field: k, value: v })
    }
  }
  if (c.before && c.after && typeof c.before === 'object' && typeof c.after === 'object') {
    const before = c.before as Record<string, unknown>
    const after = c.after as Record<string, unknown>
    for (const k of Object.keys(before)) {
      if (before[k] !== after[k]) {
        nestedDiff.push({ field: k, before: before[k], after: after[k] })
      }
    }
  }
  return { nestedDiff, flatFields, meta }
})
</script>

<template>
  <div class="changes-detail">
    <template v-if="hasChanges">
      <template v-if="split.nestedDiff.length > 0">
        <div class="diff-header">變更欄位</div>
        <el-table :data="split.nestedDiff" size="small" border>
          <el-table-column label="欄位" width="180">
            <template #default="{ row: r }">{{ label(r.field) }}</template>
          </el-table-column>
          <el-table-column label="變更前">
            <template #default="{ row: r }">
              <span class="diff-before" :title="formatValue(r.before)">{{ truncated(r.before) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="變更後">
            <template #default="{ row: r }">
              <span class="diff-after" :title="formatValue(r.after)">{{ truncated(r.after) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-if="split.flatFields.length > 0">
        <div class="diff-header" style="margin-top: 12px;">操作上下文</div>
        <el-table :data="split.flatFields" size="small" border>
          <el-table-column label="欄位" width="220">
            <template #default="{ row: r }">{{ label(r.field) }}</template>
          </el-table-column>
          <el-table-column label="值">
            <template #default="{ row: r }">
              <span class="diff-after" :title="formatValue(r.value)">{{ truncated(r.value) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-for="(v, k) in split.meta" :key="k">
        <div class="diff-header" style="margin-top: 12px;">{{ label(String(k)) }}</div>
        <pre class="meta-json">{{ formatValue(v) }}</pre>
      </template>
    </template>
    <div v-else class="no-changes">
      此紀錄未記錄欄位變更詳情（較早的紀錄或未接入 diff 的 endpoint）。
    </div>
  </div>
</template>

<style scoped>
.changes-detail {
  padding: var(--space-3);
  background: var(--background-secondary, #fafafa);
}
.diff-header {
  margin-bottom: var(--space-2);
  font-weight: 600;
}
.no-changes {
  color: var(--text-secondary, #888);
  padding: var(--space-2);
  font-style: italic;
}
.diff-before {
  color: var(--color-danger-darker);
  text-decoration: line-through;
  font-family: monospace;
}
.diff-after {
  color: var(--color-success-darker);
  font-family: monospace;
  font-weight: 500;
}
.meta-json {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
