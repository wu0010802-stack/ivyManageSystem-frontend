import { defineStore } from 'pinia'
import { getClassrooms } from '@/api/classrooms'

const TTL = 5 * 60 * 1000 // 5 分鐘快取

export const useClassroomStore = defineStore('classroom', {
  state: () => ({
    classrooms: [],
    loading: false,
    error: null,
    _fetchedAt: 0,
    _pending: null,
  }),

  actions: {
    async fetchClassrooms(force = false) {
      if (!force && this.classrooms.length && Date.now() - this._fetchedAt < TTL) return
      if (this._pending) return this._pending

      this.loading = true
      this.error = null
      this._pending = getClassrooms()
        .then(res => {
          this.classrooms = res.data
          this._fetchedAt = Date.now()
        })
        .catch((err) => {
          this.error = err?.response?.data?.detail || '班級資料載入失敗'
        })
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
