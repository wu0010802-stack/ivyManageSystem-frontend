import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getToken, setToken, removeToken, getUserInfo, setUserInfo, clearAuth, isLoggedIn } from '@/utils/auth'

describe('auth utilities', () => {
    beforeEach(() => {
        // 清除 localStorage 與模組層級快取：先呼叫 clearAuth 可同步重置 cache，
        // 再 clear 掉任何殘留的 localStorage 項目（clearAuth 只 removeItem 不 clear）。
        clearAuth()
        localStorage.clear()
        vi.clearAllMocks()
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })))
    })

    describe('token 管理', () => {
        it('getToken 在 cookie 模式下固定回傳 null', () => {
            expect(getToken()).toBeNull()
        })

        it('setToken 為 no-op，不會讓 JS 取得 token', () => {
            setToken('abc123')
            expect(getToken()).toBeNull()
        })

        it('removeToken 為 no-op，token 仍不可由 JS 讀取', () => {
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

        it('getUserInfo 遇到非法 JSON 拋出 SyntaxError', () => {
            // JSON.parse 無 try-catch，目前設計是讓上層攔截；
            // 此測試鎖定例外類型，避免描述與行為不一致。
            localStorage.setItem('userInfo', '{invalid json}')
            expect(() => getUserInfo()).toThrow(SyntaxError)
        })
    })

    describe('clearAuth', () => {
        it('同時清除 token 和 userInfo', () => {
            setToken('token123')
            setUserInfo({ id: 'E001' })
            clearAuth()
            expect(getToken()).toBeNull()
            expect(getUserInfo()).toBeNull()
            expect(fetch).toHaveBeenCalledTimes(1)
        })
    })

    describe('isLoggedIn', () => {
        it('無 userInfo 時回傳 false', () => {
            expect(isLoggedIn()).toBe(false)
        })

        it('有 userInfo 時回傳 true', () => {
            setUserInfo({ id: 'E001', role: 'admin' })
            expect(isLoggedIn()).toBe(true)
        })
    })
})
