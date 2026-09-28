import { FORM_DEFINITION, type FormDefinition } from './formDefinition';

const CACHE_KEY = 'commissioning-form-definition-v1';

export const loadFormDefinition = async (): Promise<FormDefinition> => {
  // Local file placeholder that represents the remote-fetch and cache model.
  // In a real implementation this would fetch a JSON payload, validate it, and store it in
  // AsyncStorage / SQLite before using it. Because this requirement says the form definition
  // can be shipped as a local file and still be used offline, the app starts from the bundled
  // local config immediately and can later replace it with a cached remote copy.
  return FORM_DEFINITION;
};

export const getCachedFormDefinition = (): FormDefinition | null => {
  return FORM_DEFINITION;
};
