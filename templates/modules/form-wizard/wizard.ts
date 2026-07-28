import type {
  FormWizardConfig,
  FormWizardStepId,
  FormWizardSubmitAdapter,
  FormWizardUploadAdapter,
  FormWizardUploadResult,
  FormWizardValues,
} from "./types.js";

export type FormWizardState = {
  stepIndex: number;
  stepId: FormWizardStepId;
  values: FormWizardValues;
  uploads: FormWizardUploadResult[];
  isFirst: boolean;
  isLast: boolean;
  isSubmitting: boolean;
  error: string | null;
};

export type FormWizardActions = {
  next(): void;
  prev(): void;
  goTo(stepId: FormWizardStepId): void;
  setField(name: string, value: unknown): void;
  upload(file: File, field: string): Promise<void>;
  submit(): Promise<void>;
};

export type FormWizardController = FormWizardState & FormWizardActions;

function stepByIndex(config: FormWizardConfig, index: number): FormWizardStepId {
  const step = config.steps[index];
  if (!step) {
    throw new Error(`FormWizard step index ${index} is out of range`);
  }
  return step.id;
}

export function createFormWizard(
  config: FormWizardConfig,
  submitAdapter: FormWizardSubmitAdapter,
  uploadAdapter?: FormWizardUploadAdapter,
): FormWizardController {
  let stepIndex = 0;
  let values: FormWizardValues = {};
  let uploads: FormWizardUploadResult[] = [];
  let isSubmitting = false;
  let error: string | null = null;

  function getState(): FormWizardState {
    return {
      stepIndex,
      stepId: stepByIndex(config, stepIndex),
      values: { ...values },
      uploads: [...uploads],
      isFirst: stepIndex === 0,
      isLast: stepIndex === config.steps.length - 1,
      isSubmitting,
      error,
    };
  }

  const actions: FormWizardActions = {
    next() {
      if (stepIndex < config.steps.length - 1) {
        stepIndex += 1;
        error = null;
      }
    },
    prev() {
      if (stepIndex > 0) {
        stepIndex -= 1;
        error = null;
      }
    },
    goTo(stepId: FormWizardStepId) {
      const index = config.steps.findIndex((step) => step.id === stepId);
      if (index === -1) {
        throw new Error(`FormWizard step "${stepId}" not found`);
      }
      stepIndex = index;
      error = null;
    },
    setField(name: string, value: unknown) {
      values = { ...values, [name]: value };
    },
    async upload(file: File, field: string) {
      if (!uploadAdapter) {
        throw new Error("FormWizard upload adapter is not configured");
      }
      const result = await uploadAdapter.upload(file, field);
      uploads = [...uploads.filter((entry) => entry.field !== field), result];
      values = { ...values, [field]: result.url };
    },
    async submit() {
      isSubmitting = true;
      error = null;
      try {
        await submitAdapter.submit({ ...values });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "FormWizard submit failed";
        throw cause;
      } finally {
        isSubmitting = false;
      }
    },
  };

  return new Proxy({} as FormWizardController, {
    get(_target, prop: keyof FormWizardController) {
      if (prop in actions) {
        return actions[prop as keyof FormWizardActions];
      }
      return getState()[prop as keyof FormWizardState];
    },
  });
}
