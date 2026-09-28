export type FormStatus = 'draft' | 'pending' | 'complete';
export type EarthingWorks = 'yes' | 'no';
export type EarthingType = 'Chemical' | 'Pipe' | 'Spike' | '';
export type EarthingCount = '1' | '2' | '3' | '';
export type PanelCapacity = '575' | '580' | '585' | '590' | '600' | '';

export interface EssUnit {
  id: string;
  make: string;
  serialNo: string;
}

export interface PhotoSlot {
  id: string;
  label: string;
  captured: boolean;
}

export interface CommissioningForm {
  id: number;
  status: FormStatus;
  siteName: string;
  formReference: string;
  contractorMobilisedDate: string;
  solarFoundationStartDate: string;
  solarFoundationEndDate: string;
  earthingWorks: EarthingWorks;
  earthingType: EarthingType;
  earthingNos: EarthingCount;
  essInstalled: EarthingWorks;
  essCount: number;
  essUnits: EssUnit[];
  panelCapacity: PanelCapacity;
  numberOfPanels: string;
  solarPvCapacity: string;
  photos: PhotoSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface CommissioningFormInput extends Omit<CommissioningForm, 'id' | 'createdAt' | 'updatedAt'> {}

export type Lead = CommissioningForm;
export type LeadInput = CommissioningFormInput;
