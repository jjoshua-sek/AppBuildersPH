import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { open } from '@op-engineering/op-sqlite';
import { useAiStore } from '../store/useAiStore';
import { SplashScreen } from '../screens/SplashScreen';
import { stats } from '../services/ai/llamaBridge';
import { deckStore, openDecks } from '../store/useDeckStore';
import { ui } from './theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import Navigation from './navigation';

export default function App() {
  const ready = useAiStore(s => s.status === 'ready');

  // Open the decks database once, and report ingest time to the Proof panel.
  useEffect(() => {
    openDecks(open({ name: 'backpack.sqlite' }));
    return deckStore.subscribe(() => {
      stats.lastIngestMs = deckStore.getState().lastIngestMs;
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {ready ? (
        <Navigation />
      ) : (
        <SafeAreaView style={ui.screen}>
          <SplashScreen />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
