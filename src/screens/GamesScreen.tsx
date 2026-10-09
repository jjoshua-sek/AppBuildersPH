import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarDays, Gamepad2, Grid3x3, Network } from 'lucide-react-native';
import { brand as colors, gradients, homeActions, space } from '../app/theme';
import type { RootStackParamList } from '../app/navigation';
import { GradientTile, Header, IconBadge, Screen } from '../components/ui';
import { setCurrentDeck, useDeckStore } from '../store/useDeckStore';
import { DeckDropdown } from '../components/DeckDropdown';
import { images } from '../assets/images';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Picks a game for the current deck. */
export function GamesScreen() {
  const nav = useNavigation<Nav>();
  const decks = useDeckStore(s => s.decks);
  const currentDocId = useDeckStore(s => s.currentDocId);
  const current = decks.find(d => d.id === currentDocId) ?? decks[0];
  return (
    <Screen bg={images.bgLandscape} dim={0.18}>
      <Header
        title="Games"
        subtitle="Choose notes, then a game"
        icon={
          <IconBadge color={colors.violet} size={36}>
            <Gamepad2 color="#fff" size={20} />
          </IconBadge>
        }
      />
      <DeckDropdown selectedDocId={current?.id} onSelect={setCurrentDeck} />
      <View style={styles.body}>
        <GradientTile
          colors={homeActions.daily}
          style={[styles.tile, !current && styles.off]}
          onPress={() =>
            current
              ? nav.navigate('Wordscape', { docId: current.id })
              : nav.navigate('Ingest')
          }
        >
          <Network color={colors.cardText} size={30} />
          <View style={{ marginLeft: space.lg }}>
            <Text style={[styles.title, { color: colors.cardText }]}>
              Wordscape
            </Text>
            <Text style={[styles.sub, { color: colors.cardText }]}>
              Connect letters · solve every term
            </Text>
          </View>
        </GradientTile>
        <GradientTile
          colors={gradients.generating}
          style={[styles.tile, !current && styles.off]}
          onPress={() =>
            current && nav.navigate('Crossword', { docId: current.id })
          }
        >
          <Grid3x3 color="#fff" size={30} />
          <View style={{ marginLeft: space.lg }}>
            <Text style={styles.title}>Notes Crossword</Text>
            <Text style={styles.sub}>Clues from your own notes</Text>
          </View>
        </GradientTile>
        <GradientTile
          colors={gradients.scan}
          style={[styles.tile, !current && styles.off]}
          onPress={() =>
            current && nav.navigate('DailyTerm', { docId: current.id })
          }
        >
          <CalendarDays color="#fff" size={30} />
          <View style={{ marginLeft: space.lg }}>
            <Text style={styles.title}>Daily Term</Text>
            <Text style={styles.sub}>One term a day, six guesses</Text>
          </View>
        </GradientTile>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.md },
  tile: { paddingVertical: space.xl },
  off: { opacity: 0.4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
});
