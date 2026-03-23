import { defineStore } from 'pinia'
import { getTitles } from '@/api/config'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useConfigStore = defineStore('config', {
  state: () => ({
    jobTitles: [],
    loading: false,
    error: null,
    _fetchedAt: 0,
    _pending: null,
  }),

  actions: {
    async fetchJobTitles(force = false) {
      if (!force && this.jobTitles.length && Date.now() - this._fetchedAt < TTL) return
      if (this._pending) return this._pending

      this.loading = true
      this.error = null
      this._pending = getTitles()
        .then(res => {
          this.jobTitles = res.data
          this._fetchedAt = Date.now()
        })
        .catch((err) => {
          this.error = err?.response?.data?.detail || '職稱資料載入失敗'
        })
        .finally(() => {
          this.loading = false
          this._pending = null
        })

      return this._pending
    },

    async refresh() {
      this._fetchedAt = 0
      await this.fetchJobTitles(true)
    },
  },
})
