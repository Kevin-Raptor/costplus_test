import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { ensureDefaultSchema, getActiveFormSchema, syncSchemaIfNeeded } from './src/form/formSchemaDb';
import FormSchemaAdminScreen from './src/screens/FormSchemaAdminScreen';
import LeadDetailScreen from './src/screens/LeadDetailScreen';
import LeadFormScreen from './src/screens/LeadFormScreen';
import LeadListScreen from './src/screens/LeadListScreen';

export type RootStackParamList = {
  Leads: undefined;
  LeadForm: { draftId?: number } | undefined;
  LeadDetail: { leadId: number };
  SchemaAdmin: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  useEffect(() => {
    const bootstrapSchema = async () => {
      const current = getActiveFormSchema() ?? ensureDefaultSchema();
      const result = await syncSchemaIfNeeded();

      if (!current && !result.schema) {
        Alert.alert(
          'No form schema available',
          'Get internet to load the latest form schema and then reopen the app.',
          [{ text: 'OK' }],
        );
      }
    };

    bootstrapSchema();
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Leads">
        <Stack.Screen
          name="Leads"
          component={LeadListScreen}
          options={{
            headerTitle: 'Saved Forms',
            headerLargeTitle: true,
          }}
        />
        <Stack.Screen
          name="LeadForm"
          component={LeadFormScreen}
          options={{ title: 'Site Commissioning Form' }}
        />
        <Stack.Screen
          name="LeadDetail"
          component={LeadDetailScreen}
          options={{ title: 'Form Details' }}
        />
        <Stack.Screen
          name="SchemaAdmin"
          component={FormSchemaAdminScreen}
          options={{ title: 'Form Schema Admin' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return <AppNavigator />;
}
