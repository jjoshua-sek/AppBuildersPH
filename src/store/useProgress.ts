import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getProgressStats, type ProgressStats } from '../services/db/queries';
import { useDeckStore } from './useDeckStore';

const EMPTY: ProgressStats = { streak: 0, mastered: 0, total: 0, decks: [] };

/** Streak and mastery from the attempts table; refreshed on focus and when the decks change. */
export function useProgress(): ProgressStats {
  const [stats, setStats] = useState(EMPTY);
  const decks = useDeckStore(s => s.decks);
  const load = useCallback(() => {
    let live = true;
    getProgressStats()
      .then(s => live && setStats(s))
      .catch(() => {}); // database not open yet: show zeros
    return () => {
      live = false;
    };
  }, []);
  useFocusEffect(load);
  useEffect(load, [load, decks]);
  return stats;
}
