<script setup>
/**
 * 可報名才藝課程卡片列表（presentational）。
 *
 * Props:
 *  - courses: ActivityCourse 陣列
 *
 * 根節點帶 id="act-upcoming" 提供 hero scrollIntoView 錨點。
 *
 * 注：目前後端 course response 無 poster/image 欄位，故未使用 LazyImage。
 */
defineProps({
  courses: { type: Array, default: () => [] },
})
</script>

<template>
  <div id="act-upcoming" class="card-list">
    <div
      v-for="c in courses"
      :key="c.id"
      class="course-card"
    >
      <div class="course-card-row1">
        <span class="course-card-name">{{ c.name }}</span>
        <span class="course-card-price">${{ c.price?.toLocaleString() }}</span>
      </div>
      <div class="course-card-row2">
        <span>{{ c.school_year }}-{{ c.semester === 1 ? '上' : '下' }}</span>
        <span v-if="c.sessions">・{{ c.sessions }} 堂</span>
        <span :class="['enroll-tag', c.is_full ? 'full' : 'open']">
          {{ c.enrolled_count }}/{{ c.capacity }}
          {{ c.is_full ? (c.allow_waitlist ? '可候補' : '已額滿') : '可報名' }}
        </span>
      </div>
      <div v-if="c.description" class="course-card-desc">{{ c.description }}</div>
    </div>
  </div>
</template>

<style scoped>
.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.course-card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--pt-elev-1);
}

.course-card-row1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-card-name {
  font-weight: 600;
  color: var(--pt-text-strong);
}

.course-card-price {
  color: var(--brand-primary);
  font-weight: 600;
}

.course-card-row2 {
  margin-top: 4px;
  color: var(--pt-text-faint);
  font-size: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.enroll-tag {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: auto;
}
.enroll-tag.open { background: var(--brand-primary-soft); color: var(--pt-success-text); }
.enroll-tag.full { background: var(--color-warning-soft); color: var(--pt-warning-text-soft); }

.course-card-desc {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.5;
}
</style>
