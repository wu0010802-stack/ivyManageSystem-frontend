<script setup>
/**
 * 家長 More 頁 hero 卡：頭像 + 名字 + 子女列表 + LINE 推播狀態 badge。
 *
 * IvyKids rebrand 2026-05-07：月桂葉水印 + KawaiiStar 右上裝飾 + 暖底漸層，
 * avatar 改深綠 brand-primary 漸層圓形。
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
import LaurelWreath from '@/components/brand/LaurelWreath.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

defineProps({
  userName: { type: String, default: '家長' },
  avatarInitial: { type: String, default: '家' },
  childrenLabel: { type: String, default: '尚未綁定' },
  canPush: { type: Boolean, default: false },
  pushStatusKnown: { type: Boolean, default: false },
})
</script>

<template>
  <section class="user-card" aria-label="家長身份">
    <!-- 月桂葉水印 -->
    <LaurelWreath side="full" :opacity="0.15" :size="120" class="user-card-laurel" />
    <!-- KawaiiStar 右上裝飾 -->
    <KawaiiStar :size="32" decorative class="user-card-star" />

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
  </section>
</template>

<style scoped>
.user-card {
  position: relative;
  padding: 18px;
  background:
    linear-gradient(135deg, var(--pt-surface-raised, #fff) 0%, var(--pt-surface-recessed, #f5fbe6) 100%);
  border: 1px solid var(--pt-page-border, rgba(90, 168, 66, 0.15));
  border-radius: var(--pt-card-radius, 14px);
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  overflow: hidden;
  isolation: isolate;
}

.user-card-laurel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 0;
  pointer-events: none;
}

.user-card-star {
  position: absolute;
  right: var(--space-3, 12px);
  top: var(--space-3, 12px);
  z-index: 0;
  pointer-events: none;
}

.user-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.user-avatar {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--pt-tint-brand, var(--brand-primary-soft));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl, 22px);
  font-weight: 900;
  color: var(--brand-primary);
  box-shadow: var(--pt-shadow-press, var(--pt-elev-1));
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: var(--text-xl, 18px);
  font-weight: 900;
  color: var(--pt-text-strong);
  letter-spacing: 0.01em;
}

.user-children {
  margin-top: 4px;
  color: var(--pt-text-muted);
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

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  font-weight: var(--font-weight-medium, 500);
}
.badge.ok {
  background: var(--pt-tint-brand, rgba(90, 168, 66, 0.15));
  color: var(--ivy-green-deep, #0d9053);
  border: 1px solid var(--pt-page-border, rgba(90, 168, 66, 0.30));
}
.badge.warn {
  background: var(--pt-tint-sun, rgba(254, 243, 199, 0.95));
  color: var(--pt-warning-text-soft);
}
</style>
