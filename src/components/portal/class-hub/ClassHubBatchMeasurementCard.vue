<script setup lang="ts">
defineEmits<{ 'open': [] }>()
const props = withDefaults(defineProps<{
  lastMeasuredOn?: string | null
}>(), {
  lastMeasuredOn: null,
})
</script>

<template>
  <!--
    整張卡片本身就是按鈕：原本外層 div @click 內再包一個 <button>，滑鼠可用但
    (a) 鍵盤 Tab 到的是內層 button，按下去卻是靠冒泡到外層才生效，
    (b) 螢幕閱讀器讀到一個沒有名稱的「開始」按鈕、外層文字則完全不是互動元素。
    改成單一 <button> 後，鍵盤/AT/滑鼠走同一條路徑，也不需要 role/tabindex/keydown。
    右側「開始」退回 <span>，純視覺 affordance（巢狀 button 是無效 HTML）。
  -->
  <button type="button" class="batch-card pt-card-elevated" @click="$emit('open')">
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
    <span class="btn">開始</span>
  </button>
</template>

<style scoped>
.batch-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 12px 0;
  cursor: pointer;
  /* <button> reset：外觀維持原本的卡片，只是語意換成按鈕 */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
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
  /* 從 <button> 換成 <span> 後要自己補：inline 元素吃不到垂直 padding */
  display: inline-block;
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--el-color-primary);
  background: var(--el-fill-color-blank);
  color: var(--el-color-primary);
  border-radius: 6px;
  cursor: pointer;
}
</style>
