import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./tests/setup.js'],
        // Large local/hosted runners otherwise spawn one worker per CPU. This suite has
        // several mount-heavy files and best-effort API cleanup; excessive workers cause
        // memory/network contention and turn unrelated 5s assertions into false timeouts.
        maxWorkers: 2,
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
        // Why: 保守 coverage gate。門檻 = baseline 向下取整再減 3 個百分點的 margin
        //（baseline 2026-07-20：Stmts 64.26% / Branches 57.68% /
        // Functions 55.74% / Lines 66.38%），避免現行 main 因小幅插樁差異誤紅；
        // 之後補測試提高覆蓋率時可逐步上調，不要下調。
        coverage: {
            provider: 'v8',
            thresholds: {
                statements: 61,
                branches: 54,
                functions: 52,
                lines: 63,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
