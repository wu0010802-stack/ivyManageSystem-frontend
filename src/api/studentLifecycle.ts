import api from './index'
import type { components } from './_generated/schema'

export type LifecycleOverview = components['schemas']['LifecycleOverviewOut']
export type LifecycleStep = components['schemas']['StepOut']
export type LifecycleGradeStep = components['schemas']['GradeStepOut']
export type LifecycleTerminal = components['schemas']['TerminalOut']

const base = (studentId: number) =>
  `/students/${studentId}/lifecycle-overview`

export const getLifecycleOverview = (studentId: number) =>
  api.get<LifecycleOverview>(base(studentId))
