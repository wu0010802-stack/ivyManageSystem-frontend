import { defineStore } from 'pinia'
import api from '@/api'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useConfigStore = defineStore('config', {
  state: () => ({
    jobTitles: [],
    loading: false,
    _fetchedAt: 0,
    _pending: null,
  }),

  actions: {
    async fetchJobTitles(force = false) {
      if (!force && this.jobTitles.length && Date.now() - this._fetchedAt < TTL) return
      if (this._pending) return this._pending

      this.loading = true
      this._pending = api.get('/config/titles')
        .then(res => {
          this.jobTitles = res.data
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
      await this.fetchJobTitles(true)
    },
  },
})
