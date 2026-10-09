import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ui } from '../app/theme';
import { Button } from '../components/Button';
import { stats } from '../services/ai/llamaBridge';
import type { Route } from '../app/navigation';
import { useDeckStore } from '../store/useDeckStore';

/** Placeholder home. Lanes B and C add their screens to `Route` and here. */
export function HomeScreen({ go }: { go(r: Route): void }) {
  const decks = useDeckStore(s => s.decks);
  const currentDocId = useDeckStore(s => s.currentDocId);
  const dbError = useDeckStore(s => s.dbError);
  const current = decks.find(d => d.id === currentDocId);
  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, ui.top]}>
      <Pressable onLongPress={() => go('proof')} accessibilityHint="Long-press to open the Proof panel">
        <Text style={ui.title}>🎒 Backpack Tutor</Text>
      </Pressable>
      <View style={ui.card}>
        <Text style={ui.text}>Models loaded on this phone.</Text>
        <Text style={ui.muted}>
          {stats.modelName} · {stats.gpu ? 'GPU' : `CPU, ${stats.nThreads} threads`}
        </Text>
      </View>
      <View style={ui.card} testID="deck">
        {dbError ? (
          <Text style={[ui.text, ui.danger]}>
            Notes database error: {dbError}
          </Text>
        ) : current ? (
          <>
            <Text style={ui.text}>{current.title}</Text>
            <Text style={ui.muted}>
              {current.terms} terms in your puzzle · {decks.length} deck
              {decks.length === 1 ? '' : 's'} saved
            </Text>
          </>
        ) : (
          <Text style={ui.muted}>
            {decks.length
              ? `${decks.length} deck${decks.length === 1 ? '' : 's'} saved.`
              : 'No notes yet. Add a handout to start.'}
          </Text>
        )}
      </View>
      <Button title="📸 Add notes" onPress={() => go('ingest')} />
      <Button
        title="🔎 Ask my notes"
        onPress={() => go('ask')}
        disabled={!decks.length}
      />
      <Button title="Proof panel" onPress={() => go('proof')} />
      <Button title="DevBench" onPress={() => go('devbench')} />
    </ScrollView>
  );
}
