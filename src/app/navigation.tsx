import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
} from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Gamepad2,
  House,
  Layers,
  MessageCircle,
  User,
} from 'lucide-react-native';
import { brand } from './theme';
import { bridge, profile } from '../services/ai/llamaBridge';
import { ocrAvailable, pickAndRead, snapAndRead } from '../services/ingest/ocr';
import { fileImportAvailable, importNotesFile } from '../services/ingest/files';
import { setCurrentDeck } from '../store/useDeckStore';
import { HomeScreen } from '../screens/HomeScreen';
import { DecksScreen } from '../screens/DecksScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { IngestScreen } from '../screens/IngestScreen';
import { CrosswordScreen } from '../screens/CrosswordScreen';
import { WordscapeScreen } from '../screens/WordscapeScreen';
import { DailyTermScreen } from '../screens/DailyTermScreen';
import { ChatTutorScreen } from '../screens/ChatTutorScreen';
import { AskNotesScreen } from '../screens/AskNotesScreen';
import { ReviewTermsScreen } from '../screens/ReviewTermsScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ProofPanelScreen } from '../screens/ProofPanelScreen';
import { DevBenchScreen } from '../screens/DevBenchScreen';
import { UiCheckScreen } from '../screens/UiCheckScreen';
import { SchoolPlannerScreen } from '../screens/SchoolPlannerScreen';
import { schoolAgent, schoolAgentAvailable } from '../services/school/agent';
import { useDeckStore } from '../store/useDeckStore';

export type RootStackParamList = {
  Tabs: undefined;
  /** With `appendTo`, the scan is added to that deck as another page. */
  Ingest: { appendTo?: string } | undefined;
  ReviewTerms: { docId: string };
  Quiz: { docId: string };
  Crossword: { docId: string };
  Wordscape: { docId: string };
  DailyTerm: { docId?: string };
  Ask: undefined;
  Proof: undefined;
  DevBench: undefined;
  UiCheck: undefined;
  SchoolPlanner: undefined;
};
export type TabParamList = {
  Home: undefined;
  Decks: undefined;
  Games: undefined;
  Tutor: undefined;
  Progress: undefined;
};
export type Props<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: brand.bg,
    card: brand.bgDeep,
    primary: brand.primary,
  },
};

const icon =
  (Icon: typeof House) =>
  ({ color }: { color: string }) =>
    <Icon color={color} size={22} />;

function Chat() {
  return <ChatTutorScreen bridge={bridge} />;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: brand.primary,
        tabBarInactiveTintColor: brand.textDim,
        tabBarStyle: {
          backgroundColor: brand.bgDeep,
          borderTopColor: brand.border,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: icon(House) }}
      />
      <Tab.Screen
        name="Decks"
        component={DecksScreen}
        options={{ tabBarIcon: icon(Layers) }}
      />
      <Tab.Screen
        name="Games"
        component={GamesScreen}
        options={{ tabBarIcon: icon(Gamepad2) }}
      />
      <Tab.Screen
        name="Tutor"
        component={Chat}
        options={{ tabBarIcon: icon(MessageCircle) }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ tabBarIcon: icon(User) }}
      />
    </Tab.Navigator>
  );
}

function Ingest({ navigation, route }: Props<'Ingest'>) {
  return (
    <IngestScreen
      bridge={bridge}
      profile={profile}
      appendTo={route.params?.appendTo}
      onReview={docId => {
        setCurrentDeck(docId);
        navigation.navigate('ReviewTerms', { docId });
      }}
      onBack={() => navigation.goBack()}
      onPlay={docId => {
        setCurrentDeck(docId);
        navigation.replace('Wordscape', { docId });
      }}
      onDailyPlay={docId => {
        setCurrentDeck(docId);
        navigation.replace('DailyTerm', { docId });
      }}
      snapPage={ocrAvailable() ? snapAndRead : undefined}
      pickPage={ocrAvailable() ? pickAndRead : undefined}
      pickFile={fileImportAvailable() ? importNotesFile : undefined}
    />
  );
}

function ReviewTerms({ navigation, route }: Props<'ReviewTerms'>) {
  const { docId } = route.params;
  return (
    <ReviewTermsScreen
      docId={docId}
      onBack={() => navigation.goBack()}
      onPlay={() => {
        setCurrentDeck(docId);
        navigation.replace('Crossword', { docId });
      }}
    />
  );
}

function Quiz({ navigation, route }: Props<'Quiz'>) {
  return (
    <QuizScreen
      bridge={bridge}
      docId={route.params.docId}
      onBack={() => navigation.goBack()}
    />
  );
}

function Ask({ navigation }: Props<'Ask'>) {
  const docId = useDeckStore(s => s.currentDocId);
  return (
    <AskNotesScreen
      bridge={bridge}
      docId={docId ?? undefined}
      onBack={() => navigation.goBack()}
    />
  );
}

export default function Navigation() {
  useEffect(() => {
    if (!schoolAgentAvailable()) return;
    let live = true;
    const resume = async () => {
      try {
        if (!live) return;
        if (navigationRef.isReady()) {
          const requested = await schoolAgent.consumePlannerRequest();
          if (requested && live) navigationRef.navigate('SchoolPlanner');
        }
        const state = await schoolAgent.getState();
        if (
          live &&
          state.connected &&
          state.online &&
          !state.syncing &&
          Date.now() - state.lastSync > 5 * 60 * 1000
        )
          await schoolAgent.sync();
      } catch {
        /* The planner displays connection errors without blocking the study games. */
      }
    };
    schoolAgent
      .initialize()
      .then(resume)
      .catch(() => {});
    const app = AppState.addEventListener('change', next => {
      if (next === 'active') void resume();
    });
    const network = NetInfo.addEventListener(connection => {
      if (connection.isInternetReachable) void resume();
    });
    return () => {
      live = false;
      app.remove();
      network();
    };
  }, []);
  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        if (schoolAgentAvailable())
          schoolAgent
            .consumePlannerRequest()
            .then(requested => {
              if (requested && navigationRef.isReady())
                navigationRef.navigate('SchoolPlanner');
            })
            .catch(() => {});
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen name="Ingest" component={Ingest} />
        <Stack.Screen name="Crossword" component={CrosswordScreen} />
        <Stack.Screen name="Wordscape" component={WordscapeScreen} />
        <Stack.Screen name="DailyTerm" component={DailyTermScreen} />
        <Stack.Screen name="Ask" component={Ask} />
        <Stack.Screen name="ReviewTerms" component={ReviewTerms} />
        <Stack.Screen name="Quiz" component={Quiz} />
        <Stack.Screen name="Proof">
          {({ navigation }: Props<'Proof'>) => (
            <ProofPanelScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="DevBench">
          {({ navigation }: Props<'DevBench'>) => (
            <DevBenchScreen
              onBack={() => navigation.goBack()}
              onUiCheck={() => navigation.navigate('UiCheck')}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="UiCheck">
          {({ navigation }: Props<'UiCheck'>) => (
            <UiCheckScreen onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="SchoolPlanner" component={SchoolPlannerScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
