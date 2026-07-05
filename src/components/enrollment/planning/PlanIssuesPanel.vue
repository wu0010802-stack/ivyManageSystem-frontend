<template>
  <div class="plan-issues-panel">
    <div v-if="!hasIssues" class="issues-empty">目前沒有偵測到問題</div>

    <template v-else>
      <div v-if="issues.blocking.length" class="issues-group blocking-group">
        <div class="group-header">
          阻擋發布
          <span class="issue-count blocking-count">{{ issues.blocking.length }}</span>
        </div>
        <ul class="issues-list">
          <li
            v-for="(issue, idx) in issues.blocking"
            :key="`blocking-${idx}`"
            class="issue-item blocking-item"
            @click="emit('locate-issue', issue)"
          >{{ issue.message }}</li>
        </ul>
      </div>

      <div v-if="issues.warnings.length" class="issues-group warning-group">
        <div class="group-header">
          提醒事項
          <span class="issue-count warning-count">{{ issues.warnings.length }}</span>
        </div>
        <ul class="issues-list">
          <li
            v-for="(issue, idx) in issues.warnings"
            :key="`warning-${idx}`"
            class="issue-item warning-item"
            @click="emit('locate-issue', issue)"
          >{{ issue.message }}</li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Schema } from '@/api/_generated/typed'

type IssuesOut = Schema<'IssuesOut'>
type IssueOut = Schema<'IssueOut'>

const props = defineProps<{
  issues: IssuesOut
}>()

const emit = defineEmits<{
  'locate-issue': [issue: IssueOut]
}>()

const hasIssues = computed(() => props.issues.blocking.length > 0 || props.issues.warnings.length > 0)
</script>

<style scoped>
.plan-issues-panel {
  font-size: 13px;
}

.issues-empty {
  color: var(--text-secondary);
  padding: var(--space-2) 0;
}

.issues-group {
  margin-bottom: var(--space-3);
}

.group-header {
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--space-2);
}

.issue-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full, 9999px);
  font-size: 11px;
  font-weight: 700;
}

.blocking-count {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.warning-count {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.issues-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.issue-item {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.blocking-item {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.blocking-item:hover {
  filter: brightness(0.95);
}

.warning-item {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.warning-item:hover {
  filter: brightness(0.95);
}
</style>
