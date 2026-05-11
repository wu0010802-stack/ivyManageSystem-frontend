<template>
  <div class="page">
    <h2>在學證明 開立紀錄</h2>
    <el-form :model="filters" inline @submit.prevent="load">
      <el-form-item label="學生 ID">
        <el-input v-model="filters.student_id" clearable />
      </el-form-item>
      <el-form-item label="開立期間">
        <el-date-picker
          v-model="filters.range"
          type="daterange"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-button type="primary" @click="load">查詢</el-button>
    </el-form>

    <el-table :data="rows" v-loading="loading">
      <el-table-column prop="serial" label="字號" />
      <el-table-column prop="student_id" label="學生 ID" />
      <el-table-column prop="issue_date" label="開立日期" />
      <el-table-column prop="purpose" label="用途" />
      <el-table-column prop="copies" label="份數" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { listCertificateHistory } from '@/api/govMoe'

const filters = ref({ student_id: '', range: [] })
const rows = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const params = {}
    if (filters.value.student_id) params.student_id = filters.value.student_id
    if (filters.value.range?.[0]) params.since = filters.value.range[0]
    if (filters.value.range?.[1]) params.until = filters.value.range[1]
    const { data } = await listCertificateHistory(params)
    rows.value = data
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
