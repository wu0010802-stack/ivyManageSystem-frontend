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
        // Why: 保守 coverage gate（2026-07-06 infra 稽核補）。門檻 = baseline 向下取整
        // 再減 3 個百分點的 margin（baseline 2026-07-06：Stmts 61.4% / Branches 54.65% /
        // Functions 52.68% / Lines 63.45%），刻意不設更高避免現行 main 誤紅；
        // 之後補測試提高覆蓋率時可逐步上調，不要下調。
        coverage: {
            provider: 'v8',
            thresholds: {
                statements: 58,
                branches: 51,
                functions: 49,
                lines: 60,
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
})
