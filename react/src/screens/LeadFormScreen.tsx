import DateTimePicker from '@react-native-community/datetimepicker';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';

import { createLead, getLeadById, hasInternetConnection, updateLead } from '../database/lead-db';
import { getPhotoFields, type FieldDefinition, type FormSectionDefinition } from '../form/formDefinition';
import { ensureDefaultSchema, getActiveFormSchema } from '../form/formSchemaDb';
import type { CommissioningFormInput, PhotoSlot } from '../types';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'LeadForm'>;
type FieldKey = keyof CommissioningFormInput;

const generateFormReference = () => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `FORM-${stamp}`;
};

const buildDefaultPhotoSlots = (schema = getActiveFormSchema() ?? ensureDefaultSchema()): PhotoSlot[] => {
  return getPhotoFields(schema).map(([key, field]) => ({
    id: key,
    label: field.label || key,
    captured: false,
  }));
};

const buildFormForSchema = (
  source: CommissioningFormInput,
  schema: ReturnType<typeof ensureDefaultSchema>,
  useSchemaDefaults = false,
) => {
  const values = { ...source } as Record<string, any>;
  Object.entries(schema.fields).forEach(([key, field]) => {
    if (field.type === 'photo') return;

    const currentValue = values[key];
    if (field.type === 'toggle' || field.type === 'select') {
      const options = field.options ?? [];
      const validCurrentValue = options.some((option) => String(option) === String(currentValue));
      values[key] = useSchemaDefaults
        ? field.defaultValue ?? options[0] ?? ''
        : validCurrentValue ? currentValue : field.defaultValue ?? options[0] ?? '';
      if (field.optionValueType === 'number' && values[key] !== '') values[key] = Number(values[key]);
      return;
    }

    if (field.type === 'number' || field.type === 'integer') {
      values[key] = useSchemaDefaults || currentValue === undefined || currentValue === null
        ? field.defaultValue ?? ''
        : Number(currentValue);
      return;
    }

    if (useSchemaDefaults) values[key] = field.defaultValue ?? '';
    else if (currentValue === undefined || currentValue === null) values[key] = field.defaultValue ?? '';
  });

  const existingPhotos = new Map((source.photos ?? []).map((photo) => [photo.id, photo]));
  return {
    ...values,
    photos: buildDefaultPhotoSlots(schema).map((photo) => ({
      ...photo,
      captured: existingPhotos.get(photo.id)?.captured ?? false,
    })),
  } as CommissioningFormInput;
};

const emptyForm: CommissioningFormInput = {
  status: 'draft',
  siteName: '',
  formReference: generateFormReference(),
  contractorMobilisedDate: '',
  solarFoundationStartDate: '',
  solarFoundationEndDate: '',
  earthingWorks: 'no',
  earthingType: '',
  earthingNos: '',
  essInstalled: 'no',
  essCount: 0,
  essUnits: [],
  panelCapacity: '',
  numberOfPanels: '',
  solarPvCapacity: '',
  photos: buildDefaultPhotoSlots(),
};

const formatDateForInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateValue = (value: string) => {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPvCapacity = (panelCapacity: string, numberOfPanels: string) => {
  if (!panelCapacity || !numberOfPanels) {
    return '';
  }

  const capacity = Number(panelCapacity);
  const count = Number(numberOfPanels);

  if (!Number.isFinite(capacity) || !Number.isFinite(count)) {
    return '';
  }

  return ((capacity * count) / 1000).toFixed(2);
};

export default function LeadFormScreen({ navigation, route }: Props) {
  const isFocused = useIsFocused();
  const [schema, setSchema] = useState(() => getActiveFormSchema() ?? ensureDefaultSchema());
  const [form, setForm] = useState<CommissioningFormInput>(() =>
    buildFormForSchema({ ...emptyForm, formReference: generateFormReference() }, getActiveFormSchema() ?? ensureDefaultSchema(), true),
  );
  const [draftId, setDraftId] = useState<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [openDateField, setOpenDateField] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const fieldLayouts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const activeSchema = getActiveFormSchema() ?? ensureDefaultSchema();
    setSchema(activeSchema);

    const existingDraftId = route.params?.draftId;
    if (!existingDraftId) {
      setForm(buildFormForSchema({
        ...emptyForm,
        formReference: generateFormReference(),
      }, activeSchema, true));
      setDraftId(null);
      setFieldErrors({});
      return;
    }

    const existing = getLeadById(existingDraftId);
    if (!existing) {
      return;
    }

    setForm({
      ...buildFormForSchema({
        ...existing,
        status: 'draft',
        essUnits: existing.essUnits || [],
      }, activeSchema),
    });
    setDraftId(existing.id);
    setFieldErrors({});
  }, [isFocused, route.params?.draftId]);

  const ensurePhotoSlots = (photos: PhotoSlot[] = [], activeSchema = schema) => {
    const expected = buildDefaultPhotoSlots(activeSchema);
    const currentById = new Map((photos || []).map((slot) => [slot.id, slot]));

    return expected.map((slot) => ({
      ...slot,
      captured: currentById.get(slot.id)?.captured ?? false,
    }));
  };

  const photoSlots = useMemo(() => ensurePhotoSlots(form.photos), [form.photos, schema]);

  const validateField = (field: string, currentForm: CommissioningFormInput): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const contractorDate = getDateValue(currentForm.contractorMobilisedDate);
    const foundationStart = getDateValue(currentForm.solarFoundationStartDate);
    const foundationEnd = getDateValue(currentForm.solarFoundationEndDate);

    const schemaField = schema.fields[field];
    if (!schemaField) return '';

    if ((field === 'earthingType' || field === 'earthingNos') && currentForm.earthingWorks !== 'yes') return '';
    if (field === 'essCount' && currentForm.essInstalled !== 'yes') return '';

    if (schemaField.type === 'photo') {
      const earthingPointMatch = field.match(/^earthingPhotoEP([1-3])$/);
      if (earthingPointMatch) {
        const pointNumber = Number(earthingPointMatch[1]);
        if (currentForm.earthingWorks !== 'yes' || Number(currentForm.earthingNos) < pointNumber) return '';
      }
      if (!schemaField.required) return '';
      const slot = currentForm.photos.find((item) => item.id === field);
      return slot && slot.captured ? '' : `${schemaField.label || field} is required.`;
    }

    const rawValue = (currentForm as Record<string, any>)[field];
    const isEmpty = rawValue === '' || rawValue === null || rawValue === undefined;
    if (schemaField.required && isEmpty) {
      return `${schemaField.label || field} is required.`;
    }

    if (isEmpty) return '';

    if (schemaField.type === 'date') {
      const dateValue = getDateValue(String(rawValue));
      if (dateValue && schemaField.validation?.allowFutureDates !== true && dateValue > today) return 'No date may be in the future.';
      if (field === 'solarFoundationStartDate' && contractorDate && dateValue && dateValue < contractorDate) {
        return 'Start date cannot be earlier than Contractor Mobilised date.';
      }
      if (field === 'solarFoundationEndDate' && foundationStart && dateValue && dateValue < foundationStart) {
        return 'End date cannot be earlier than start date.';
      }
    }

    if (schemaField.type === 'number' || schemaField.type === 'integer') {
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) return `${schemaField.label || field} must be a number.`;
      if (schemaField.validation?.min !== undefined && numericValue < schemaField.validation.min) {
        return `${schemaField.label || field} must be at least ${schemaField.validation.min}.`;
      }
      if (schemaField.validation?.max !== undefined && numericValue > schemaField.validation.max) {
        return `${schemaField.label || field} must be no more than ${schemaField.validation.max}.`;
      }
      if (schemaField.type === 'integer' && !Number.isInteger(numericValue)) return `${schemaField.label || field} must be a whole number.`;
    }

    return '';
  };

  const validateForm = () => {
    const errors: Partial<Record<FieldKey, string>> = {};
    Object.entries(schema.fields).forEach(([field]) => {
      const message = validateField(field, form);
      if (message) {
        errors[field as FieldKey] = message;
      }
    });

    const essCountField = schema.fields.essCount;
    if (form.essInstalled === 'yes' && essCountField?.required && (essCountField.type === 'number' || essCountField.type === 'integer')) {
      const missing = form.essUnits.slice(0, form.essCount).some((unit) => !unit?.make?.trim() || !unit?.serialNo?.trim());
      if (missing) errors.essCount = 'Each ESS unit needs a Make and Serial No.';
    }

    return errors;
  };

  const persistDraft = (nextForm: CommissioningFormInput) => {
    const prepared = { ...nextForm, formReference: nextForm.formReference || generateFormReference() };

    if (!draftId) {
      const created = createLead({ ...prepared, status: 'draft' });
      setDraftId(created.id);
      return;
    }

    updateLead(draftId, { ...prepared, status: 'draft' });
  };

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => {
      const schemaField = schema.fields[field];
      const normalizedValue = schemaField && (schemaField.type === 'number' || schemaField.type === 'integer') && value !== ''
        ? Number(value)
        : value;

      const next = { ...prev, [field]: normalizedValue } as Record<string, any>;

      if (field === 'earthingWorks') {
        if (value === 'no') {
          next.earthingType = '';
          next.earthingNos = '';
          setFieldErrors((prevErrors) => {
            const nextErrors = { ...prevErrors };
            delete nextErrors.earthingType;
            delete nextErrors.earthingNos;
            return nextErrors;
          });
        }
      }

      if (field === 'panelCapacity' || field === 'numberOfPanels') {
        next.solarPvCapacity = getPvCapacity(String(next.panelCapacity), String(next.numberOfPanels));
      }

      if (field === 'essInstalled' && value === 'yes' && prev.essCount === 0) {
        next.essCount = 1;
      }

      if (field === 'essCount') {
        const count = Number(value || 0);
        next.essUnits = Array.from({ length: Math.max(0, count) }, (_, index) => ({
          id: `ess-unit-${index + 1}`,
          make: prev.essUnits[index]?.make || '',
          serialNo: prev.essUnits[index]?.serialNo || '',
        }));
      }

      const nextErrors = { ...fieldErrors };
      const error = validateField(field, next as CommissioningFormInput);
      if (error) {
        nextErrors[field as FieldKey] = error;
      } else {
        delete nextErrors[field as FieldKey];
      }
      setFieldErrors(nextErrors);

      persistDraft(next as CommissioningFormInput);
      return next as CommissioningFormInput;
    });
  };

  const updateEssUnit = (index: number, field: 'make' | 'serialNo', value: string) => {
    setForm((prev) => {
      const essUnits = [...prev.essUnits];
      essUnits[index] = { ...essUnits[index], [field]: value };
      const next = { ...prev, essUnits };

      const essError = next.essInstalled === 'yes' && next.essUnits.slice(0, next.essCount).some((unit) => !unit?.make?.trim() || !unit?.serialNo?.trim())
        ? 'Each ESS unit needs a Make and Serial No.'
        : '';

      setFieldErrors((prevErrors) => ({
        ...prevErrors,
        essCount: essError || validateField('essCount', next),
      }));

      persistDraft(next);
      return next;
    });
  };

  const togglePhoto = (id: string) => {
    setForm((prev) => {
      const nextPhotos = ensurePhotoSlots(prev.photos);
      const next = {
        ...prev,
        photos: nextPhotos.map((slot) => (slot.id === id ? { ...slot, captured: !slot.captured } : slot)),
      };

      const schemaField = schema.fields[id];
      if (schemaField?.required) {
        const error = validateField(id, next as CommissioningFormInput);
        setFieldErrors((prevErrors) => {
          const nextErrors = { ...prevErrors };
          if (error) {
            nextErrors[id as FieldKey] = error;
          } else {
            delete nextErrors[id as FieldKey];
          }
          return nextErrors;
        });
      }

      persistDraft(next);
      return next;
    });
  };

  const scrollToField = (fieldPath: string) => {
    const top = fieldLayouts.current[fieldPath];
    if (typeof top === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(top - 120, 0), animated: true });
    }
  };

  const handleSubmit = async () => {
    const normalizedForm = {
      ...form,
      photos: ensurePhotoSlots(form.photos, schema),
    } as CommissioningFormInput;

    const validationErrors = validateForm();
    setFieldErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      const firstField = Object.keys(validationErrors)[0];
      scrollToField(firstField);
      ToastAndroid.show('Please fill in all required fields before submitting.', ToastAndroid.SHORT);
      return;
    }

    const online = await hasInternetConnection();
    const finalStatus = online ? 'complete' : 'pending';
    const finalForm = {
      ...normalizedForm,
      formReference: normalizedForm.formReference || generateFormReference(),
      status: finalStatus,
      solarPvCapacity: getPvCapacity(normalizedForm.panelCapacity, normalizedForm.numberOfPanels),
      photos: ensurePhotoSlots(normalizedForm.photos, schema),
    } as CommissioningFormInput;

    if (draftId) {
      updateLead(draftId, finalForm as any);
    } else {
      const created = createLead(finalForm as any);
      setDraftId(created.id);
    }

    ToastAndroid.show(
      online ? 'Form submitted successfully.' : 'Saved offline and queued for sync.',
      ToastAndroid.SHORT,
    );

    navigation.goBack();
  };

  const renderRequiredLabel = (label: string, required: boolean = true) => (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {required && <Text style={styles.requiredStar}>*</Text>}
    </View>
  );

  const isFieldVisible = (key: string) => {
    if ((key === 'earthingType' || key === 'earthingNos') && form.earthingWorks !== 'yes') return false;
    const earthingPointMatch = key.match(/^earthingPhotoEP([1-3])$/);
    if (earthingPointMatch && (form.earthingWorks !== 'yes' || Number(form.earthingNos) < Number(earthingPointMatch[1]))) return false;
    if (key === 'essCount' && form.essInstalled !== 'yes') return false;
    return true;
  };

  const renderSchemaField = (key: string, field: FieldDefinition) => {
    if (!isFieldVisible(key)) return null;

    const value = (form as Record<string, any>)[key] ?? '';
    const error = fieldErrors[key as FieldKey];

    if (field.type === 'photo') {
      const slot = photoSlots.find((photo) => photo.id === key);
      const captured = slot?.captured ?? false;
      return (
        <View key={key} onLayout={(event) => { fieldLayouts.current[key] = event.nativeEvent.layout.y; }}>
          <Pressable
            style={[styles.photoSlot, captured && styles.photoSlotCaptured]}
            onPress={() => togglePhoto(key)}
          >
            <View style={styles.photoHeaderRow}>
              <Text style={[styles.photoText, captured && styles.photoTextCaptured]}>{field.label || key}</Text>
              {field.required && <Text style={styles.requiredStar}>*</Text>}
            </View>
            <Text style={styles.photoStatus}>{captured ? 'Captured' : 'Tap to capture'}</Text>
          </Pressable>
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );
    }

    return (
      <View key={key} onLayout={(event) => { fieldLayouts.current[key] = event.nativeEvent.layout.y; }}>
        {renderRequiredLabel(field.label || key, field.required)}
        {field.type === 'date' ? (
          <Pressable
            style={[styles.datePickerButton, !!error && styles.inputError]}
            onPress={() => setOpenDateField(key)}
          >
            <Text style={styles.datePickerText}>{String(value || 'Select date')}</Text>
          </Pressable>
        ) : field.type === 'select' || field.type === 'toggle' ? (
          <View style={field.type === 'toggle' ? styles.toggleRow : styles.selectWrap}>
            {(field.options ?? []).map((option) => {
              const isSelected = String(value) === String(option);
              const optionValue = field.optionValueType === 'number' ? Number(option) : option;
              return (
                <Pressable
                  key={`${key}-${option}`}
                  style={[
                    field.type === 'toggle' ? styles.toggleButton : styles.optionButton,
                    isSelected && (field.type === 'toggle' ? styles.toggleButtonSelected : styles.optionButtonSelected),
                  ]}
                  onPress={() => updateField(key, optionValue)}
                >
                  <Text style={[
                    field.type === 'toggle' ? styles.toggleButtonText : styles.optionText,
                    isSelected && (field.type === 'toggle' ? styles.toggleButtonTextSelected : styles.optionTextSelected),
                  ]}>{field.type === 'toggle' ? String(option).toUpperCase() : option}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={[styles.input, !!error && styles.inputError]}
            value={String(value)}
            onChangeText={(text) => updateField(key, text)}
            placeholder={field.placeholder}
            keyboardType={field.type === 'number' || field.type === 'integer' ? 'number-pad' : 'default'}
          />
        )}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {key === 'essCount' && form.essInstalled === 'yes' && (
          <View style={styles.subSection}>
            {Array.from({ length: Math.max(1, form.essCount || 0) }).map((_, index) => (
              <View key={`ess-${index}`} style={styles.essBlock}>
                <Text style={styles.subLabel}>ESS Unit {index + 1}</Text>
                <TextInput
                  style={styles.input}
                  value={form.essUnits[index]?.make || ''}
                  onChangeText={(value) => updateEssUnit(index, 'make', value)}
                  placeholder="Make"
                />
                <TextInput
                  style={styles.input}
                  value={form.essUnits[index]?.serialNo || ''}
                  onChangeText={(value) => updateEssUnit(index, 'serialNo', value)}
                  placeholder="Serial No"
                />
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderSchemaSection = (section: FormSectionDefinition) => {
    const fields = section.fields.filter((key) => schema.fields[key] && isFieldVisible(key));
    if (fields.length === 0) return null;

    return (
      <View key={section.id} style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {fields.map((key) => renderSchemaField(key, schema.fields[key]))}
        {section.fields.includes('panelCapacity') && section.fields.includes('numberOfPanels') && (
          <View style={styles.readOnlyBox}>
            <Text style={styles.readOnlyLabel}>Solar PV Capacity</Text>
            <Text style={styles.readOnlyValue}>{form.solarPvCapacity || getPvCapacity(String(form.panelCapacity), String(form.numberOfPanels)) || '0.00 kW'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Commissioning</Text>
        <Text style={styles.heading}>Site Form</Text>
        <Text style={styles.subtitle}>Capture the key installation details and submit when ready.</Text>
      </View>
      {schema.sections.map(renderSchemaSection)}

      {openDateField && (
        <DateTimePicker
          value={new Date(`${(form as Record<string, any>)[openDateField] || formatDateForInput(new Date())}T00:00:00`)}
          mode="date"
          display="default"
          maximumDate={schema.fields[openDateField]?.validation?.allowFutureDates ? undefined : new Date()}
          onValueChange={(_event, selectedDate) => {
            if (!selectedDate || !openDateField) return;
            updateField(openDateField, formatDateForInput(selectedDate));
            setOpenDateField(null);
          }}
          onDismiss={() => setOpenDateField(null)}
          onNeutralButtonPress={() => setOpenDateField(null)}
        />
      )}

      <Pressable style={styles.saveButton} onPress={handleSubmit}>
        <Text style={styles.saveButtonText}>Submit</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4ff' },
  content: { padding: 16, paddingBottom: 56 },
  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: '#93c5fd', textTransform: 'uppercase' },
  heading: { fontSize: 30, fontWeight: '800', color: '#f8fafc', marginTop: 6 },
  subtitle: { fontSize: 13, color: '#cbd5e1', marginTop: 8, lineHeight: 18 },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dfeaf5',
    shadowColor: '#c6d7ef',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  subSection: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, marginTop: 6, marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 8 },
  requiredStar: { color: '#dc2626', fontSize: 15, fontWeight: '700', marginLeft: 4, marginTop: 8 },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9e3f1',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 10,
  },
  inputError: { borderColor: '#dc2626', backgroundColor: '#fff1f2' },
  datePickerButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9e3f1',
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 10,
  },
  datePickerText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  pickerWrap: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9e3f1',
    marginBottom: 10,
    overflow: 'hidden',
  },
  picker: { height: 52, width: '100%', color: '#0f172a' },
  disabledInput: { backgroundColor: '#e2e8f0' },
  toggleRow: { flexDirection: 'row', marginBottom: 12 },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d9e3f1',
    marginRight: 8,
    borderRadius: 12,
  },
  toggleButtonSelected: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  toggleButtonText: { fontWeight: '700', color: '#475569' },
  toggleButtonTextSelected: { color: '#1d4ed8' },
  selectWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  optionButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d9e3f1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonSelected: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  optionText: { color: '#334155', fontWeight: '600' },
  optionTextSelected: { color: '#166534' },
  subLabel: { fontSize: 13, fontWeight: '800', color: '#334155', marginBottom: 8 },
  essBlock: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#d9e3f1', borderRadius: 12, padding: 12, marginBottom: 12 },
  photoGrid: { flexDirection: 'column', marginTop: 8 },
  photoSlot: {
    width: '100%',
    minHeight: 100,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#d9e3f1',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    justifyContent: 'center',
  },
  photoSlotCaptured: { backgroundColor: '#ecfdf5', borderColor: '#34d399' },
  photoHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  photoText: { fontWeight: '700', color: '#0f172a', marginRight: 6 },
  photoTextCaptured: { color: '#166534' },
  photoStatus: { fontSize: 12, color: '#475569', fontWeight: '600' },
  readOnlyBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  readOnlyLabel: { fontSize: 12, fontWeight: '700', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: 0.4 },
  readOnlyValue: { fontSize: 20, fontWeight: '800', color: '#1e3a8a', marginTop: 4 },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: -4, marginBottom: 8, fontWeight: '600' },
  saveButton: {
    marginTop: 4,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  saveButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
});
