<template>
  <section class="plan-applied-result" aria-labelledby="plan-applied-result-title">
    <!-- 已套用：取代問題摘要。套用後要處理的是「沒照計畫走的人」，名單可點到學生檔案。
         「仍在去年班」與「排除」可能是同一人，兩份名單去重後分開列、不相加 -->
    <header class="result-header">
      <h3 id="plan-applied-result-title" class="result-title">套用結果</h3>
      <span v-if="appliedDate" class="result-date">已於 {{ appliedDate }} 套用</span>
    </header>

    <ul class="result-stats">
      <li>搬到新班 {{ summary.moved_students }} 位</li>
      <li>畢業 {{ summary.graduated }} 位</li>
      <li>新建 {{ summary.created_classrooms }} 班・沿用 {{ summary.reused_classrooms }} 班</li>
    </ul>

    <p v-if="allApplied" class="result-done">所有學生都已照計畫套用</p>

    <div v-if="lists.leftBehind.length" class="result-list result-list--left-behind">
      <p class="list-title">仍在去年班 {{ lists.leftBehind.length }} 位</p>
      <p class="list-hint">沒有跟著升班的在籍生（例如發布後才入園），請到班級管理分班。</p>
      <ul>
        <li v-for="s in lists.leftBehind" :key="s.id">
          <router-link :to="`/students/profile/${s.id}`">{{ s.name }}</router-link>
          <span v-if="s.classroom_name" class="list-meta">{{ s.classroom_name }}</span>
        </li>
      </ul>
    </div>

    <div v-if="lists.excluded.length" class="result-list result-list--excluded">
      <p class="list-title">排除、仍在原班 {{ lists.excluded.length }} 位</p>
      <p class="list-hint">依計畫排除，套用時沒有搬動。</p>
      <ul>
        <li v-for="s in lists.excluded" :key="s.id">
          <router-link :to="`/students/profile/${s.id}`">{{ s.name }}</router-link>
          <span v-if="s.classroom_name" class="list-meta">{{ s.classroom_name }}</span>
        </li>
      </ul>
    </div>

    <div v-if="lists.skippedInactive.length" class="result-list result-list--skipped">
      <p class="list-title">已非在籍、略過 {{ lists.skippedInactive.length }} 位</p>
      <ul>
        <li v-for="s in lists.skippedInactive" :key="s.id">
          <router-link :to="`/students/profile/${s.id}`">{{ s.name }}</router-link>
          <span v-if="s.classroom_name" class="list-meta">{{ s.classroom_name }}</span>
        </li>
      </ul>
    </div>

    <div v-if="lists.capacityOverflow.length" class="result-list result-list--overflow">
      <p class="list-title">超過容量的班級</p>
      <ul>
        <li v-for="c in lists.capacityOverflow" :key="c.id">
          {{ c.target_name }} {{ c.current_count }}／{{ c.capacity ?? '—' }} 人
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Schema } from '@/api/_generated/typed'
import { appliedResultLists, formatPlanDate } from './planHelpers'

const props = defineProps<{
  summary: Schema<'PlanAppliedSummaryOut'>
  appliedAt?: string | null
}>()

const lists = computed(() => appliedResultLists(props.summary))
// applied_at 是台北時間的 naive 字串：只取日期，不經 Date 換算（避免瀏覽器時區位移）
const appliedDate = computed(() => formatPlanDate(props.appliedAt))
const allApplied = computed(() =>
  lists.value.leftBehind.length === 0
  && lists.value.excluded.length === 0
  && lists.value.skippedInactive.length === 0
  && lists.value.capacityOverflow.length === 0,
)
</script>

<style scoped>
.plan-applied-result {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  font-size: var(--text-sm);
}

.result-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
}

.result-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.result-date {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.result-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--text-primary);
}

.result-done {
  margin: 0;
  color: var(--color-success-darker);
}

.result-list ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 30vh;
  margin: var(--space-1) 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.list-title {
  margin: 0;
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.result-list--left-behind .list-title {
  color: var(--color-warning-darker);
}

.list-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.list-meta {
  margin-left: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
</style>
