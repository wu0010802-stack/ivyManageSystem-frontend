import { defineStore } from 'pinia'
import api from '@/api'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useClassroomStore = defineStore('classroom', {
  state: () => ({
    classrooms: [],
    loading: false,
    _fetchedAt: 0,
    _pending: null,
  }),

  actions: {
    async fetchClassrooms(force = false) {
      if (!force && this.classrooms.length && Date.now() - this._fetchedAt < TTL) return
      if (this._pending) return this._pending

      this.loading = true
      this._pending = api.get('/classrooms')
        .then(res => {
          this.classrooms = res.data
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
      await this.fetchClassrooms(true)
    },
  },
})
