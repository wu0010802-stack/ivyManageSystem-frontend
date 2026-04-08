<template>
  <div v-if="totalCost > 0" class="pub-card cost-summary">
    <span>費用小計</span>
    <span class="cost-value">NT$ {{ totalCost }}</span>
  </div>
</template>

<script setup>
defineProps({
  totalCost: { type: Number, required: true },
})
</script>

<style scoped>
.pub-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.cost-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 15px;
  font-weight: 500;
}
.cost-value {
  font-size: 18px;
  font-weight: 700;
  color: #3f7d48;
}
</style>
