// @refresh reset
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { Header } from '../components/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  schoolAgent,
  schoolAgentAvailable,
  type SchoolState,
  type SchoolItem,
} from '../services/school/agent';

const dateLabel = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
const failureText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Could not update the study planner.';

const plannerColors = {
  background: '#10141C',
  surface: '#191F2A',
  border: '#2A3240',
  text: '#EDF1F7',
  muted: '#A1AAB8',
  accent: '#82ACF4',
  primary: '#4276CE',
};

export function SchoolPlannerScreen() {
  const [state, setState] = useState<SchoolState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'tasks' | 'posts' | 'done'>('tasks');
  const [adding, setAdding] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const available = schoolAgentAvailable();
  const providerName =
    state?.provider === 'microsoft' ? 'Microsoft Teams' : 'Google Classroom';
  const refresh = useCallback(async () => {
    if (!schoolAgentAvailable()) return;
    try {
      setState(await schoolAgent.getState());
    } catch (e) {
      setError(failureText(e));
    }
  }, []);
  useEffect(() => {
    if (!available) return;
    let live = true;
    schoolAgent
      .initialize()
      .then(result => live && setState(result))
      .catch(e => live && setError(failureText(e)));
    const unsub = schoolAgent.subscribe(() => {
      if (live) void refresh();
    });
    const app = AppState.addEventListener('change', next => {
      if (next === 'active') void refresh();
    });
    const network = NetInfo.addEventListener(() => {
      if (live) void refresh();
    });
    return () => {
      live = false;
      unsub();
      app.remove();
      network();
    };
  }, [available, refresh]);
  const action = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(failureText(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = () => {
    if (!state?.configured) {
      Alert.alert(
        `${providerName} connection needs setup`,
        state?.provider === 'microsoft'
          ? 'The school must register and approve Backpack Tutor before you can connect Teams. Your local tasks and floating bubble can be used now.'
          : 'Complete the Google Cloud Android OAuth setup first. Connecting Classroom will ask for read-only access to your classes, assignments, and announcements. Local tasks and the bubble can be used now.',
      );
      return;
    }
    void action(() => schoolAgent.signIn());
  };
  const notifications = async (enabled: boolean) => {
    if (
      enabled &&
      Platform.OS === 'android' &&
      Number(Platform.Version) >= 33
    ) {
      const permission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    await action(() => schoolAgent.setNotifications(enabled));
  };
  const bubble = async () => {
    if (!state?.overlayAllowed && !state?.bubbleEnabled) {
      await action(() => schoolAgent.openBubblePermission());
      return;
    }
    await action(() => schoolAgent.setBubble(!state?.bubbleEnabled));
  };
  const add = async () => {
    let timestamp: number | null = null;
    if (due.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due.trim())) {
        setError('Use YYYY-MM-DD for the due date, or leave it blank.');
        return;
      }
      const [year, month, day] = due.trim().split('-').map(Number);
      const value = new Date(year, month - 1, day, 23, 59);
      if (
        value.getFullYear() !== year ||
        value.getMonth() !== month - 1 ||
        value.getDate() !== day
      ) {
        setError('Enter a valid due date.');
        return;
      }
      timestamp = value.getTime();
    }
    await action(async () => {
      await schoolAgent.addTask(title.trim(), timestamp);
      setTitle('');
      setDue('');
      setAdding(false);
    });
  };
  const items =
    state?.items.filter(item =>
      tab === 'done'
        ? item.done
        : !item.done &&
          (tab === 'posts'
            ? item.kind === 'announcement'
            : item.kind !== 'announcement'),
    ) ?? [];
  const itemRow = (item: SchoolItem) => (
    <View key={item.id} style={styles.item}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={`${
          item.kind === 'announcement' ? 'Read' : 'Done'
        }: ${item.title}`}
        disabled={busy}
        onPress={() => action(() => schoolAgent.markDone(item.id, !item.done))}
        style={styles.check}
      >
        {item.done ? (
          <Check size={22} color={plannerColors.accent} />
        ) : (
          <Circle size={22} color={plannerColors.muted} />
        )}
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.course}>{item.course}</Text>
        <Text style={[styles.itemTitle, item.done && styles.done]}>
          {item.title}
        </Text>
        {item.due != null && (
          <Text
            style={[
              styles.meta,
              !item.done && item.due < Date.now() && styles.overdue,
            ]}
          >
            Due {dateLabel(item.due)}
            {!item.done && item.due < Date.now() ? ' · overdue' : ''}
          </Text>
        )}
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        {item.url.startsWith('https://') && (
          <Pressable
            onPress={() =>
              Linking.openURL(item.url).catch(() =>
                setError('Could not open the school link.'),
              )
            }
          >
            <Text style={styles.link}>
              Open in {item.id.startsWith('google:') ? 'Classroom' : 'Teams'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="Study planner" subtitle="Tasks and school updates" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!available ? (
          <Text style={styles.body}>
            Install the updated Android app to use the offline planner and
            floating bubble.
          </Text>
        ) : !state ? (
          <ActivityIndicator color={plannerColors.accent} />
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                {(['google', 'microsoft'] as const).map(provider => (
                  <Pressable
                    key={provider}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: state.provider === provider,
                      disabled: busy || state.connected,
                    }}
                    disabled={busy || state.connected}
                    style={[
                      styles.tab,
                      state.provider === provider && styles.activeTab,
                    ]}
                    onPress={() =>
                      action(() => schoolAgent.setProvider(provider))
                    }
                  >
                    <Text style={styles.buttonText}>
                      {provider === 'google' ? 'Google Classroom' : 'Teams'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                <CalendarCheck color={plannerColors.muted} size={20} />
                <Text style={styles.heading}>
                  {state.connected ? state.account : providerName}
                </Text>
                <Text style={styles.badge}>
                  {state.online ? 'Online' : 'Offline'}
                </Text>
              </View>
              <Text style={styles.body}>
                {state.lastSync
                  ? `Last synced ${dateLabel(
                      state.lastSync,
                    )}. Saved items remain available offline.`
                  : 'Connect your school account to save assignments and announcements on this phone.'}
              </Text>
              {!state.configured && (
                <Text style={styles.meta}>
                  School connection setup is pending. You can use local tasks
                  now.
                </Text>
              )}
              <View style={styles.row}>
                {state.connected ? (
                  <>
                    <Pressable
                      disabled={busy || state.syncing}
                      style={styles.primary}
                      onPress={() => action(() => schoolAgent.sync())}
                    >
                      <RefreshCw color="#fff" size={16} />
                      <Text style={styles.buttonText}>
                        {state.syncing
                          ? 'Syncing…'
                          : state.online
                          ? 'Save latest updates'
                          : 'Sync when online'}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        Alert.alert(
                          `Disconnect ${providerName}?`,
                          'This removes downloaded school items from this phone. Your own tasks are kept.',
                          [
                            { text: 'Cancel' },
                            {
                              text: 'Disconnect',
                              onPress: () =>
                                action(() => schoolAgent.disconnect()),
                            },
                          ],
                        )
                      }
                    >
                      <Text style={styles.link}>Disconnect</Text>
                    </Pressable>
                    {!!state.error && (
                      <Pressable disabled={busy} onPress={connect}>
                        <Text style={styles.link}>Reconnect</Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Pressable
                    disabled={busy}
                    style={styles.primary}
                    onPress={connect}
                  >
                    <Text style={styles.buttonText}>
                      Connect{' '}
                      {state.provider === 'google' ? 'Classroom' : 'Teams'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {!!state.warning && (
                <Text style={styles.meta}>{state.warning}</Text>
              )}
              {!!state.error && <Text style={styles.error}>{state.error}</Text>}
            </View>
            <View style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showOptions }}
                onPress={() => setShowOptions(open => !open)}
                style={styles.row}
              >
                <Text style={[styles.itemTitle, styles.copy]}>
                  Reminders &amp; floating bubble
                </Text>
                {showOptions ? (
                  <ChevronUp size={18} color={plannerColors.muted} />
                ) : (
                  <ChevronDown size={18} color={plannerColors.muted} />
                )}
              </Pressable>
              {showOptions && (
                <>
                  <View style={styles.row}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>Due-date reminders</Text>
                      <Text style={styles.meta}>
                        Uses saved tasks, including while offline.
                      </Text>
                    </View>
                    <Switch
                      value={state.notificationsEnabled}
                      disabled={busy}
                      onValueChange={notifications}
                      trackColor={{
                        false: '#343C49',
                        true: plannerColors.primary,
                      }}
                    />
                  </View>
                  <View style={styles.row}>
                    <View style={styles.copy}>
                      <Text style={styles.itemTitle}>
                        Floating to-do bubble
                      </Text>
                      <Text style={styles.meta}>
                        Drag it anywhere. Tap to open your saved list.
                      </Text>
                    </View>
                    <Pressable
                      disabled={busy}
                      style={styles.secondary}
                      onPress={bubble}
                    >
                      <Text style={styles.buttonText}>
                        {state.bubbleEnabled
                          ? 'Hide'
                          : state.overlayAllowed
                          ? 'Show'
                          : 'Allow'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.meta}>
                    Background refreshes run when Android allows them. Before
                    going offline, save updates and wait for the sync time to
                    change.
                  </Text>
                </>
              )}
            </View>
            <View style={styles.row}>
              {(['tasks', 'posts', 'done'] as const).map(value => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setTab(value);
                    setVisibleCount(50);
                  }}
                  style={[styles.tab, tab === value && styles.activeTab]}
                >
                  <Text style={styles.buttonText}>
                    {value === 'tasks'
                      ? 'To do'
                      : value === 'posts'
                      ? 'Posts'
                      : 'Done'}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityLabel="Add a local task"
                onPress={() => {
                  setError('');
                  setAdding(true);
                }}
                style={styles.add}
              >
                <Plus size={24} color="#fff" />
              </Pressable>
            </View>
            {items.length ? (
              items.slice(0, visibleCount).map(itemRow)
            ) : (
              <Text style={styles.empty}>
                {tab === 'done'
                  ? 'Completed tasks appear here.'
                  : tab === 'posts'
                  ? 'Synced announcements and channel posts appear here.'
                  : 'No pending tasks. Add your own or connect your school account.'}
              </Text>
            )}
            {items.length > visibleCount && (
              <Pressable
                style={styles.secondary}
                onPress={() => setVisibleCount(count => count + 50)}
              >
                <Text style={styles.buttonText}>Show more items</Text>
              </Pressable>
            )}
            <Text style={styles.meta}>
              Checklist completion is saved locally. Submit schoolwork through
              your school app.
            </Text>
          </>
        )}
        {!!error && !adding && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <Modal
        transparent
        visible={adding}
        animationType="fade"
        onRequestClose={() => setAdding(false)}
      >
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <View style={styles.row}>
              <Text style={[styles.heading, styles.copy]}>Add a task</Text>
              <Pressable
                accessibilityLabel="Close"
                onPress={() => setAdding(false)}
              >
                <X color="#fff" size={22} />
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              placeholder="What do you need to do?"
              placeholderTextColor={plannerColors.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={300}
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Due date: YYYY-MM-DD (optional)"
              placeholderTextColor={plannerColors.muted}
              value={due}
              onChangeText={setDue}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={styles.primary}
              disabled={busy || !title.trim()}
              onPress={add}
            >
              <Text style={styles.buttonText}>
                {busy ? 'Saving…' : 'Save task'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: plannerColors.background },
  content: { padding: 16, gap: 20, paddingBottom: 32 },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: plannerColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: plannerColors.border,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  copy: { flex: 1 },
  heading: {
    color: plannerColors.text,
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: { color: plannerColors.muted, fontSize: 11, marginLeft: 'auto' },
  body: { color: '#CCD2DC', fontSize: 13, lineHeight: 20 },
  meta: { color: plannerColors.muted, fontSize: 12, lineHeight: 18 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: plannerColors.primary,
    padding: 12,
    borderRadius: 8,
  },
  secondary: { backgroundColor: '#28303D', padding: 10, borderRadius: 8 },
  buttonText: { color: plannerColors.text, fontSize: 13, fontWeight: '600' },
  link: { color: plannerColors.accent, fontSize: 12, paddingVertical: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#232B37',
  },
  activeTab: { backgroundColor: '#30415E' },
  add: {
    marginLeft: 'auto',
    padding: 8,
    borderRadius: 8,
    backgroundColor: plannerColors.primary,
  },
  item: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: plannerColors.border,
  },
  check: { paddingVertical: 8 },
  course: { color: plannerColors.muted, fontSize: 11, marginBottom: 4 },
  itemTitle: {
    color: plannerColors.text,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 21,
  },
  done: { textDecorationLine: 'line-through', color: plannerColors.muted },
  overdue: { color: '#FFBBA3' },
  error: { color: '#FFBBA3', fontSize: 12, lineHeight: 18 },
  empty: {
    color: plannerColors.muted,
    paddingVertical: 24,
    textAlign: 'center',
    lineHeight: 21,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: plannerColors.surface,
    padding: 20,
    borderRadius: 14,
    gap: 14,
  },
  input: {
    backgroundColor: plannerColors.background,
    color: plannerColors.text,
    padding: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: plannerColors.border,
    fontSize: 14,
  },
});
