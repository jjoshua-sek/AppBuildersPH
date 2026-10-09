import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ui } from '../app/theme';
import { Button } from '../components/Button';
import { stats } from '../services/ai/llamaBridge';
import type { Route } from '../app/navigation';

/** Placeholder home. Lanes B and C add their screens to `Route` and here. */
export function HomeScreen({ go }: { go(r: Route): void }) {
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
      <Button title="Proof panel" onPress={() => go('proof')} />
      <Button title="DevBench" onPress={() => go('devbench')} />
    </ScrollView>
  );
}
