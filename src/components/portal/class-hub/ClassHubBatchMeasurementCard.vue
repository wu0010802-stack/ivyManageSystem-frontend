<script setup>
defineEmits(['open'])
const props = defineProps({
  lastMeasuredOn: { type: String, default: null },
})
</script>

<template>
  <div class="batch-card pt-card-elevated" @click="$emit('open')">
    <div class="left">
      <span class="emoji">📏</span>
      <div class="text">
        <div class="title">全班量體位</div>
        <div class="sub">
          {{
            props.lastMeasuredOn
              ? `上次班級量測：${props.lastMeasuredOn}`
              : '尚未有班級量測紀錄'
          }}
        </div>
      </div>
    </div>
    <button class="btn">開始</button>
  </div>
</template>

<style scoped>
.batch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 12px 0;
  cursor: pointer;
}
.left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.emoji {
  font-size: 28px;
}
.title {
  font-weight: 600;
  font-size: 15px;
}
.sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.btn {
  padding: 6px 14px;
  border: 1px solid var(--el-color-primary);
  background: white;
  color: var(--el-color-primary);
  border-radius: 6px;
  cursor: pointer;
}
</style>
