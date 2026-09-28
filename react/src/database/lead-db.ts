import * as SQLite from 'expo-sqlite';

import type { CommissioningForm, Lead, LeadInput } from '../types';

const db = SQLite.openDatabaseSync('commissioning_forms.db');

const requiredColumns: Array<{ name: string; type: string }> = [
  { name: 'status', type: 'TEXT NOT NULL DEFAULT "draft"' },
  { name: 'siteName', type: 'TEXT' },
  { name: 'formReference', type: 'TEXT' },
  { name: 'contractorMobilisedDate', type: 'TEXT' },
  { name: 'solarFoundationStartDate', type: 'TEXT' },
  { name: 'solarFoundationEndDate', type: 'TEXT' },
  { name: 'earthingWorks', type: 'TEXT' },
  { name: 'earthingType', type: 'TEXT' },
  { name: 'earthingNos', type: 'TEXT' },
  { name: 'essInstalled', type: 'TEXT' },
  { name: 'essCount', type: 'INTEGER' },
  { name: 'essUnits', type: 'TEXT' },
  { name: 'panelCapacity', type: 'TEXT' },
  { name: 'numberOfPanels', type: 'TEXT' },
  { name: 'solarPvCapacity', type: 'TEXT' },
  { name: 'photos', type: 'TEXT' },
  { name: 'createdAt', type: 'TEXT NOT NULL DEFAULT ""' },
  { name: 'updatedAt', type: 'TEXT NOT NULL DEFAULT ""' },
];

const ensureFormSchema = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'draft',
      siteName TEXT,
      formReference TEXT,
      contractorMobilisedDate TEXT,
      solarFoundationStartDate TEXT,
      solarFoundationEndDate TEXT,
      earthingWorks TEXT,
      earthingType TEXT,
      earthingNos TEXT,
      essInstalled TEXT,
      essCount INTEGER,
      essUnits TEXT,
      panelCapacity TEXT,
      numberOfPanels TEXT,
      solarPvCapacity TEXT,
      photos TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const existingColumns = db.getAllSync('PRAGMA table_info(forms)') as Array<{ name: string }>;
  const existingNames = new Set(existingColumns.map((column) => column.name));

  requiredColumns.forEach((column) => {
    if (!existingNames.has(column.name)) {
      db.execSync(`ALTER TABLE forms ADD COLUMN ${column.name} ${column.type};`);
    }
  });
};

ensureFormSchema();

const parseForm = (row: any): CommissioningForm => ({
  id: Number(row.id),
  status: row.status || 'draft',
  siteName: row.siteName || '',
  formReference: row.formReference || '',
  contractorMobilisedDate: row.contractorMobilisedDate || '',
  solarFoundationStartDate: row.solarFoundationStartDate || '',
  solarFoundationEndDate: row.solarFoundationEndDate || '',
  earthingWorks: row.earthingWorks || 'no',
  earthingType: row.earthingType || '',
  earthingNos: row.earthingNos || '',
  essInstalled: row.essInstalled || 'no',
  essCount: Number(row.essCount || 0),
  essUnits: row.essUnits ? JSON.parse(row.essUnits) : [],
  panelCapacity: row.panelCapacity || '',
  numberOfPanels: row.numberOfPanels || '',
  solarPvCapacity: row.solarPvCapacity || '',
  photos: row.photos ? JSON.parse(row.photos) : [],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const hasInternetConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
};

export const getAllLeads = (): Lead[] => {
  const rows = db.getAllSync('SELECT * FROM forms ORDER BY updatedAt DESC') as any[];
  return rows.map(parseForm);
};

export const getLeadById = (id: number): Lead | null => {
  const rows = db.getAllSync('SELECT * FROM forms WHERE id = ?', [id]) as any[];
  return rows.length ? parseForm(rows[0]) : null;
};

export const getPendingLeads = (): Lead[] => {
  const rows = db.getAllSync("SELECT * FROM forms WHERE status = 'pending' ORDER BY updatedAt DESC") as any[];
  return rows.map(parseForm);
};

export const hasPendingLeads = (): boolean => getPendingLeads().length > 0;

export const createLead = (input: LeadInput): Lead => {
  const now = new Date().toISOString();
  const next: CommissioningForm = {
    id: 0,
    ...input,
    status: input.status || 'draft',
    createdAt: now,
    updatedAt: now,
  };

  const result = db.runSync(
    `
      INSERT INTO forms (
        status,
        siteName,
        formReference,
        contractorMobilisedDate,
        solarFoundationStartDate,
        solarFoundationEndDate,
        earthingWorks,
        earthingType,
        earthingNos,
        essInstalled,
        essCount,
        essUnits,
        panelCapacity,
        numberOfPanels,
        solarPvCapacity,
        photos,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      next.status,
      next.siteName,
      next.formReference,
      next.contractorMobilisedDate,
      next.solarFoundationStartDate,
      next.solarFoundationEndDate,
      next.earthingWorks,
      next.earthingType,
      next.earthingNos,
      next.essInstalled,
      next.essCount,
      JSON.stringify(next.essUnits),
      next.panelCapacity,
      next.numberOfPanels,
      next.solarPvCapacity,
      JSON.stringify(next.photos),
      next.createdAt,
      next.updatedAt,
    ]
  );

  const insertedId = Number(result.lastInsertRowId);
  const created = getLeadById(insertedId);

  if (!created) {
    throw new Error('Could not retrieve saved form.');
  }

  return created;
};

export const updateLead = (id: number, updates: Partial<LeadInput>): Lead | null => {
  const current = getLeadById(id);

  if (!current) {
    return null;
  }

  const next: CommissioningForm = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  db.runSync(
    `
      UPDATE forms
      SET
        status = ?,
        siteName = ?,
        formReference = ?,
        contractorMobilisedDate = ?,
        solarFoundationStartDate = ?,
        solarFoundationEndDate = ?,
        earthingWorks = ?,
        earthingType = ?,
        earthingNos = ?,
        essInstalled = ?,
        essCount = ?,
        essUnits = ?,
        panelCapacity = ?,
        numberOfPanels = ?,
        solarPvCapacity = ?,
        photos = ?,
        updatedAt = ?
      WHERE id = ?
    `,
    [
      next.status,
      next.siteName,
      next.formReference,
      next.contractorMobilisedDate,
      next.solarFoundationStartDate,
      next.solarFoundationEndDate,
      next.earthingWorks,
      next.earthingType,
      next.earthingNos,
      next.essInstalled,
      next.essCount,
      JSON.stringify(next.essUnits),
      next.panelCapacity,
      next.numberOfPanels,
      next.solarPvCapacity,
      JSON.stringify(next.photos),
      next.updatedAt,
      id,
    ]
  );

  return getLeadById(id);
};

export const deleteLead = (id: number): boolean => {
  const current = getLeadById(id);

  if (!current) {
    return false;
  }

  db.runSync('DELETE FROM forms WHERE id = ?', [id]);
  return true;
};

export const markLeadSynced = (id: number): Lead | null => {
  return updateLead(id, { status: 'complete' });
};

export const syncPendingLeads = async (): Promise<number> => {
  const pending = getPendingLeads();

  if (!pending.length) {
    return 0;
  }

  const online = await hasInternetConnection();

  if (!online) {
    return 0;
  }

  pending.forEach((form) => {
    db.runSync("UPDATE forms SET status = 'complete', updatedAt = ? WHERE id = ?", [new Date().toISOString(), form.id]);
  });

  return pending.length;
};

export const syncAllPendingLeads = async (): Promise<number> => syncPendingLeads();

export const getAllForms = getAllLeads;
export const getFormById = getLeadById;
export const saveForm = createLead;
export const updateForm = updateLead;
