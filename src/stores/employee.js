import { defineStore } from 'pinia'
import api from '@/api'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useEmployeeStore = defineStore('employee', {
  state: () => ({
    employees: [],
    loading: false,
    _fetchedAt: 0,
    _pending: null,
  }),

  getters: {
    teacherList: (state) =>
      state.employees.filter((e) =>
        ['主教', '助教', '美術老師'].includes(e.job_title)
      ),
  },

  actions: {
    async fetchEmployees(force = false) {
      // TTL 快取：未過期且有資料則跳過
      if (!force && this.employees.length && Date.now() - this._fetchedAt < TTL) return

      // Promise 去重：併發呼叫共用同一個請求
      if (this._pending) return this._pending

      this.loading = true
      this._pending = api.get('/employees')
        .then(res => {
          this.employees = res.data
          this._fetchedAt = Date.now()
        })
        .catch(() => { /* handled by API interceptor */ })
        .finally(() => {
          this.loading = false
          this._pending = null
        })

      return this._pending
    },

    async refresh() {
      this._fetchedAt = 0
      await this.fetchEmployees(true)
    },
  },
})
