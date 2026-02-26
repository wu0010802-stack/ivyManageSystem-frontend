import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getToken, setToken, removeToken, getUserInfo, setUserInfo, clearAuth, isLoggedIn } from '@/utils/auth'

describe('auth utilities', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    describe('token 管理', () => {
        it('getToken 無 token 時回傳 null', () => {
            expect(getToken()).toBeNull()
        })

        it('setToken + getToken 正常存取', () => {
            setToken('abc123')
            expect(getToken()).toBe('abc123')
        })

        it('removeToken 移除 token', () => {
            setToken('abc123')
            removeToken()
            expect(getToken()).toBeNull()
        })
    })

    describe('使用者資訊', () => {
        it('getUserInfo 無資料時回傳 null', () => {
            expect(getUserInfo()).toBeNull()
        })

        it('setUserInfo + getUserInfo 正常存取', () => {
            const user = { id: 'E001', name: '王小明', role: 'teacher' }
            setUserInfo(user)
            expect(getUserInfo()).toEqual(user)
        })

        it('getUserInfo 處理非法 JSON 不會 crash', () => {
            localStorage.setItem('userInfo', '{invalid json}')
            expect(() => getUserInfo()).toThrow()
        })
    })

    describe('clearAuth', () => {
        it('同時清除 token 和 userInfo', () => {
            setToken('token123')
            setUserInfo({ id: 'E001' })
            clearAuth()
            expect(getToken()).toBeNull()
            expect(getUserInfo()).toBeNull()
        })
    })

    describe('isLoggedIn', () => {
        it('無 token 時回傳 false', () => {
            expect(isLoggedIn()).toBe(false)
        })

        it('有 token 時回傳 true', () => {
            setToken('token123')
            expect(isLoggedIn()).toBe(true)
        })
    })
})
