export type FormFieldType =
  | 'text'
  | 'date'
  | 'toggle'
  | 'select'
  | 'number'
  | 'integer'
  | 'photo';

export type OptionValueType = 'string' | 'number';

export type FormFieldKey = string;

export interface FieldDefinition {
  key: FormFieldKey;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number;
  optionValueType?: OptionValueType;
  options?: string[];
  validation?: {
    allowFutureDates?: boolean;
    min?: number;
    max?: number;
    custom?: string;
  };
}

export interface FormSectionDefinition {
  id: string;
  title: string;
  fields: FormFieldKey[];
}

export type SchemaSource = 'local-file' | 'remote-cache';

export interface FormDefinition {
  version: number;
  source: SchemaSource;
  description: string;
  sections: FormSectionDefinition[];
  fields: Record<string, FieldDefinition>;
}

const JSON_SCHEMA = require('./form-definition.json') as FormDefinition;

export const DEFAULT_FORM_SCHEMA: FormDefinition = JSON_SCHEMA;
export const FORM_DEFINITION = DEFAULT_FORM_SCHEMA;

export const getFieldDefinition = (fieldKey: FormFieldKey) => FORM_DEFINITION.fields[fieldKey];

export const getPhotoFields = (schema: FormDefinition = FORM_DEFINITION) =>
  Object.entries(schema.fields).filter(([, field]) => field.type === 'photo');
