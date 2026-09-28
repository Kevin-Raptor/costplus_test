import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useRef, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';

import type { RootStackParamList } from '../../App';
import {
  DEFAULT_FORM_SCHEMA,
  type FormFieldKey,
  type FormDefinition,
  type OptionValueType,
} from '../form/formDefinition';
import {
  ensureDefaultSchema,
  getActiveFormSchema,
  resetFormSchema,
  saveFormSchema,
  syncSchemaIfNeeded,
} from '../form/formSchemaDb';

type Props = NativeStackScreenProps<RootStackParamList, 'SchemaAdmin'>;

export default function FormSchemaAdminScreen({ navigation }: Props) {
  const [schema, setSchema] = useState<FormDefinition>(() => getActiveFormSchema() ?? DEFAULT_FORM_SCHEMA);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useFocusEffect(
    useCallback(() => {
      const active = getActiveFormSchema() ?? ensureDefaultSchema();
      setSchema(active);
    }, []),
  );

  const updateFieldLabel = (key: FormFieldKey, label: string) => {
    setSchema((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        [key]: {
          ...prev.fields[key],
          label,
        },
      },
    }));
  };

  const updateFieldRequired = (key: FormFieldKey, required: boolean) => {
    setSchema((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        [key]: {
          ...prev.fields[key],
          required,
        },
      },
    }));
  };

  const updateFieldType = (key: FormFieldKey, type: FormDefinition['fields'][FormFieldKey]['type']) => {
    setSchema((prev) => {
      const field = prev.fields[key];
      const nextOptions = type === 'toggle'
        ? (field.options ?? ['yes', 'no']).slice(0, 2).map((option) => option.trim() || 'yes')
        : type === 'select'
          ? (field.options ?? []).length > 0
            ? field.options ?? []
            : ['Option 1']
          : type === 'integer' || type === 'number'
            ? []
            : field.options ?? [];

      const defaultValue = type === 'toggle'
        ? (field.defaultValue ?? nextOptions[0] ?? 'yes')
        : type === 'select'
          ? (field.defaultValue ?? nextOptions[0] ?? 'Option 1')
          : type === 'integer' || type === 'number'
            ? Number.isFinite(Number(field.defaultValue)) ? Number(field.defaultValue) : 1
            : field.defaultValue ?? '';

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...field,
            type,
            options: type === 'toggle' ? (nextOptions.length ? nextOptions : ['yes', 'no']) : nextOptions,
            defaultValue,
            optionValueType: field.optionValueType ?? 'string',
          },
        },
      };
    });
  };

  const updateFieldDefaultValue = (key: FormFieldKey, value: string | number) => {
    setSchema((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        [key]: {
          ...prev.fields[key],
          defaultValue: value,
        },
      },
    }));
  };

  const updateFieldRange = (key: FormFieldKey, bound: 'min' | 'max', rawValue: string) => {
    setSchema((prev) => {
      const validation = { ...prev.fields[key].validation };
      if (rawValue.trim() === '') {
        delete validation[bound];
      } else {
        validation[bound] = Number(rawValue);
      }

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...prev.fields[key],
            validation,
          },
        },
      };
    });
  };

  const updateFieldOptionValueType = (key: FormFieldKey, valueType: OptionValueType) => {
    setSchema((prev) => ({
      ...prev,
      fields: {
        ...prev.fields,
        [key]: {
          ...prev.fields[key],
          optionValueType: valueType,
        },
      },
    }));
  };

  const updateFieldOption = (key: FormFieldKey, optionIndex: number, value: string) => {
    setSchema((prev) => {
      const options = [...(prev.fields[key].options ?? [])];
      options[optionIndex] = value;

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...prev.fields[key],
            options,
          },
        },
      };
    });
  };

  const addFieldOption = (key: FormFieldKey) => {
    setSchema((prev) => {
      const field = prev.fields[key];
      const options = [...(field.options ?? [])];

      if (field.type === 'toggle') {
        if (options.length >= 2) {
          return prev;
        }
        options.push(options.length === 0 ? 'yes' : 'no');
      } else {
        options.push(`Option ${options.length + 1}`);
      }

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...field,
            options,
          },
        },
      };
    });
  };

  const removeFieldOption = (key: FormFieldKey, optionIndex: number) => {
    setSchema((prev) => {
      const options = (prev.fields[key].options ?? []).filter((_, index) => index !== optionIndex);

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [key]: {
            ...prev.fields[key],
            options,
          },
        },
      };
    });
  };

  const addNewField = () => {
    const baseKey = 'newField';
    const nextKey = `${baseKey}${Object.keys(schema.fields).filter((key) => key.startsWith(baseKey)).length + 1}`;

    setSchema((prev) => {
      const entryKey = nextKey;
      const newField: FormDefinition['fields'][string] = {
        key: entryKey,
        label: 'New Field',
        type: 'text',
        required: false,
        placeholder: 'Enter value',
        options: ['Option 1'],
      };

      return {
        ...prev,
        fields: {
          ...prev.fields,
          [entryKey]: newField,
        },
        sections: prev.sections.some((section) => section.id === 'additional-fields')
          ? prev.sections.map((section) => section.id === 'additional-fields'
            ? { ...section, fields: [...section.fields, entryKey] }
            : section)
          : [...prev.sections, { id: 'additional-fields', title: 'Additional fields', fields: [entryKey] }],
      };
    });

    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
  };

  const deleteField = (key: FormFieldKey) => {
    Alert.alert(
      'Delete field',
      `Are you sure you want to delete "${key}"? This will not be saved until you tap Save schema.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setSchema((prev) => ({
              ...prev,
              fields: Object.fromEntries(
                Object.entries(prev.fields).filter(([fieldKey]) => fieldKey !== key),
              ),
              sections: prev.sections.map((section) => ({
                ...section,
                fields: section.fields.filter((fieldKey) => fieldKey !== key),
              })),
            }));
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const invalidField = Object.entries(schema.fields).find(([_, field]) => {
      const trimmedLabel = field.label?.trim();
      if (!trimmedLabel) {
        return true;
      }

      if ((field.type === 'toggle' || field.type === 'select') && (!field.options || field.options.length === 0)) {
        return true;
      }

      if ((field.type === 'toggle' || field.type === 'select')) {
        const cleanOptions = field.options?.map((option) => option.trim()).filter(Boolean) ?? [];
        if (field.type === 'toggle' && cleanOptions.length !== 2) {
          return true;
        }

        if (field.type === 'select' && cleanOptions.length < 1) {
          return true;
        }

        if (field.options?.some((option) => !option || !option.trim())) {
          return true;
        }

        const defaultValue = String(field.defaultValue ?? '').trim();
        if (!defaultValue || !cleanOptions.includes(defaultValue)) {
          return true;
        }
      }

      if (field.type === 'number' || field.type === 'integer') {
        const defaultValue = Number(field.defaultValue);
        const min = field.validation?.min;
        const max = field.validation?.max;
        if (field.defaultValue === undefined || field.defaultValue === '' || !Number.isFinite(defaultValue)) return true;
        if (min !== undefined && !Number.isFinite(min) || max !== undefined && !Number.isFinite(max)) return true;
        if (min !== undefined && max !== undefined && min > max) return true;
        if (min !== undefined && defaultValue < min || max !== undefined && defaultValue > max) return true;
        if (field.type === 'integer' && (!Number.isInteger(defaultValue) || min !== undefined && !Number.isInteger(min) || max !== undefined && !Number.isInteger(max))) return true;
      }

      return false;
    });

    if (invalidField) {
      const [key, field] = invalidField;
      const detail = field.type === 'toggle'
        ? `Toggle field "${field.label || key}" must have exactly 2 non-empty options and a valid default value.`
        : field.type === 'select'
          ? `Select field "${field.label || key}" must have at least 1 non-empty option and a valid default value.`
          : field.type === 'number' || field.type === 'integer'
            ? `Number field "${field.label || key}" needs a valid default within its range. Minimum must not exceed maximum; integer fields need whole-number defaults and bounds.`
            : `Field "${field.label || key}" cannot have an empty label.`;

      Alert.alert('Invalid schema', detail, [{ text: 'OK' }]);
      return;
    }

    const normalizedSchema = {
      ...schema,
      fields: Object.fromEntries(
        Object.entries(schema.fields).map(([key, field]) => {
          const cleanOptions = (field.options ?? []).map((option) => option.trim()).filter(Boolean);
          const cleanDefaultValue =
            field.type === 'toggle' || field.type === 'select'
              ? String(field.defaultValue ?? cleanOptions[0] ?? '').trim()
              : field.type === 'number' || field.type === 'integer'
                ? Number(field.defaultValue ?? 1)
                : field.defaultValue ?? '';

          return [
            key,
            {
              ...field,
              label: field.label.trim(),
              defaultValue: cleanDefaultValue,
              options: cleanOptions,
            },
          ];
        }),
      ),
      source: 'local-file' as const,
    };

    setSaving(true);
    saveFormSchema(normalizedSchema, 'local-file');
    setSaving(false);
    ToastAndroid.show('Schema saved locally.', ToastAndroid.SHORT);
    navigation.goBack();
  };

  const handleCheckForRemote = async () => {
    const result = await syncSchemaIfNeeded();
    const active = result.schema ?? getActiveFormSchema() ?? ensureDefaultSchema();
    setSchema(active);

    if (result.updated) {
      ToastAndroid.show('Form schema updated from remote cache.', ToastAndroid.SHORT);
      return;
    }

    Alert.alert(
      'Offline mode',
      'No internet right now. The app is using the last saved local form schema until it can sync again.',
      [{ text: 'OK' }],
    );
  };

  const handleResetSchema = () => {
    Alert.alert(
      'Reset schema',
      'This will overwrite the active SQLite schema with the bundled default schema.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            const resetSchema = resetFormSchema(DEFAULT_FORM_SCHEMA);
            setSchema(resetSchema);
            ToastAndroid.show('Schema reset to default.', ToastAndroid.SHORT);
          },
        },
      ],
    );
  };

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Form schema admin</Text>
      <Text style={styles.subtitle}>Edit the labels and required flags. This updates the in-app schema stored in SQLite.</Text>

      {/* <Pressable style={styles.syncButton} onPress={handleCheckForRemote}>
        <Text style={styles.syncButtonText}>Check for schema updates</Text>
      </Pressable> */}

      <Pressable style={styles.resetButton} onPress={handleResetSchema}>
        <Text style={styles.resetButtonText}>Reset SQLite schema</Text>
      </Pressable>

      <Pressable style={styles.addFieldButton} onPress={addNewField}>
        <Text style={styles.addFieldButtonText}>+ Add field</Text>
      </Pressable>

      {Object.keys(schema.fields).map((key) => {
        const typedKey = key as FormFieldKey;
        const field = schema.fields[typedKey];

        return (
          <View key={key} style={styles.card}>
            <View style={styles.fieldHeaderRow}>
              <Text style={styles.fieldKey}>{key}</Text>
              <Pressable style={styles.deleteFieldButton} onPress={() => deleteField(typedKey)}>
                <Text style={styles.deleteFieldButtonText}>Delete</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Label</Text>
            <TextInput
              value={field.label}
              onChangeText={(value) => updateFieldLabel(typedKey, value)}
              style={styles.input}
            />

            <Text style={styles.label}>Field type</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={field.type}
                onValueChange={(value) => updateFieldType(typedKey, String(value) as FormDefinition['fields'][FormFieldKey]['type'])}
                style={styles.picker}
              >
                {['text', 'date', 'toggle', 'select', 'number', 'integer', 'photo'].map((type) => (
                  <Picker.Item key={type} label={type} value={type} />
                ))}
              </Picker>
            </View>

            {(field.type === 'select' || field.type === 'toggle') && (
              <>
                <Text style={styles.label}>Option value type</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={field.optionValueType ?? 'string'}
                    onValueChange={(value) => updateFieldOptionValueType(typedKey, String(value) as OptionValueType)}
                    style={styles.picker}
                  >
                    <Picker.Item label="String" value="string" />
                    <Picker.Item label="Numeric" value="number" />
                  </Picker>
                </View>

                <Text style={styles.label}>Default option</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={String(field.defaultValue ?? (field.options?.[0] ?? ''))}
                    onValueChange={(value) => updateFieldDefaultValue(typedKey, String(value))}
                    style={styles.picker}
                  >
                    {(field.options && field.options.length > 0 ? field.options : ['Option 1']).map((option) => (
                      <Picker.Item key={`${typedKey}-default-${option}`} label={String(option)} value={String(option)} />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>Options</Text>
                {(field.options && field.options.length > 0 ? field.options : ['Option 1']).map((option, optionIndex) => (
                  <View key={`${typedKey}-option-${optionIndex}`} style={styles.optionRow}>
                    <TextInput
                      value={option}
                      onChangeText={(value) => updateFieldOption(typedKey, optionIndex, value)}
                      style={[styles.input, styles.optionInput]}
                      placeholder={field.type === 'toggle' ? 'yes' : `Option ${optionIndex + 1}`}
                      keyboardType={field.optionValueType === 'number' ? 'numeric' : 'default'}
                    />
                    <Pressable style={styles.removeOptionButton} onPress={() => removeFieldOption(typedKey, optionIndex)}>
                      <Text style={styles.removeOptionText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}

                {field.type !== 'toggle' && (
                  <Pressable style={styles.addOptionButton} onPress={() => addFieldOption(typedKey)}>
                    <Text style={styles.addOptionText}>+ Add option</Text>
                  </Pressable>
                )}
              </>
            )}

            {(field.type === 'number' || field.type === 'integer') && (
              <>
                <Text style={styles.label}>Default value</Text>
                <TextInput
                  value={String(field.defaultValue ?? '')}
                  onChangeText={(value) => updateFieldDefaultValue(typedKey, value === '' ? '' : Number(value))}
                  keyboardType={field.type === 'integer' ? 'number-pad' : 'decimal-pad'}
                  style={styles.input}
                  placeholder="Default value"
                />
                <Text style={styles.label}>Allowed range (leave blank for no limit)</Text>
                <View style={styles.rangeRow}>
                  <TextInput
                    value={field.validation?.min === undefined ? '' : String(field.validation.min)}
                    onChangeText={(value) => updateFieldRange(typedKey, 'min', value)}
                    keyboardType={field.type === 'integer' ? 'number-pad' : 'decimal-pad'}
                    style={[styles.input, styles.rangeInput]}
                    placeholder="Minimum"
                  />
                  <TextInput
                    value={field.validation?.max === undefined ? '' : String(field.validation.max)}
                    onChangeText={(value) => updateFieldRange(typedKey, 'max', value)}
                    keyboardType={field.type === 'integer' ? 'number-pad' : 'decimal-pad'}
                    style={[styles.input, styles.rangeInput]}
                    placeholder="Maximum"
                  />
                </View>
              </>
            )}

            <View style={styles.row}>
              <Text style={styles.label}>Required</Text>
              <Pressable
                style={[styles.toggle, field.required && styles.toggleActive]}
                onPress={() => updateFieldRequired(typedKey, !field.required)}
              >
                <Text style={styles.toggleText}>{field.required ? 'Yes' : 'No'}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save schema'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#4b5563',
    marginBottom: 16,
  },
  syncButton: {
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  resetButton: {
    backgroundColor: '#7c2d12',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  addFieldButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 18,
  },
  addFieldButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldKey: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
    textTransform: 'uppercase',
  },
  deleteFieldButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteFieldButtonText: {
    color: '#991b1b',
    fontWeight: '700',
    fontSize: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rangeInput: {
    flex: 1,
  },
  optionInput: {
    flex: 1,
    marginBottom: 0,
  },
  removeOptionButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  removeOptionText: {
    color: '#991b1b',
    fontWeight: '700',
    fontSize: 12,
  },
  addOptionButton: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  addOptionText: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  pickerWrap: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  picker: {
    height: 52,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggle: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  toggleActive: {
    backgroundColor: '#22c55e',
  },
  toggleText: {
    color: '#111827',
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
