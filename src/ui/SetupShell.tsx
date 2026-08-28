// src/ui/SetupShell.tsx
import { useSetupWizard } from '../hooks/useSetupWizard';
import { SetupStepIndicator } from './SetupStepIndicator';
import { SETUP_STEPS } from './setupSteps';
import { WelcomeScreen } from './WelcomeScreen';
import { StepPlaceholder } from './StepPlaceholder';
import { InstallGuideScreen } from './InstallGuideScreen';
import { LoginScreen } from './LoginScreen';
import './setup.css';

export function SetupShell() {
  const { step, goNext, goBack, goTo } = useSetupWizard(SETUP_STEPS.length);
  return (
    <main className="setup-shell">
      <h1>把 AI 助手装进这台电脑</h1>
      <SetupStepIndicator currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>
          ← 上一步
        </button>
      )}
      {step === 0 && <WelcomeScreen onNext={goNext} />}
      {step === 1 && <InstallGuideScreen onNext={goNext} />}
      {step === 2 && <LoginScreen onNext={goNext} />}
      {step > 2 && <StepPlaceholder title={SETUP_STEPS[step]} />}
    </main>
  );
}
