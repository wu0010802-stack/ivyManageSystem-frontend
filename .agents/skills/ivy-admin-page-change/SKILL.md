---
name: ivy-admin-page-change
description: "Add, change, move, or remove an Ivy admin page without navigation or authorization drift. Use when editing Vue views, router entries, sidebar/menu groups, route permission rules, navigation manifest, permission editor visibility, API modules, or deleting a backend-admin feature surface."
---

# Ivy 後台頁面異動

1. 讀 `AGENTS.md`、`PRODUCT.md`、`DESIGN.md`、相鄰頁面、router 與 `src/constants/navigation/manifest.ts`。先確認 route、group、permission、API 與 responsive/empty/error state。
2. 新頁面使用 `<script setup lang="ts">`、既有 layout/token/Element Plus pattern；API 留在 `src/api/*.ts`，型別優先 generated OpenAPI。
3. navigation manifest 是 sidebar、route permission 與 permission editor 的單一來源；不得手寫平行選單。Admin 使用 `hasPermission`，Portal surface 使用 `hasPortalPermission`。
4. 新 Permission code 必須同步 backend enum、DB catalog/data migration、frontend constants 與兩端 tests；改用 workspace/backend `$ivy-permission-change`。
5. 移除頁面時搜尋 router、manifest、lazy import、API wrapper、tests、docs、permission grants 與 deep links。保留孤兒 Permission 必須有明確業主裁定與測試。
6. 測 route/manifest/sidebar/permission editor、loading/error/empty state 與頁面核心行為；再用 `$ivy-frontend-verify`。
7. 大幅或高歧義 UI 先產可審核方案；小修直接實作。不要自行開 GUI app、push 或 deploy。
