<template>
  <div v-if="showAny" class="comm-bar">
    <button
      v-if="canMessages"
      class="comm-card"
      :class="{ 'has-unread': messagesUnread > 0 }"
      @click="$emit('open-panel', 'messages')"
    >
      <div class="comm-card__icon">
        <el-icon><Message /></el-icon>
      </div>
      <div class="comm-card__body">
        <div class="comm-card__title">家長訊息</div>
        <div class="comm-card__sub">
          <span v-if="messagesUnread > 0">{{ messagesUnread }} 則未讀</span>
          <span v-else>無未讀</span>
        </div>
      </div>
      <el-badge
        v-if="messagesUnread > 0"
        :value="messagesUnread"
        :max="99"
        class="comm-card__badge"
      />
    </button>

    <button
      v-if="canAnnouncements"
      class="comm-card"
      :class="{ 'has-unread': announcementsUnread > 0 }"
      @click="$emit('open-panel', 'announcements')"
    >
      <div class="comm-card__icon">
        <el-icon><Bell /></el-icon>
      </div>
      <div class="comm-card__body">
        <div class="comm-card__title">公告通知</div>
        <div class="comm-card__sub">
          <span v-if="announcementsUnread > 0">{{ announcementsUnread }} 則未讀</span>
          <span v-else>無未讀</span>
        </div>
      </div>
      <el-badge
        v-if="announcementsUnread > 0"
        :value="announcementsUnread"
        :max="99"
        class="comm-card__badge"
      />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Message, Bell } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

const props = defineProps({
  messagesUnread: { type: Number, default: 0 },
  announcementsUnread: { type: Number, default: 0 },
})
defineEmits(['open-panel'])

const canMessages = computed(() => hasPermission('PARENT_MESSAGES_WRITE'))
const canAnnouncements = computed(() => hasPermission('ANNOUNCEMENTS_READ'))
const showAny = computed(() => canMessages.value || canAnnouncements.value)
</script>

<style scoped>
.comm-bar {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.comm-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.15s, transform 0.05s;
}
.comm-card:hover { box-shadow: var(--pt-elev-2); }
.comm-card:active { transform: scale(0.98); }

.comm-card.has-unread { border-left: 4px solid var(--color-danger); }

.comm-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--pt-tint);
  color: var(--color-primary);
  font-size: 20px;
  flex-shrink: 0;
}
.comm-card__body { flex: 1; min-width: 0; }
.comm-card__title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); }
.comm-card__sub { font-size: var(--text-xs); color: var(--pt-text-muted); margin-top: 2px; }

.comm-card__badge { position: absolute; top: 8px; right: 12px; }

@media (max-width: 480px) {
  .comm-bar { grid-template-columns: 1fr; }
}
</style>
