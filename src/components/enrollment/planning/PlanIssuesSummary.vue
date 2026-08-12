<template>
  <div class="plan-issues-summary">
    <div v-if="!hasIssues" class="issues-empty">
      <el-icon class="empty-icon"><CircleCheck /></el-icon>
      目前沒有偵測到問題
    </div>

    <section
      v-for="severity in visibleSeverities"
      :key="severity.key"
      class="severity-section"
      :class="`severity-${severity.key}`"
    >
      <div class="severity-header">
        <span class="severity-title">{{ severity.label }}</span>
        <span class="severity-count">{{ severity.total }}</span>
      </div>
      <div v-for="group in severity.groups" :key="group.key" class="issue-group">
        <button type="button" class="group-toggle" @click="toggleGroup(group.key)">
          <el-icon class="group-arrow" :class="{ expanded: expandedGroups.has(group.key) }">
            <ArrowRight />
          </el-icon>
          <span class="group-title">{{ group.title }}</span>
          <span class="group-count">{{ group.items.length }}</span>
        </button>
        <ul v-if="expandedGroups.has(group.key)" class="group-items">
          <li
            v-for="(issue, idx) in group.items"
            :key="idx"
            class="issue-item"
            role="button"
            tabindex="0"
            @click="emit('locate-issue', issue)"
            @keydown.enter.space.prevent="emit('locate-issue', issue)"
          >{{ issue.message }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, CircleCheck } from '@element-plus/icons-vue'
import type { Schema } from '@/api/_generated/typed'

// 問題聚合摘要：同 code 併為一組（標題 + 計數），預設收合，展開才見逐筆。
// 取代逐筆平鋪的 PlanIssuesPanel（207 筆同文案問題曾把版面撐到 7000px+）。
// locate-issue 事件名與 payload 沿用舊 PlanIssuesPanel 契約，父層接線不變。

type IssuesOut = Schema<'IssuesOut'>
type IssueOut = Schema<'IssueOut'>

const props = defineProps<{ issues: IssuesOut }>()
const emit = defineEmits<{ 'locate-issue': [issue: IssueOut] }>()

// 與後端 services/classroom_year_plan/issues.py 的 code 對齊；未知 code fallback
// 用該組首筆 message 當標題（後端新增 code 時前端不壞版）。
const GROUP_TITLES: Record<string, string> = {
  student_unassigned: '學生尚未分派班級',
  retain_wrong_grade: '留級學生年級不符',
  capacity_exceeded: '班級人數超過容量',
  head_teacher_missing: '班級尚未指派導師',
  teacher_duplicate: '教師重複指派多班',
  student_missing_from_plan: '在籍生不在草稿中，需重新產生',
  plan_student_inactive: '學生已非在籍，套用時將跳過',
  assistant_teacher_missing: '班級尚未指派副班導',
  art_teacher_missing: '班級尚未指派美語老師',
}

interface IssueGroup {
  key: string
  title: string
  items: IssueOut[]
}

function groupByCode(items: IssueOut[], severity: string): IssueGroup[] {
  const order: string[] = []
  const map = new Map<string, IssueOut[]>()
  for (const issue of items) {
    if (!map.has(issue.code)) {
      map.set(issue.code, [])
      order.push(issue.code)
    }
    map.get(issue.code)!.push(issue)
  }
  return order.map(code => ({
    key: `${severity}:${code}`,
    title: GROUP_TITLES[code] ?? map.get(code)![0].message,
    items: map.get(code)!,
  }))
}

const visibleSeverities = computed(() =>
  [
    {
      key: 'blocking',
      label: '阻擋發布',
      total: props.issues.blocking.length,
      groups: groupByCode(props.issues.blocking, 'blocking'),
    },
    {
      key: 'warning',
      label: '提醒事項',
      total: props.issues.warnings.length,
      groups: groupByCode(props.issues.warnings, 'warning'),
    },
  ].filter(s => s.total > 0),
)

const hasIssues = computed(
  () => props.issues.blocking.length > 0 || props.issues.warnings.length > 0,
)

const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string): void {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key)
  else expandedGroups.value.add(key)
}
</script>

<style scoped>
.plan-issues-summary {
  font-size: var(--text-sm);
}

.issues-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  padding: var(--space-2) 0;
}

.empty-icon {
  color: var(--color-success);
}

.severity-section {
  margin-bottom: var(--space-3);
}

.severity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.severity-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 700;
}

.severity-blocking .severity-count {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.severity-warning .severity-count {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.issue-group {
  margin-bottom: 2px;
}

.group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.group-toggle:hover {
  background: var(--neutral-100);
}

.group-arrow {
  transition: transform 0.15s ease;
  color: var(--text-secondary);
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

.group-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.severity-blocking .group-count {
  color: var(--color-danger-hover);
}

.group-items {
  list-style: none;
  margin: 2px 0 var(--space-2);
  padding: 0 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 40vh;
  overflow-y: auto;
}

.issue-item {
  cursor: pointer;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.severity-blocking .issue-item {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.severity-warning .issue-item {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.issue-item:hover {
  filter: brightness(0.95);
}
</style>
