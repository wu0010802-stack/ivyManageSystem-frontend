import { defineStore } from 'pinia'
import { getCurrentAcademicTerm } from '@/utils/academic'

export const useAcademicTermStore = defineStore('academicTerm', {
  state: () => {
    const { school_year, semester } = getCurrentAcademicTerm()
    return { school_year, semester }
  },
  actions: {
    setTerm(school_year, semester) {
      this.school_year = school_year
      this.semester = semester
    },
  },
})
