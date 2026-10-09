import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MessageCircle, Send } from 'lucide-react-native';
import type { TabParamList } from '../app/navigation';
import { brand, radius, space } from '../app/theme';
import { images } from '../assets/images';
import { Header, Screen } from '../components/ui';

/** Placeholder for the dedicated chat experience; clue-based tutoring remains in games. */
export function ChatTutorScreen() {
  const nav = useNavigation<BottomTabNavigationProp<TabParamList>>();
  return (
    <Screen bg={images.bgCabinNight} dim={0.15}>
      <Header
        title="AI Tutor"
        subtitle="Your offline study companion"
        icon={<MessageCircle color="#C4BCFF" size={25} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Image
          source={images.mascot}
          resizeMode="contain"
          style={styles.robot}
          accessibilityLabel="Backpack Tutor robot reading a book"
        />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Chat coming soon</Text>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.title}>A little guidance goes a long way.</Text>
          <Text style={styles.copy}>
            This is your future chat space. Your tutor will help you think
            through your notes, one question at a time.
          </Text>
        </View>
        <View style={styles.bubble}>
          <Text style={styles.copy}>
            You can already ask for Socratic hints from a clue in Notes
            Crossword or Daily Term.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => nav.navigate('Games')}
          >
            <Text style={styles.buttonText}>Open study games</Text>
          </Pressable>
        </View>
      </ScrollView>
      <View
        accessibilityLabel="Chat composer unavailable: coming soon"
        style={styles.composer}
      >
        <Text style={styles.placeholder}>
          Chat will be available here soon…
        </Text>
        <View style={styles.send}>
          <Send color="#D9D4FF" size={19} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    gap: space.md,
    flexGrow: 1,
    justifyContent: 'center',
  },
  robot: { width: '100%', height: 230, alignSelf: 'center' },
  badge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(125,100,225,0.5)',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  badgeText: { color: '#F1EEFF', fontSize: 11, fontWeight: '700' },
  bubble: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(22,34,74,0.9)',
    borderColor: brand.border,
    borderWidth: 1,
    gap: 10,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  copy: { color: '#D7DFF8', fontSize: 14, lineHeight: 21 },
  button: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#7864DB',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  composer: {
    margin: space.lg,
    marginTop: 8,
    padding: 7,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: 'rgba(22,34,74,0.95)',
  },
  placeholder: { flex: 1, color: '#A5AFCE', fontSize: 12 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4A407D',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
