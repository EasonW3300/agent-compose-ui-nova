import { useCallback, useState } from 'react';

export function useSetupWizard(totalSteps: number, initialStep = 0) {
  const [step, setStep] = useState(initialStep);

  const goNext = useCallback(() => {
    setStep((s) => (s < totalSteps - 1 ? s + 1 : s));
  }, [totalSteps]);
  const goBack = useCallback(() => {
    setStep((s) => (s > 0 ? s - 1 : s));
  }, []);
  const goTo = useCallback((target: number) => {
    setStep((s) => (target >= 0 && target <= s ? target : s));
  }, []);

  return { step, goNext, goBack, goTo, canGoBack: step > 0, isLast: step === totalSteps - 1 };
}
