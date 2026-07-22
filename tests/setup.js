import { vi, beforeEach, afterEach } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import 'fake-indexeddb/auto'

// 自動在每個 test 後 unmount 所有 wrapper，避免 DOM 累積污染下一個 test
enableAutoUnmount(afterEach)

// Node.js 22+ 內建 localStorage 與 happy-dom/jsdom 衝突
// 手動提供完整的 localStorage mock
const store = {}
const localStorageMock = {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    removeItem: vi.fn((key) => { delete store[key] }),
    clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) }),
    get length() { return Object.keys(store).length },
    key: vi.fn((i) => Object.keys(store)[i] ?? null),
}

class BlockedXMLHttpRequest {
    constructor() {
        // Axios selects the browser XHR adapter in happy-dom. Throwing at construction
        // keeps an unmocked request deterministic and guarantees no socket can be opened.
        throw new Error('Unexpected unmocked XMLHttpRequest in Vitest')
    }
}

function installHarnessGlobals() {
    // Unit tests must never fall through to Node/happy-dom's real fetch. Besides making
    // tests depend on a developer server, concurrent logout cleanup used to open hundreds
    // of localhost connections and turn unrelated assertions into timeouts. Tests that
    // exercise fetch install their own mock in their local beforeEach (after this hook).
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(
        new Error('Unexpected unmocked fetch in Vitest'),
    )))
    // Tests that intentionally cover an XHR adapter can replace this in their own
    // beforeEach; setup-file hooks run first, so the test-scoped implementation wins.
    vi.stubGlobal('XMLHttpRequest', BlockedXMLHttpRequest)
    vi.stubGlobal('localStorage', localStorageMock)
}

installHarnessGlobals()

// A few interaction tests call vi.unstubAllGlobals(). Reinstall the harness boundary
// before every following test so file scheduling cannot leak real network/storage state.
beforeEach(() => {
    installHarnessGlobals()
})

// happy-dom 預設沒有 matchMedia；提供可被測試 override 的 stub
if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),       // 舊 API
        removeListener: vi.fn(),    // 舊 API
        addEventListener: vi.fn(),  // 新 API
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }))
}
