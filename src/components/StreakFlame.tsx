import React from 'react';
import { Image } from 'react-native';
import { images } from '../assets/images';

// The flame illustration grows more elaborate as the streak climbs.
// Thresholds are front-loaded so the first few days already feel like progress.
function flameFor(days: number) {
  if (days >= 30) return images.flames.legendary;
  if (days >= 14) return images.flames.blazing;
  if (days >= 3) return images.flames.building;
  return images.flames.spark;
}

export function StreakFlame({ days, size = 32 }: { days: number; size?: number }) {
  return (
    <Image
      source={flameFor(days)}
      style={{ width: size, height: size, opacity: days > 0 ? 1 : 0.35 }}
      resizeMode="contain"
    />
  );
}
