import React, { useEffect } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { ui } from '../app/theme';
import { Button } from '../components/Button';
import { GEN_PATH, EMB_PATH, pickModelFile } from '../services/ai/modelFiles';
import { useAiStore } from '../store/useAiStore';
import { images } from '../assets/images';
import { Screen } from '../components/ui';

const STAGE = {
  checking: 'Checking model files…',
  llm: 'Loading the language model…',
  embedder: 'Loading the embedding model…',
  ready: 'Ready',
};

/** Loads both models once at app start. Shows how to fix a missing model. */
export function SplashScreen() {
  const { status, progress, error, load } = useAiStore();

  useEffect(() => {
    if (status === 'idle') load();
  }, [status, load]);

  const pick = async (target: 'gen' | 'emb') => {
    if (await pickModelFile(target)) load();
  };

  return (
    <Screen bg={images.bgCabinNight} dim={0.2}>
      <ScrollView contentContainerStyle={[ui.content, ui.top]}>
        <Image
          source={images.logo}
          style={{ width: 80, height: 80 }}
          resizeMode="contain"
        />
        <Text style={ui.title}>Backpack Tutor</Text>
        <Text style={ui.muted}>
          Everything runs on this phone. No internet needed.
        </Text>

        {status !== 'error' && (
          <View style={ui.card}>
            <Text style={ui.text}>{STAGE[progress?.stage ?? 'checking']}</Text>
            <View style={ui.track}>
              <View
                style={[
                  ui.fill,
                  {
                    width: `${Math.min(100, Math.max(0, progress?.pct ?? 0))}%`,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {status === 'error' && (
          <View style={[ui.card, ui.stack]}>
            <Text style={[ui.text, ui.danger]}>{error}</Text>
            <Text style={ui.muted}>Expected files:</Text>
            <Text style={ui.mono}>{GEN_PATH}</Text>
            <Text style={ui.mono}>{EMB_PATH}</Text>
            <Text style={ui.muted}>
              Android: run scripts/push-models.sh. iOS: Finder → iPhone → Files
              → BackpackTutor → models.
            </Text>
            <Button title="Retry" onPress={load} />
            <Button
              title="Choose LLM file (gen.gguf)"
              onPress={() => pick('gen')}
            />
            <Button
              title="Choose embedder file (emb.gguf)"
              onPress={() => pick('emb')}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
