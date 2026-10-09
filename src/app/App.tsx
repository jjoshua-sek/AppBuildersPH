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
import { UiCheckScreen } from '../screens/UiCheckScreen';
import { IngestScreen } from '../screens/IngestScreen';
import { AskNotesScreen } from '../screens/AskNotesScreen';
import { ReviewTermsScreen } from '../screens/ReviewTermsScreen';
import { open } from '@op-engineering/op-sqlite';
import { bridge, profile, stats } from '../services/ai/llamaBridge';
import { ocrAvailable, pickAndRead, snapAndRead } from '../services/ingest/ocr';
import {
  deckStore,
  openDecks,
  setCurrentDeck,
  useDeckStore,
} from '../store/useDeckStore';

export default function App() {
  const ready = useAiStore(s => s.status === 'ready');
  const [route, setRoute] = useState<Route>('home');
  const currentDocId = useDeckStore(s => s.currentDocId);

  // Lane B: open the decks database once, and report ingest time to the Proof panel.
  useEffect(() => {
    openDecks(open({ name: 'backpack.sqlite' }));
    return deckStore.subscribe(() => {
      stats.lastIngestMs = deckStore.getState().lastIngestMs;
    });
  }, []);

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
          <DevBenchScreen onBack={home} onUiCheck={() => setRoute('uicheck')} />
        ) : route === 'uicheck' ? (
          <UiCheckScreen onBack={() => setRoute('devbench')} />
        ) : route === 'review' && currentDocId ? (
          <ReviewTermsScreen
            docId={currentDocId}
            onBack={home}
            onPlay={home} // Lane C: go to the crossword route here once it exists
          />
        ) : route === 'ingest' || route === 'addpage' ? (
          <IngestScreen
            key={route} // a fresh screen for each mode
            appendTo={route === 'addpage' ? currentDocId ?? undefined : undefined}
            onReview={docId => {
              setCurrentDeck(docId);
              setRoute('review');
            }}
            bridge={bridge}
            profile={profile}
            onBack={home}
            onPlay={docId => {
              setCurrentDeck(docId);
              home(); // Lane C: go to the crossword route here once it exists
            }}
            snapPage={ocrAvailable() ? snapAndRead : undefined}
            pickPage={ocrAvailable() ? pickAndRead : undefined}
          />
        ) : route === 'ask' ? (
          <AskNotesScreen
            bridge={bridge}
            docId={currentDocId ?? undefined}
            onBack={home}
          />
        ) : (
          <HomeScreen go={setRoute} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
