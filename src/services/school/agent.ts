import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { schoolAgentConfig } from '../../config/schoolAgent';

export type SchoolItem = {
  id: string;
  kind: 'task' | 'assignment' | 'announcement';
  title: string;
  body: string;
  course: string;
  due: number | null;
  url: string;
  done: boolean;
  remote: boolean;
  modified: string;
};
export type SchoolState = {
  provider: 'google' | 'microsoft';
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  configured: boolean;
  connected: boolean;
  account: string;
  online: boolean;
  lastSync: number;
  syncing: boolean;
  error: string;
  warning: string;
  overlayAllowed: boolean;
  bubbleEnabled: boolean;
  notificationsEnabled: boolean;
  items: SchoolItem[];
};
type AgentNative = {
  getState(): Promise<string>;
  configure(client: string, tenant: string): Promise<string>;
  configureGoogle(client: string): Promise<string>;
  setProvider(provider: 'google' | 'microsoft'): Promise<string>;
  signIn(): Promise<void>;
  disconnect(): Promise<string>;
  sync(): Promise<string>;
  addTask(title: string, due: number | null): Promise<string>;
  markDone(id: string, done: boolean): Promise<string>;
  setNotifications(enabled: boolean): Promise<string>;
  setBubble(enabled: boolean): Promise<void>;
  openBubblePermission(): Promise<void>;
  consumePlannerRequest(): Promise<boolean>;
  addListener(name: string): void;
  removeListeners(count: number): void;
};
const native = NativeModules.SchoolAgent as AgentNative | undefined;
export const schoolAgentAvailable = () => Platform.OS === 'android' && !!native;
const agentNative = () => {
  if (!native)
    throw new Error('The school assistant needs the updated Android app.');
  return native;
};
const state = (json: string): SchoolState => JSON.parse(json);
export const schoolAgent = {
  initialize: async () => {
    await agentNative().configure(
      schoolAgentConfig.microsoftClientId,
      schoolAgentConfig.microsoftTenantId,
    );
    return state(
      await agentNative().configureGoogle(
        schoolAgentConfig.googleAndroidClientId,
      ),
    );
  },
  setProvider: async (provider: 'google' | 'microsoft') =>
    state(await agentNative().setProvider(provider)),
  getState: async () => state(await agentNative().getState()),
  signIn: () => agentNative().signIn(),
  disconnect: async () => state(await agentNative().disconnect()),
  sync: async () => state(await agentNative().sync()),
  addTask: async (title: string, due: number | null) =>
    state(await agentNative().addTask(title, due)),
  markDone: async (id: string, done: boolean) =>
    state(await agentNative().markDone(id, done)),
  setNotifications: async (enabled: boolean) =>
    state(await agentNative().setNotifications(enabled)),
  setBubble: (enabled: boolean) => agentNative().setBubble(enabled),
  openBubblePermission: () => agentNative().openBubblePermission(),
  consumePlannerRequest: () => agentNative().consumePlannerRequest(),
  subscribe: (listener: () => void) => {
    if (!native) return () => {};
    const sub = new NativeEventEmitter(native).addListener(
      'SchoolAgentChanged',
      listener,
    );
    return () => sub.remove();
  },
};
