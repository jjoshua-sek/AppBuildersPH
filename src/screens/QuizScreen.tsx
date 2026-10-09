import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, ui } from '../app/theme';
import { ActionButton } from '../components/ActionButton';
import { getTerms, logQuizAnswer } from '../services/db/queries';
import { buildQuiz, type QuizQuestion } from '../services/quiz/quiz';
import { useDeckStore } from '../store/useDeckStore';
import type { AiBridge, TermRow } from '../types';

export type QuizScreenProps = {
  bridge: AiBridge;
  docId: string;
  onBack(): void;
};

/** Multiple-choice quiz from the deck; wrong options are the closest other terms. */
export function QuizScreen({ bridge, docId, onBack }: QuizScreenProps) {
  const deck = useDeckStore(s => s.decks.find(d => d.id === docId));
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [missed, setMissed] = useState<TermRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setQuestions(null);
    setI(0);
    setPicked(null);
    setMissed([]);
    setError(null);
    try {
      setQuestions(await buildQuiz(bridge, await getTerms(docId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bridge, docId]);

  useEffect(() => {
    start();
  }, [start]);

  const q = questions?.[i];
  const finished = !!questions && questions.length > 0 && i >= questions.length;

  const choose = (k: number) => {
    if (!q || picked !== null) return;
    setPicked(k);
    const correct = k === q.answerIndex;
    if (!correct) setMissed(m => [...m, q.term]);
    logQuizAnswer({ term_id: q.term.id, correct, ts: Date.now() }).catch(
      () => {}, // a lost log only weakens the Daily Term pick
    );
  };

  const next = () => {
    setPicked(null);
    setI(n => n + 1);
  };

  const body = () => {
    if (error) {
      return (
        <Text style={[ui.text, ui.danger]} testID="error">
          {error}
        </Text>
      );
    }
    if (!questions) {
      return (
        <View style={[ui.card, styles.row]} testID="loading">
          <ActivityIndicator color={colors.accent} />
          <Text style={ui.text}>Preparing your quiz…</Text>
        </View>
      );
    }
    if (!questions.length) {
      return (
        <Text style={ui.muted} testID="too-few">
          This deck needs at least 2 terms for a quiz. Add a page with more
          notes.
        </Text>
      );
    }
    if (finished) {
      const score = questions.length - missed.length;
      return (
        <View style={ui.stack} testID="result">
          <View style={ui.card}>
            <Text style={ui.title} testID="score">
              {score}/{questions.length}
            </Text>
            <Text style={ui.muted}>
              {missed.length
                ? 'Missed terms come back in your Daily Term.'
                : 'Perfect score!'}
            </Text>
          </View>
          {missed.map(t => (
            <View key={t.id} style={ui.card}>
              <Text style={ui.h2}>{t.term}</Text>
              <Text style={ui.text}>{t.clue}</Text>
            </View>
          ))}
          <ActionButton testID="again" label="Play again" onPress={start} />
        </View>
      );
    }
    const answered = picked !== null;
    return (
      <View style={ui.stack}>
        <Text style={ui.muted} testID="counter">
          Question {i + 1} of {questions.length}
        </Text>
        <View style={ui.card}>
          <Text style={[ui.text, styles.clue]} testID="clue">
            {q!.term.clue}
          </Text>
        </View>
        {q!.options.map((o, k) => {
          const right = answered && k === q!.answerIndex;
          const wrong = answered && k === picked && k !== q!.answerIndex;
          return (
            <Pressable
              key={o.id}
              testID={`option-${k}`}
              onPress={() => choose(k)}
              disabled={answered}
              accessibilityRole="button"
              style={[
                styles.option,
                right && styles.right,
                wrong && styles.wrong,
              ]}
            >
              <Text style={[ui.text, styles.optionText]}>{o.term}</Text>
            </Pressable>
          );
        })}
        {answered && (
          <View style={ui.stack} testID="feedback">
            <Text
              style={[
                ui.h2,
                picked === q!.answerIndex ? styles.good : ui.danger,
              ]}
            >
              {picked === q!.answerIndex
                ? 'Correct!'
                : `It's "${q!.term.term}".`}
            </Text>
            {!!q!.term.description && (
              <Text style={ui.muted}>{q!.term.description}</Text>
            )}
            <ActionButton
              testID="next"
              label={i + 1 < questions.length ? 'Next' : 'See score'}
              onPress={next}
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, ui.top]}>
      <Text style={ui.title}>Quiz</Text>
      {deck && <Text style={ui.muted}>{deck.title}</Text>}
      {body()}
      <ActionButton testID="back" label="Back" onPress={onBack} ghost />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  clue: { fontSize: 17, lineHeight: 24 },
  option: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: 17, fontWeight: '600' },
  right: { borderColor: colors.accent, backgroundColor: '#173a27' },
  wrong: { borderColor: colors.danger, backgroundColor: '#3a1a1a' },
  good: { color: colors.accent },
});
