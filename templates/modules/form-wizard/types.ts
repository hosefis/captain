export type FormWizardStepId = string;

export type FormWizardFieldType = "text" | "number" | "boolean" | "file";

export type FormWizardFieldDef = {
  name: string;
  type: FormWizardFieldType;
  required?: boolean;
};

export type FormWizardStepDef = {
  id: FormWizardStepId;
  titleKey: string;
  fields: FormWizardFieldDef[];
};

export type FormWizardConfig = {
  steps: FormWizardStepDef[];
  i18nNamespace: string;
  uploadPath?: string;
};

export type FormWizardValues = Record<string, unknown>;

export type FormWizardUploadResult = {
  field: string;
  url: string;
  fileName: string;
};

export type FormWizardUploadAdapter = {
  upload(file: File, field: string): Promise<FormWizardUploadResult>;
};

export type FormWizardSubmitAdapter = {
  submit(values: FormWizardValues): Promise<void>;
};
