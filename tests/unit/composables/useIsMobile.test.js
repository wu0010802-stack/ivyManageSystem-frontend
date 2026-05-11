import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useIsMobile } from '@/composables/useIsMobile'

describe('useIsMobile', () => {
    let mqlListeners
    let mockMql

    beforeEach(() => {
        mqlListeners = []
        mockMql = {
            matches: false,
            media: '(max-width: 767px)',
            addEventListener: vi.fn((type, fn) => {
                if (type === 'change') mqlListeners.push(fn)
            }),
            removeEventListener: vi.fn((type, fn) => {
                if (type === 'change') {
                    mqlListeners = mqlListeners.filter((f) => f !== fn)
                }
            }),
        }
        window.matchMedia = vi.fn().mockReturnValue(mockMql)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns false when viewport > 767px', () => {
        mockMql.matches = false
        const { isMobile } = useIsMobile()
        expect(isMobile.value).toBe(false)
    })

    it('returns true when viewport <= 767px', () => {
        mockMql.matches = true
        const { isMobile } = useIsMobile()
        expect(isMobile.value).toBe(true)
    })

    it('reacts to matchMedia change events', () => {
        mockMql.matches = false
        const { isMobile } = useIsMobile()
        expect(isMobile.value).toBe(false)

        mockMql.matches = true
        mqlListeners.forEach((fn) => fn({ matches: true }))
        expect(isMobile.value).toBe(true)
    })

    it('cleans up listener on cleanup callback', () => {
        const { cleanup } = useIsMobile()
        expect(mockMql.addEventListener).toHaveBeenCalledTimes(1)
        cleanup()
        expect(mockMql.removeEventListener).toHaveBeenCalledTimes(1)
    })
})
