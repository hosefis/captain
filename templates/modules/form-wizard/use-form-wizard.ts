import { useReducer, useRef } from "react";
import { createFormWizard, type FormWizardController } from "./wizard.js";
import type {
  FormWizardConfig,
  FormWizardSubmitAdapter,
  FormWizardUploadAdapter,
} from "./types.js";

type UseFormWizardOptions = {
  config: FormWizardConfig;
  submitAdapter: FormWizardSubmitAdapter;
  uploadAdapter?: FormWizardUploadAdapter;
};

export function useFormWizard(options: UseFormWizardOptions): FormWizardController {
  const wizardRef = useRef<FormWizardController | null>(null);
  if (!wizardRef.current) {
    wizardRef.current = createFormWizard(
      options.config,
      options.submitAdapter,
      options.uploadAdapter,
    );
  }

  const [, bump] = useReducer((version: number) => version + 1, 0);
  const wizard = wizardRef.current;

  return new Proxy(wizard, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          const result = (value as (...inner: unknown[]) => unknown).apply(target, args);
          if (result instanceof Promise) {
            return result.finally(() => bump());
          }
          bump();
          return result;
        };
      }
      return value;
    },
  }) as FormWizardController;
}
