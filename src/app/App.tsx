import React, { useEffect, useState } from 'react';
import { BackHandler, StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ui } from './theme';
import type { Route } from './navigation';
import { useAiStore } from '../store/useAiStore';
import { SplashScreen } from '../screens/SplashScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProofPanelScreen } from '../screens/ProofPanelScreen';
import { DevBenchScreen } from '../screens/DevBenchScreen';
import { IngestScreen } from '../screens/IngestScreen';

export default function App() {
  const ready = useAiStore(s => s.status === 'ready');
  const [route, setRoute] = useState<Route>('home');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route === 'home') return false;
      setRoute('home');
      return true;
    });
    return () => sub.remove();
  }, [route]);

  const home = () => setRoute('home');
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={ui.screen}>
        {!ready ? (
          <SplashScreen />
        ) : route === 'proof' ? (
          <ProofPanelScreen onBack={home} />
        ) : route === 'devbench' ? (
          <DevBenchScreen onBack={home} />
        ) : route === 'ingest' ? (
          // Lane C: send Play to the crossword; useDeckStore.currentDocId is the deck.
          <IngestScreen onBack={home} onPlay={home} />
        ) : (
          <HomeScreen go={setRoute} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
