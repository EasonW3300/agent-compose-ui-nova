import { SETUP_STEPS } from './setupSteps';

interface Props {
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function SetupStepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <ol className="setup-steps" aria-label="装机步骤">
      {SETUP_STEPS.map((name, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo';
        return (
          <li key={name} className={`setup-step setup-step--${state}`}>
            <button
              type="button"
              className="setup-step__btn"
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={i > currentStep}
              onClick={() => onStepClick(i)}
            >
              <span className="setup-step__index">{i + 1}</span>
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
