import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLeadById, markLeadSynced } from '../database/lead-db';
import type { Lead } from '../types';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'LeadDetail'>;

export default function LeadDetailScreen({ route, navigation }: Props) {
  const { leadId } = route.params;
  const [lead, setLead] = useState<Lead | null>(null);

  const refreshLead = useCallback(() => {
    setLead(getLeadById(leadId));
  }, [leadId]);

  useFocusEffect(
    useCallback(() => {
      refreshLead();
    }, [refreshLead])
  );

  if (!lead) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>Lead not found.</Text>
      </View>
    );
  }

  const handleMarkSynced = () => {
    const updated = markLeadSynced(lead.id);
    setLead(updated);
    Alert.alert('Lead synced', 'The local record has been marked as synced.');
  };

  const statusColor =
    lead.status === 'complete'
      ? '#16a34a'
      : lead.status === 'pending'
        ? '#f59e0b'
        : '#64748b';

  const metricCards = [
    { label: 'Status', value: lead.status },
    { label: 'Reference', value: lead.formReference || '—' },
    { label: 'Photos', value: `${lead.photos.filter((slot) => slot.captured).length}/${lead.photos.length}` },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <Text style={styles.kicker}>Commissioning record</Text>
          <View style={[styles.badge, { backgroundColor: statusColor }]}>
            <Text style={styles.badgeText}>{lead.status}</Text>
          </View>
        </View>

        <Text style={styles.name}>{lead.siteName || `Form #${lead.id}`}</Text>
        <Text style={styles.subtitle}>{lead.formReference || 'No reference assigned'}</Text>
      </View>

      <View style={styles.metricGrid}>
        {metricCards.map((item) => (
          <View key={item.label} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{item.label}</Text>
            <Text style={styles.metricValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>A — Construction</Text>
        <View style={styles.detailList}>
          <View style={styles.row}><Text style={styles.label}>Mobilised</Text><Text style={styles.value}>{lead.contractorMobilisedDate || 'Not set'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Foundation start</Text><Text style={styles.value}>{lead.solarFoundationStartDate || 'Not set'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Foundation end</Text><Text style={styles.value}>{lead.solarFoundationEndDate || 'Not set'}</Text></View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Earthing</Text>
        <View style={styles.detailList}>
          <View style={styles.row}><Text style={styles.label}>Works</Text><Text style={styles.value}>{lead.earthingWorks || 'Not set'}</Text></View>
          {lead.earthingWorks === 'yes' && (
            <>
              <View style={styles.row}><Text style={styles.label}>Type</Text><Text style={styles.value}>{lead.earthingType || 'Not set'}</Text></View>
              <View style={styles.row}><Text style={styles.label}>Nos</Text><Text style={styles.value}>{lead.earthingNos || 'Not set'}</Text></View>
            </>
          )}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>B — Utility Installation</Text>
        <View style={styles.detailList}>
          <View style={styles.row}><Text style={styles.label}>ESS installed</Text><Text style={styles.value}>{lead.essInstalled || 'Not set'}</Text></View>
          {lead.essInstalled === 'yes' && (
            <>
              <View style={styles.row}><Text style={styles.label}>ESS count</Text><Text style={styles.value}>{lead.essCount || 0}</Text></View>
              {lead.essUnits.length > 0 && (
                <View style={styles.inlineBlock}>
                  <Text style={styles.label}>ESS units</Text>
                  {lead.essUnits.map((unit, index) => (
                    <Text key={`${unit.make}-${index}`} style={styles.valueSmall}>
                      {index + 1}. {unit.make || 'Unknown make'} / {unit.serialNo || 'No serial'}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
          <View style={styles.row}><Text style={styles.label}>Panel capacity</Text><Text style={styles.value}>{lead.panelCapacity || 'Not set'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Number of panels</Text><Text style={styles.value}>{lead.numberOfPanels || 'Not set'}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Solar PV capacity</Text><Text style={styles.value}>{lead.solarPvCapacity || 'Not generated'}</Text></View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>C — Photos</Text>
        <Text style={styles.photoSummary}>{lead.photos.filter((slot) => slot.captured).length} captured of {lead.photos.length}</Text>
        <View style={styles.photoList}>
          {lead.photos.map((slot) => (
            <View key={slot.id} style={[styles.photoItem, slot.captured && styles.photoItemCaptured]}>
              <Text style={[styles.photoLabel, slot.captured && styles.photoLabelCaptured]}>{slot.label}</Text>
              <Text style={styles.photoStatus}>{slot.captured ? 'Captured' : 'Outstanding'}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Record info</Text>
        <View style={styles.detailList}>
          <View style={styles.row}><Text style={styles.label}>Created</Text><Text style={styles.value}>{new Date(lead.createdAt).toLocaleString()}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Updated</Text><Text style={styles.value}>{new Date(lead.updatedAt).toLocaleString()}</Text></View>
        </View>
      </View>

      {lead.status !== 'complete' && (
        <View style={styles.buttonWrap}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => navigation.navigate('LeadForm', { draftId: lead.id })}
          >
            <Text style={styles.primaryButtonText}>Continue filling</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={handleMarkSynced}>
            <Text style={styles.secondaryButtonText}>Mark as saved</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef4ff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef4ff',
  },
  emptyText: {
    color: '#475569',
    fontSize: 18,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 5,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#93c5fd',
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 30,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 10,
  },
  subtitle: {
    fontSize: 13,
    color: '#cbd5e1',
    marginTop: 6,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  metricGrid: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dfeaf5',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metricValue: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  detailList: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    flexShrink: 1,
    marginRight: 12,
  },
  value: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  valueSmall: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
    marginTop: 4,
  },
  inlineBlock: {
    marginTop: 8,
  },
  photoSummary: {
    fontSize: 14,
    color: '#1d4ed8',
    fontWeight: '800',
    marginBottom: 12,
  },
  photoList: {
    gap: 8,
  },
  photoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d9e3f1',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  photoItemCaptured: {
    backgroundColor: '#ecfdf5',
    borderColor: '#86efac',
  },
  photoLabel: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
  },
  photoLabelCaptured: {
    color: '#166534',
  },
  photoStatus: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buttonWrap: {
    marginTop: 8,
    gap: 12,
  },
  primaryButton: {
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
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
