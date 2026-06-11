// src/api/search.ts
import api from './index'
import type { AxiosResp } from './_generated/typed'

export const globalSearch = (q: string): AxiosResp<'/search', 'get'> =>
    api.get('/search', { params: { q } })
