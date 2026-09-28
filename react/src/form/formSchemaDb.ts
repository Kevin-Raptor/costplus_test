import * as SQLite from 'expo-sqlite';

import { hasInternetConnection } from '../database/lead-db';
import { DEFAULT_FORM_SCHEMA, type FormDefinition, type FormFieldKey } from './formDefinition';

const db = SQLite.openDatabaseSync('commissioning_forms.db');

export const ensureFormSchemaTable = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS form_schema (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'local',
      payload TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
};

export type SchemaSource = 'local-file' | 'remote-cache';

export const getActiveFormSchema = (): FormDefinition | null => {
  ensureFormSchemaTable();

  const rows = db.getAllSync('SELECT * FROM form_schema ORDER BY updatedAt DESC LIMIT 1') as Array<{
    payload: string;
  }>;

  if (!rows.length) {
    return null;
  }

  try {
    return JSON.parse(rows[0].payload) as FormDefinition;
  } catch {
    return null;
  }
};

export const saveFormSchema = (schema: FormDefinition, source: SchemaSource = 'local-file'): FormDefinition => {
  ensureFormSchemaTable();
  const now = new Date().toISOString();

  db.runSync(
    `
      INSERT INTO form_schema (version, source, payload, updatedAt)
      VALUES (?, ?, ?, ?)
    `,
    [schema.version, source, JSON.stringify(schema), now],
  );

  return schema;
};

export const ensureDefaultSchema = (): FormDefinition => {
  ensureFormSchemaTable();

  const existing = getActiveFormSchema();
  if (existing) {
    return existing;
  }

  return saveFormSchema(DEFAULT_FORM_SCHEMA, 'local-file');
};

export const resetFormSchema = (schema: FormDefinition = DEFAULT_FORM_SCHEMA): FormDefinition => {
  ensureFormSchemaTable();
  db.runSync('DELETE FROM form_schema');
  return saveFormSchema({
    ...schema,
    version: 1,
    source: 'local-file',
  }, 'local-file');
};

export const getSchemaFieldKeys = (): FormFieldKey[] => Object.keys(DEFAULT_FORM_SCHEMA.fields) as FormFieldKey[];

export const fetchRemoteSchema = async (): Promise<FormDefinition | null> => {
  const online = await hasInternetConnection();
  if (!online) {
    return null;
  }

  const current = getActiveFormSchema() ?? ensureDefaultSchema();
  const remoteSchema: FormDefinition = {
    ...current,
    version: current.version + 1,
    source: 'remote-cache',
    description: 'Remote schema sync loaded while online. This mimics the remote form-definition store.',
    sections: current.sections,
  };

  return remoteSchema;
};

export const syncSchemaIfNeeded = async (): Promise<{ updated: boolean; schema: FormDefinition | null }> => {
  const current = getActiveFormSchema() ?? ensureDefaultSchema();
  const remote = await fetchRemoteSchema();

  if (!remote) {
    return { updated: false, schema: current };
  }

  if (remote.version > current.version) {
    saveFormSchema(remote, 'remote-cache');
    return { updated: true, schema: remote };
  }

  return { updated: false, schema: current };
};
