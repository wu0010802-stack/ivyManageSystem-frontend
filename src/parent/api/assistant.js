/**
 * 家長端 FAQ 助手 API。
 */
import api from './index'

export const getFaq = () => api.get('/parent/assistant/faq').then(r => r.data)
