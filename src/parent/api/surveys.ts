import api from './index'
import type { ApiBody } from '../../api/_generated/typed'

export const listParentSurveys = () => api.get('/parent/surveys')

export const getParentSurvey = (id: number) => api.get(`/parent/surveys/${id}`)

export const submitSurveyResponse = (
  surveyId: number,
  studentId: number,
  payload: ApiBody<'/parent/surveys/{survey_id}/responses/{student_id}', 'post'>,
) => api.post(`/parent/surveys/${surveyId}/responses/${studentId}`, payload)
