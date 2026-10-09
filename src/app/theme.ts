import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0f1a14',
  card: '#17261d',
  text: '#e8f2ec',
  muted: '#9db3a6',
  accent: '#3ddc84',
  danger: '#ff6b6b',
  border: '#24382b',
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
  buttonText: { color: '#06210f', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  strong: { color: colors.accent, fontWeight: '700' },
  danger: { color: colors.danger },
  top: { paddingTop: 60 },
  stack: { gap: 10 },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, marginTop: 10 },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  input: { minHeight: 120, textAlignVertical: 'top' },
});
