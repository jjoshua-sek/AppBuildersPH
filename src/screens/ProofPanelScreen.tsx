import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ui } from '../app/theme';
import { Button } from '../components/Button';
import { stats } from '../services/ai/llamaBridge';
import { net } from '../services/net/netCounter';

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <View style={ui.row}>
      <Text style={ui.muted}>{k}</Text>
      <Text style={[ui.text, strong && ui.strong]}>{v}</Text>
    </View>
  );
}

/** Live proof that the AI runs on this phone. Opened by long-pressing the logo. */
export function ProofPanelScreen({ onBack }: { onBack(): void }) {
  const [, tick] = useState(0);
  const [netType, setNetType] = useState('…');

  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 1000);
    const unsub = NetInfo.addEventListener(s => setNetType(s.type));
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  const backend = stats.gpu
    ? `GPU (${stats.devices.join(', ') || 'Metal'})`
    : `CPU · ${stats.nThreads} threads`;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.title}>Proof panel</Text>

      <View style={ui.card}>
        <Row k="Device" v={stats.device} />
        <Row k="Tier" v={stats.tier} />
        <Row k="Backend" v={backend} strong />
        {!stats.gpu && !!stats.reasonNoGPU && <Text style={ui.muted}>{stats.reasonNoGPU}</Text>}
      </View>

      <View style={ui.card}>
        <Row k="Model" v={stats.modelName || '—'} />
        <Row k="Size" v={`${stats.modelSizeMb} MB · Q4_0`} />
        <Row k="Load time" v={`${(stats.loadMs / 1000).toFixed(1)} s`} />
        <Row k="Last first token" v={`${stats.lastTtftMs} ms`} />
        <Row k="Generation" v={`${stats.lastTps.toFixed(1)} tok/s`} strong />
        <Row k="Prompt reading" v={`${stats.lastPromptTps.toFixed(0)} tok/s`} />
        <Row k="Last ingest" v={stats.lastIngestMs ? `${(stats.lastIngestMs / 1000).toFixed(0)} s` : '—'} />
        <Row k="Embeddings" v={stats.embedDims ? `${stats.embedDims}-d, on CPU` : '—'} />
      </View>

      <View style={ui.card}>
        <Row k="Network" v={netType} />
        <Row k="Cloud calls this session" v={String(net.calls)} strong />
      </View>

      <Button title="Back" onPress={onBack} />
    </ScrollView>
  );
}
