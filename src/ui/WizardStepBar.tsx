interface Props {
  steps: readonly string[];
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function WizardStepBar({ steps, currentStep, onStepClick }: Props) {
  return (
    <ol className="wizard-steps" aria-label="创建步骤">
      {steps.map((name, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo';
        return (
          <li key={name} className={`wizard-step wizard-step--${state}`}>
            <button
              type="button"
              className="wizard-step__btn"
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={i > currentStep}
              onClick={() => onStepClick(i)}
            >
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
