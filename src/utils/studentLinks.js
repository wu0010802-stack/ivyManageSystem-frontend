export function buildStudentProfileLink(studentId, tab) {
  const id = Number(studentId)
  if (!Number.isFinite(id) || id <= 0) return null
  return {
    name: 'student-profile',
    params: { id },
    query: tab ? { tab } : {},
  }
}
