<script setup lang="ts">
/**
 * 首頁「待辦」區塊。
 *
 * 取代 2026-09-02 之前的三處重複：頂部兩張 sticky 橫幅（待簽／活動調查）、
 * bento 的四格待辦方格、今日動態「晚一些」桶裡的五種寫死事件。資料一律來自
 * useParentTodos，本元件只負責呈現與三態。
 *
 * 刻意不引入 @/components/common/EmptyState：那支落在 admin-core chunk，
 * 首頁是家長端 entry 首屏，靜態 import 會被 check-entry-chunks gate 擋下。
 * 本區塊在沒有待辦時直接不渲染，本來就不需要空狀態。
 */
import { useParentTodos } from '../../composables/useParentTodos'
import SectionHeader from '../SectionHeader.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import M3List from '../m3/M3List.vue'
import M3ListItem from '../m3/M3ListItem.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const { todos, actionCount, pending, error, refresh } = useParentTodos()
</script>

<template>
  <section v-if="pending && todos.length === 0" class="home-todo" data-testid="home-todo-skeleton">
    <SkeletonBlock variant="row" :count="2" />
  </section>

  <section
    v-else-if="error && todos.length === 0"
    class="home-todo"
    data-testid="home-todo-error"
  >
    <MobileErrorRetry :error="error" @retry="refresh" />
  </section>

  <section
    v-else-if="todos.length > 0"
    class="home-todo"
    data-testid="home-todo-list"
  >
    <SectionHeader title="待辦">
      <template #action>
        <span v-if="actionCount > 0" class="home-todo-count" data-testid="home-todo-count">
          {{ actionCount }} 件
        </span>
      </template>
    </SectionHeader>

    <M3List>
      <M3ListItem
        v-for="todo in todos"
        :key="todo.key"
        :headline="todo.label"
        :supporting-text="todo.sub || ''"
        :leading-icon="todo.icon"
      >
        <template #trailing>
          <router-link
            :to="todo.to"
            class="home-todo-row"
            :class="`tone-${todo.tone}`"
            :data-testid="`home-todo-row-${todo.key}`"
            :aria-label="`${todo.label}，${todo.count} 件`"
          >
            <span class="home-todo-badge">{{ todo.count }}</span>
            <span class="material-symbols-rounded home-todo-chevron" aria-hidden="true">chevron_right</span>
          </router-link>
        </template>
      </M3ListItem>
    </M3List>
  </section>
</template>

<style scoped>
.home-todo {
  padding: 0 var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.home-todo-count {
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--pt-text-muted, #6b5e54);
}

/* 整列可點：撐滿 M3ListItem 的 trailing 區並延伸出可觸控範圍（≥44px） */
.home-todo-row {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: 44px;
  padding: 0 var(--space-1, 4px);
  text-decoration: none;
  color: inherit;
}

.home-todo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  color: var(--pt-on-accent, #fff);
  background: var(--m3-primary, #006d3d);
}
/* 逾期款項：唯一該讓家長心跳快一下的情況（與事務頁 alert 徽章同色） */
.tone-alert .home-todo-badge {
  background: var(--coral-700, #b14545);
}
/* 資訊性（未讀公告、請假結果、進行中授權）：中性藍，避免被讀成待辦 */
.tone-info .home-todo-badge {
  background: var(--sky-700, #2d6f8e);
}

.home-todo-chevron {
  font-size: 20px;
  color: var(--pt-text-muted, #6b5e54);
  font-variation-settings: 'wght' 400;
}
</style>
