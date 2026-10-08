<script setup lang="ts">
/**
 * 待辦清單（首頁「待你處理」、待辦 tab「待處理」、首頁「進行中」共用）。
 *
 * 取代改版前散在首頁頂部 banner、Bento 小卡、今日動態「晚一些」桶與 tab
 * 徽章的四種容器：同一份 buildPendingItems() 結果、同一種列樣式。
 * limit 用在首頁（只露前幾項，其餘導去待辦 tab）。
 */
import { computed } from 'vue'
import type { PendingItem } from '../../utils/pendingItems'

const props = withDefaults(defineProps<{
  title: string
  items: PendingItem[]
  limit?: number
  moreTo?: string
  /** 清單為空時的安心文案；不給則整段不渲染 */
  emptyText?: string
}>(), {
  limit: 0,
  moreTo: '',
  emptyText: '',
})

const visible = computed(() => (props.limit > 0 ? props.items.slice(0, props.limit) : props.items))
const showMore = computed(() => !!props.moreTo && props.limit > 0 && props.items.length > props.limit)
const actionCount = computed(() => props.items.filter((i) => i.tone !== 'info').length)
</script>

<template>
  <section v-if="items.length || emptyText" class="pi" :aria-label="title">
    <div class="pt-section-head">
      <h2 class="pt-section-title pi-title">
        {{ title }}
        <span v-if="actionCount > 0" class="pi-count">{{ actionCount }}</span>
      </h2>
      <!-- 不寫總項數：標題旁的數字只算待辦（資訊類不計），兩個數字並列會對不上 -->
      <router-link v-if="showMore" :to="moreTo" class="pi-more">查看全部</router-link>
    </div>

    <div v-if="visible.length" class="pi-list">
      <router-link
        v-for="it in visible"
        :key="it.key"
        :to="it.path"
        class="pi-row"
        :class="`tone-${it.tone}`"
        :data-pending="it.key"
      >
        <span class="pi-icon">
          <span class="material-symbols-rounded" aria-hidden="true">{{ it.icon }}</span>
        </span>
        <span class="pi-copy">
          <span class="pi-row-title">{{ it.title }}</span>
          <span class="pi-row-detail">{{ it.detail }}</span>
        </span>
        <span class="material-symbols-rounded pi-chev" aria-hidden="true">chevron_right</span>
      </router-link>
    </div>

    <p v-else class="pi-empty">
      <span class="material-symbols-rounded" aria-hidden="true">task_alt</span>
      {{ emptyText }}
    </p>
  </section>
</template>

<style scoped>
/* 元件內別名：主色與錯誤色在本元件多處使用，集中一處引用（token 遷移時只改這裡） */
.pi {
  --pi-accent: var(--m3-primary);
  --pi-danger: var(--m3-error);
}
.pi-title { display: flex; align-items: center; gap: 8px; }
.pi-count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  box-sizing: border-box;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  background: var(--pi-danger);
  color: var(--m3-on-error);
}
.pi-more {
  min-height: var(--touch-target-min, 44px);
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--pi-accent);
  text-decoration: none;
}

.pi-list {
  display: flex;
  flex-direction: column;
  padding: 2px var(--space-4, 16px);
  border-radius: var(--pt-card-radius);
  background: var(--pt-surface-card);
  box-shadow: var(--pt-shadow-card);
}
.pi-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  min-height: 56px;
  padding: 10px 0;
  color: inherit;
  text-decoration: none;
}
.pi-row + .pi-row { border-top: 1px solid var(--m3-outline-variant); }
.pi-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pi-icon .material-symbols-rounded { font-size: 22px; }
.tone-urgent .pi-icon { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-action .pi-icon { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-info .pi-icon { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.pi-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pi-row-title { font-size: 15px; font-weight: 800; }
.pi-row-detail { font-size: 13px; font-weight: 600; opacity: 0.72; }
/* 逾期說明用錯誤色強調；圖示底色與文字同時表達，不只靠顏色 */
.tone-urgent .pi-row-detail { opacity: 1; color: var(--pi-danger); }
.pi-chev { font-size: 22px; opacity: 0.5; flex-shrink: 0; }

.pi-empty {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px var(--space-4, 16px);
  border-radius: var(--pt-card-radius);
  background: var(--pt-surface-card);
  font-size: 14px;
  font-weight: 600;
}
.pi-empty .material-symbols-rounded { font-size: 22px; color: var(--pi-accent); }
</style>
