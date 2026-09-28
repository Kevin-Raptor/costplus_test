import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { deleteLead, getAllLeads, hasInternetConnection, syncPendingLeads } from '../database/lead-db';
import type { Lead } from '../types';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Leads'>;

export default function LeadListScreen({ navigation }: Props) {
  const [forms, setForms] = useState<Lead[]>([]);

  const refreshForms = useCallback(() => {
    setForms(getAllLeads());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshForms();

      const attemptSync = async () => {
        const pendingCount = await syncPendingLeads();
        refreshForms();

        if (pendingCount > 0 && Platform.OS === 'android') {
          ToastAndroid.show(`Synced ${pendingCount} pending form(s).`, ToastAndroid.SHORT);
        }
      };

      attemptSync();
    }, [refreshForms])
  );

  const pendingCount = useMemo(
    () => forms.filter((item) => item.status === 'pending').length,
    [forms]
  );

  const handleResync = async () => {
    const online = await hasInternetConnection();
    if (!online) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('No internet. Pending forms remain on-device.', ToastAndroid.SHORT);
      }
      return;
    }

    const synced = await syncPendingLeads();
    refreshForms();

    if (Platform.OS === 'android') {
      ToastAndroid.show(
        synced > 0 ? `Resynced ${synced} pending form(s).` : 'No pending forms to sync.',
        ToastAndroid.SHORT,
      );
    }
  };

  const handleDeleteDraft = (id: number) => {
    const deleted = deleteLead(id);
    if (deleted) {
      refreshForms();
      if (Platform.OS === 'android') {
        ToastAndroid.show('Draft deleted.', ToastAndroid.SHORT);
      }
    }
  };

  const renderItem = ({ item }: { item: Lead }) => (
    <Pressable
      style={styles.card}
      onPress={() => {
        if (item.status === 'draft') {
          navigation.navigate('LeadForm', { draftId: item.id });
          return;
        }

        navigation.navigate('LeadDetail', { leadId: item.id });
      }}
    >
      <View style={styles.rowBetween}>
        <Text style={styles.name}>{item.siteName || `Form ${item.id}`}</Text>
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                item.status === 'complete' ? '#22c55e' : item.status === 'pending' ? '#f59e0b' : '#9ca3af',
            },
          ]}
        >
          <Text style={styles.badgeText}>{item.status}</Text>
        </View>
      </View>

      <Text style={styles.meta}>Ref: {item.formReference || 'Hidden internal reference'}</Text>
      <Text style={styles.meta}>Mobilised: {item.contractorMobilisedDate || 'Not set'}</Text>
      <Text style={styles.meta}>Foundation: {item.solarFoundationStartDate || 'Not set'}</Text>
      <Text style={styles.meta}>PV Capacity: {item.solarPvCapacity || 'Not computed'}</Text>

      {item.status === 'draft' && (
        <View style={styles.draftFooter}>
          <Text style={styles.continueText}>Continue filling</Text>
          <Pressable style={styles.deleteButton} onPress={() => handleDeleteDraft(item.id)}>
            <Text style={styles.deleteButtonText}>Delete draft</Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Saved Commissioning Forms</Text>
      </View>
        {pendingCount > 0 && (
          <Pressable style={styles.resyncButton} onPress={handleResync}>
            <Text style={styles.resyncButtonText}>Resync new forms</Text>
          </Pressable>
        )}

      <Text style={styles.summaryText}>{forms.length} forms • {pendingCount} pending</Text>

      <FlatList
        data={forms}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No saved forms yet.</Text>}
        renderItem={renderItem}
      />

      <Pressable style={styles.fab} onPress={() => navigation.navigate('LeadForm')}>
        <Text style={styles.fabText}>+ New form</Text>
      </Pressable>

      <Pressable style={styles.adminButton} onPress={() => navigation.navigate('SchemaAdmin')}>
        <Text style={styles.adminButtonText}>Admin</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  resyncButton: {
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    textAlign: 'center',
  },
  resyncButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryText: {
    color: '#4b5563',
    fontSize: 14,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 90,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,
    marginRight: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'capitalize',
  },
  meta: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 22,
  },
  draftFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  continueText: {
    color: '#2563eb',
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    paddingTop: 32,
    color: '#6b7280',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    backgroundColor: '#2563eb',
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  adminButton: {
    position: 'absolute',
    left: 20,
    bottom: 24,
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  adminButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
