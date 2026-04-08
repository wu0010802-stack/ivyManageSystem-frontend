import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_TYPES,
  DOMAINS,
  RATINGS,
  RATING_TAG,
  INCIDENT_TYPES,
  SEVERITIES,
  INCIDENT_TYPE_TAG,
  SEVERITY_TAG,
} from '@/constants/studentRecords'

describe('studentRecords constants', () => {
  describe('ASSESSMENT_TYPES', () => {
    it('長度為 3，含期中、期末、學期', () => {
      expect(ASSESSMENT_TYPES).toHaveLength(3)
      expect(ASSESSMENT_TYPES).toContain('期中')
      expect(ASSESSMENT_TYPES).toContain('期末')
      expect(ASSESSMENT_TYPES).toContain('學期')
    })
  })

  describe('DOMAINS', () => {
    it('長度為 7', () => {
      expect(DOMAINS).toHaveLength(7)
    })
  })

  describe('RATINGS', () => {
    it('長度為 3', () => {
      expect(RATINGS).toHaveLength(3)
    })
  })

  describe('RATING_TAG', () => {
    it('優 → success', () => expect(RATING_TAG['優']).toBe('success'))
    it('需加強 → danger', () => expect(RATING_TAG['需加強']).toBe('danger'))
  })

  describe('INCIDENT_TYPES', () => {
    it('長度為 4', () => {
      expect(INCIDENT_TYPES).toHaveLength(4)
    })
  })

  describe('SEVERITIES', () => {
    it('長度為 3', () => {
      expect(SEVERITIES).toHaveLength(3)
    })
  })

  describe('INCIDENT_TYPE_TAG', () => {
    it('意外受傷 → danger', () => expect(INCIDENT_TYPE_TAG['意外受傷']).toBe('danger'))
    it('行為觀察 → info', () => expect(INCIDENT_TYPE_TAG['行為觀察']).toBe('info'))
  })

  describe('SEVERITY_TAG', () => {
    it('嚴重 → danger', () => expect(SEVERITY_TAG['嚴重']).toBe('danger'))
    it('輕微 → success', () => expect(SEVERITY_TAG['輕微']).toBe('success'))
  })
})
