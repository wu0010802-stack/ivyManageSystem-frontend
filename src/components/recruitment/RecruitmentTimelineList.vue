<template>
  <div class="rc-timeline" v-loading="loading">
    <div v-if="!loading && events.length === 0" class="rc-timeline__empty">
      {{ emptyText }}
    </div>
    <ul v-else-if="events.length" class="rc-timeline__list">
      <li
        v-for="(ev, idx) in events"
        :key="idx"
        class="rc-timeline__item"
        :class="`source--${ev.source}`"
      >
        <div class="rc-timeline__time">{{ formatTime(ev.created_at) }}</div>
        <div class="rc-timeline__event">
          <el-tag :type="ev.source === 'recruitment' ? 'warning' : 'success'" size="small">
            {{ ev.source === 'recruitment' ? '招生' : '學生' }}
          </el-tag>
          <span class="rc-timeline__type">{{ humanizeEventType(ev.event_type) }}</span>
        </div>
        <div v-if="ev.from_stage || ev.to_stage" class="rc-timeline__stage">
          {{ stageLabel(ev.from_stage) }} → {{ stageLabel(ev.to_stage) }}
        </div>
        <div v-if="ev.reason" class="rc-timeline__reason">{{ ev.reason }}</div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ElTag } from 'element-plus'
import {
  FUNNEL_EVENT_LABELS,
  FUNNEL_STAGE_LABELS,
  type FunnelStage,
} from '@/constants/recruitmentFunnel'
import type { Schema } from '@/api/_generated/typed'

type TimelineEvent = Schema<'TimelineEvent'>

/**
 * 招生訪視歷程的呈現層（2026-09-06 招生流程審查）。
 *
 * 原本有兩份幾乎逐字相同的實作：訪視明細的「歷程」與看板卡片的時間線抽屜，
 * 各自維護 humanize／formatTime／樣式，其中一份還用硬編灰階（深色模式看不清）。
 * 這裡只負責畫，資料由使用端各自取得（一個直接打 API、一個走 store 快取）。
 */
withDefaults(defineProps<{
  events: TimelineEvent[]
  loading?: boolean
  emptyText?: string
}>(), {
  loading: false,
  emptyText: '尚無歷程事件',
})

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

function humanizeEventType(t: string): string {
  return FUNNEL_EVENT_LABELS[t] ?? t
}

/** 階段顯示中文；未知或空值回破折號（舊資料可能帶已移除的 active）。 */
function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—'
  return FUNNEL_STAGE_LABELS[stage as FunnelStage] ?? stage
}
</script>

<style scoped>
.rc-timeline__empty {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px 0;
}
.rc-timeline__list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.rc-timeline__item {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color-light);
}
.rc-timeline__item:last-child {
  border-bottom: 0;
}
.rc-timeline__time {
  font-size: 12px;
  color: var(--text-tertiary);
}
.rc-timeline__event {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
}
.rc-timeline__type {
  font-weight: 600;
}
.rc-timeline__stage {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}
.rc-timeline__reason {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
