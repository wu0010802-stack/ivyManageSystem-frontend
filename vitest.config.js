import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        // Why: vitest 預設會掃過整個 repo（包括 .worktrees/<branch>/tests），
        // 重複跑 worktree 內的舊版測試造成假性紅燈；明確收斂到主 repo 的 tests/ 與 src/。
        include: [
            'tests/**/*.{test,spec}.{js,ts,jsx,tsx}',
            'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
        ],
        exclude: [
            '**/node_modules/**',
            '**/dist/**',
            '.worktrees/**',
        ],
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
