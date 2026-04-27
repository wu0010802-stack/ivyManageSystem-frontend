/**
 * 家長 App 認證 store（Pinia）
 *
 * 不持久化敏感欄位；token_version / id 等資訊由 cookie + 後端維護，
 * 前端只暫存 user 資料供畫面渲染。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'parent_user_v1'

function loadUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveUser(user) {
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore quota / disabled storage */
  }
}

export const useParentAuthStore = defineStore('parentAuth', () => {
  const user = ref(loadUser())

  function setUser(u) {
    user.value = u
    saveUser(u)
  }

  function clear() {
    user.value = null
    saveUser(null)
  }

  function isAuthed() {
    return !!user.value
  }

  return { user, setUser, clear, isAuthed }
})
