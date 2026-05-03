<script setup>
/**
 * 家長 More 頁 hero 卡：頭像 + 名字 + 子女列表 + LINE 推播狀態 badge。
 *
 * 純呈現元件，無 store/composable 依賴；所有資料由父層算好傳入。
 *
 * Props:
 *  - userName: 家長姓名（預設 '家長'）
 *  - avatarInitial: avatar 內首字（預設 '家'）
 *  - childrenLabel: 子女字串（已 join；預設 '尚未綁定'）
 *  - canPush: 是否可推播 LINE
 *  - pushStatusKnown: me 是否已載入（false 時 hide push badge 區）
 */
import ParentIcon from '../ParentIcon.vue'

defineProps({
  userName: { type: String, default: '家長' },
  avatarInitial: { type: String, default: '家' },
  childrenLabel: { type: String, default: '尚未綁定' },
  canPush: { type: Boolean, default: false },
  pushStatusKnown: { type: Boolean, default: false },
})
</script>

<template>
  <div class="user-card">
    <div class="user-card-content">
      <div class="user-avatar" aria-hidden="true">
        {{ avatarInitial }}
      </div>
      <div class="user-info">
        <div class="user-name">{{ userName }}</div>
        <div class="user-children">
          子女：{{ childrenLabel }}
        </div>
      </div>
    </div>
    <div v-if="pushStatusKnown" class="user-push">
      <span v-if="canPush" class="badge ok">
        <ParentIcon name="check" size="xs" />
        LINE 推播已啟用
      </span>
      <span v-else class="badge warn">
        <ParentIcon name="warn" size="xs" />
        尚未加 LINE 為好友（無法收推播）
      </span>
    </div>
    <div class="user-decoration" aria-hidden="true">
      <span class="user-blob user-blob-1" />
      <span class="user-blob user-blob-2" />
    </div>
  </div>
</template>

<style scoped>
.user-card {
  position: relative;
  background: var(--pt-gradient-hero);
  border-radius: var(--radius-xl, 16px);
  padding: 18px 20px 20px;
  color: var(--neutral-0, #fff);
  box-shadow: var(--pt-elev-2);
  overflow: hidden;
  isolation: isolate;
}

.user-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.user-avatar {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.30);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl, 22px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--neutral-0, #fff);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: var(--text-xl, 18px);
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: 0.01em;
}

.user-children {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.94);
  font-size: var(--text-sm, 13px);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-push {
  position: relative;
  z-index: 1;
  margin-top: var(--space-3, 12px);
}

.user-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.user-blob {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  filter: blur(2px);
}
.user-blob-1 {
  top: -36px;
  right: -28px;
  width: 130px;
  height: 130px;
}
.user-blob-2 {
  bottom: -52px;
  right: 64px;
  width: 90px;
  height: 90px;
  background: rgba(255, 255, 255, 0.10);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  font-weight: var(--font-weight-medium, 500);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.badge.ok {
  background: rgba(255, 255, 255, 0.22);
  color: var(--neutral-0, #fff);
  border: 1px solid rgba(255, 255, 255, 0.28);
}
.badge.warn {
  background: rgba(254, 243, 199, 0.95);
  color: #92400e;
}
</style>
