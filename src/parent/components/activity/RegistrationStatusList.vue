<script setup>
/**
 * 才藝報名狀態列表（presentational）。
 *
 * Props:
 *  - registrations: 已篩選後的報名陣列
 *  - studentNameMap: Map<student_id, name> 用於 fallback 顯示學生姓名
 *  - courseStatusMap: { [status]: { label, color: { bg, color } } }
 *
 * Emits:
 *  - confirm-promotion(reg, course): 確認轉正式按鈕點擊
 *
 * 根節點帶 id="act-active" 提供 hero scrollIntoView 錨點。
 */
const props = defineProps({
  registrations: { type: Array, default: () => [] },
  studentNameMap: { type: Map, default: () => new Map() },
  courseStatusMap: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['confirm-promotion'])
</script>

<template>
  <div id="act-active" class="reg-status-list">
    <div
      v-for="reg in registrations"
      :key="reg.id"
      class="reg-card"
    >
      <div class="reg-header">
        <span class="reg-student">{{ reg.student_name || studentNameMap.get(reg.student_id) }}</span>
        <span class="reg-term">{{ reg.school_year }}-{{ reg.semester === 1 ? '上' : '下' }}</span>
        <span :class="['paid', reg.is_paid ? 'ok' : 'warn']">
          {{ reg.is_paid ? '已繳費' : '未繳費' }}
        </span>
      </div>
      <div
        v-for="rc in reg.courses"
        :key="rc.course_id"
        class="course-row"
      >
        <span class="course-name">{{ rc.course_name }}</span>
        <span
          class="course-status"
          :style="{
            background: courseStatusMap[rc.status]?.color.bg,
            color: courseStatusMap[rc.status]?.color.color,
          }"
        >
          {{ courseStatusMap[rc.status]?.label || rc.status }}
        </span>
        <button
          v-if="rc.status === 'promoted_pending'"
          type="button"
          class="confirm-btn"
          @click="emit('confirm-promotion', reg, rc)"
        >確認轉正式</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reg-status-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.reg-card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--pt-elev-1);
}

.reg-header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.reg-student {
  font-weight: 600;
  color: var(--pt-text-strong);
}

.reg-term {
  background: var(--color-info-soft);
  color: var(--pt-info-link);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.paid {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}
.paid.ok { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.paid.warn { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }

.course-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--pt-surface-mute);
}

.course-name {
  flex: 1;
  font-size: 14px;
  color: var(--pt-text-muted);
}

.course-status {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.confirm-btn {
  padding: 4px 10px;
  background: var(--brand-primary);
  color: var(--neutral-0);
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
</style>
