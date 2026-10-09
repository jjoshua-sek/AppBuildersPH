import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0B1430',
  card: '#16224A',
  text: '#FFFFFF',
  muted: '#AEB8DA',
  accent: '#3D7BFF',
  danger: '#ff6b6b',
  border: '#24365C',
};

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  h2: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 8 },
  text: { color: colors.text, fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  mono: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  strong: { color: colors.accent, fontWeight: '700' },
  danger: { color: colors.danger },
  top: { paddingTop: 60 },
  stack: { gap: 10 },
  track: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    marginTop: 10,
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  input: { minHeight: 120, textAlignVertical: 'top' },
});

/** Palette of the redesigned screens (Home, Decks, Crossword, Daily Term, Progress, Capture). */
export const brand = {
  bg: '#0B1430',
  bgDeep: '#070D22',
  surface: '#16224A',
  surfaceAlt: '#1E2C5C',
  border: 'rgba(255,255,255,0.12)',

  card: '#F4F6FF',
  cardAlt: '#E7ECFF',
  cardText: '#1A2148',
  cardMuted: '#5B6488',

  text: '#FFFFFF',
  textMuted: '#AEB8DA',
  textDim: '#7C87B0',

  primary: '#3D7BFF',
  primaryDark: '#2A55D9',
  violet: '#7B5CFF',
  violetDark: '#5B3FE0',
  teal: '#1FC8A6',
  tealDark: '#14A08B',
  green: '#2FC46B',
  orange: '#FF7A2F',
  amber: '#FFB020',
  red: '#FF4B55',
  pink: '#B65CFF',
};

export const gradients = {
  scan: ['#1FC8A6', '#17A98F'] as const,
  browse: ['#8A6BFF', '#6A4BF0'] as const,
  generating: ['#5B4BF0', '#3D7BFF'] as const,
  screen: ['#0E1A3D', '#0B1430'] as const,
};

/** Home action colors from the feature showcase. */
export const homeActions = {
  scan: ['#27BCC3', '#268DAA'] as const,
  daily: ['#FFD369', '#FFAE61'] as const,
  crossword: ['#BFA4FF', '#A58BF5'] as const,
  tutor: ['#D1CCFF', '#B1ABF6'] as const,
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
