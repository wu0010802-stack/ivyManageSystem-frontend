import { ref } from 'vue'

export type PublicRegistrationStep = 1 | 2 | 3

export function usePublicRegistrationFlow() {
  const currentStep = ref<PublicRegistrationStep>(1)
  const highestVisitedStep = ref<PublicRegistrationStep>(1)

  function goToStep(step: PublicRegistrationStep) {
    if (step > highestVisitedStep.value) return false
    currentStep.value = step
    return true
  }

  function completeStep(step: PublicRegistrationStep) {
    if (step !== currentStep.value || step >= 3) return false
    const nextStep = (step + 1) as PublicRegistrationStep
    highestVisitedStep.value = Math.max(
      highestVisitedStep.value,
      nextStep,
    ) as PublicRegistrationStep
    currentStep.value = nextStep
    return true
  }

  function goToErrorField(field: string): PublicRegistrationStep {
    const step: PublicRegistrationStep = field === 'courses' ? 2 : 1
    currentStep.value = step
    return step
  }

  function resetFlow() {
    currentStep.value = 1
    highestVisitedStep.value = 1
  }

  return {
    currentStep,
    highestVisitedStep,
    goToStep,
    completeStep,
    goToErrorField,
    resetFlow,
  }
}
