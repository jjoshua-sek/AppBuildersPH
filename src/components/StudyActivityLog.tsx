import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStudyActivity } from '../services/db/queries';
import { todayKey } from '../services/game/dailyTerm';
import { brand, radius } from '../app/theme';

const WEEKS = 12;
const GAP = 3;
const LEVELS = [
  'rgba(255,255,255,0.12)',
  '#38BDF8',
  '#2F91D3',
  '#2766AF',
  '#1E3A8A',
];

/** Liftwise's recent-week-first layout, driven by BackpackTutor's local attempts. */
export function StudyActivityLog() {
  const [log, setLog] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      getStudyActivity()
        .then(days => {
          if (live) {
            setLog(days);
            setFailed(false);
          }
        })
        .catch(() => {
          if (live) setFailed(true);
        });
      return () => {
        live = false;
      };
    }, []),
  );

  const now = new Date();
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  );
  const columns = Array.from({ length: WEEKS }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() - week * 7 + day);
      const key = todayKey(date);
      const future = key > todayKey(now);
      const count = future ? 0 : log[key] ?? 0;
      const level =
        count <= 0 ? 0 : count <= 2 ? 1 : count <= 4 ? 2 : count <= 6 ? 3 : 4;
      return { key, date, future, count, level };
    }),
  );
  const size = width ? Math.min(24, (width - (WEEKS - 1) * GAP) / WEEKS) : 0;
  const chosen = columns.flat().find(day => day.key === selected);
  const total = Object.values(log).reduce((sum, count) => sum + count, 0);

  return (
    <View testID="study-activity-log" style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>Study Log</Text>
        <Text style={styles.caption}>Last 12 weeks</Text>
      </View>
      <View
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={styles.grid}
      >
        {columns.map((column, index) => (
          <View key={index} style={styles.column}>
            {column.map(day => (
              <Pressable
                key={day.key}
                accessibilityRole="button"
                accessibilityLabel={`${day.key}: ${
                  day.future ? 'upcoming' : `${day.count} answers logged`
                }`}
                onPress={() =>
                  setSelected(selected === day.key ? null : day.key)
                }
                style={[
                  styles.cell,
                  {
                    width: size,
                    height: size,
                    backgroundColor: LEVELS[day.level],
                  },
                  day.future && styles.future,
                  selected === day.key && styles.selected,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.footer}>
        <Text style={styles.caption}>
          {total} answer{total === 1 ? '' : 's'} logged
        </Text>
        <View style={styles.legend}>
          <Text style={styles.caption}>Less</Text>
          {LEVELS.map(color => (
            <View
              key={color}
              style={[styles.legendCell, { backgroundColor: color }]}
            />
          ))}
          <Text style={styles.caption}>More</Text>
        </View>
      </View>
      {failed && (
        <Text style={styles.caption}>
          Study activity is unavailable. Reopen this screen to retry.
        </Text>
      )}
      {chosen && (
        <View style={styles.detail}>
          <Text style={styles.detailText}>
            {chosen.date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {chosen.future
              ? 'Upcoming'
              : `${chosen.count} answer${chosen.count === 1 ? '' : 's'} logged`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(10,23,53,0.8)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 13,
    gap: 10,
    marginBottom: 14,
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  caption: { color: '#BBD0EC', fontSize: 10 },
  grid: { flexDirection: 'row', justifyContent: 'center', gap: GAP },
  column: { gap: GAP },
  cell: { borderRadius: 3 },
  future: { opacity: 0.3 },
  selected: { borderColor: '#fff', borderWidth: 1.5 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legend: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  legendCell: { width: 8, height: 8, borderRadius: 2 },
  detail: { backgroundColor: brand.surfaceAlt, borderRadius: 8, padding: 9 },
  detailText: { color: '#fff', fontSize: 11 },
});
