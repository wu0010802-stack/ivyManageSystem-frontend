import { vi } from 'vitest'
import 'fake-indexeddb/auto'

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

vi.stubGlobal('localStorage', localStorageMock)
