import type { AiBridge, CompleteOptions } from '../../../types';
import { createMockBridge } from '../../ai/mockBridge';
import { answerFromNotes, answerSystem, support } from '../answer';
import type { NoteHit } from '../retrieve';

const hit = (n: number, text: string): NoteHit => ({
  chunkId: `d:${n}`,
  docId: 'd',
  idx: n,
  text,
  snippet: text.split('. ')[0] + '.',
  score: 1 - n / 10,
  keyword: false,
});

const HITS = [
  hit(
    0,
    'Independence is the first rule of the profession. An auditor must be free from relationships that could bias their judgment.',
  ),
  hit(
    1,
    'COBIT is a framework for the governance and management of enterprise IT. It gives auditors a common language.',
  ),
  hit(
    2,
    'Sampling tests a selected subset of items and projects the results to the whole population.',
  ),
];

/** Replies with the scripted outputs in order, streaming them word by word. */
function scripted(replies: string[]): AiBridge & { calls: CompleteOptions[] } {
  const mock = createMockBridge();
  const calls: CompleteOptions[] = [];
  return {
    ...mock,
    calls,
    async complete(o) {
      calls.push(o);
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      for (const tok of r.match(/\S+\s*/g) ?? []) o.onToken?.(tok);
      return r;
    },
  };
}

describe('answerFromNotes', () => {
  it('returns a grounded answer, without the citation marks, with the cited passage', async () => {
    const b = scripted([
      'An auditor must be free from relationships that could bias their judgment [1].',
    ]);
    const shown: string[] = [];
    const a = await answerFromNotes(
      b,
      'Why must auditors be independent?',
      HITS,
      { onText: t => shown.push(t) },
    );
    expect(a).toMatchObject({
      kind: 'answer',
      text: 'An auditor must be free from relationships that could bias their judgment.',
    });
    expect(a.sources.map(s => s.chunkId)).toEqual(['d:0']);
    expect(shown.at(-1)).toBe(a.text);
    expect(shown.every(s => !s.includes('['))).toBe(true);
  });

  it('cites the passage the model names', async () => {
    const a = await answerFromNotes(
      scripted([
        'COBIT is a framework for the governance and management of enterprise IT [2].',
      ]),
      'What is COBIT?',
      HITS,
    );
    expect(a.sources.map(s => s.chunkId)).toEqual(['d:1']);
  });

  it('falls back to the top passage when the model cites nothing or a passage it was not given', async () => {
    const a = await answerFromNotes(
      scripted([
        'COBIT is a framework for the governance of enterprise IT [7].',
      ]),
      'What is COBIT?',
      HITS,
    );
    expect(a.kind).toBe('answer');
    expect(a.sources.map(s => s.chunkId)).toEqual(['d:0']);
  });

  it('sends only the top two passages, at high priority', async () => {
    const b = scripted([
      'Auditors must stay independent from relationships [1].',
    ]);
    await answerFromNotes(b, 'q', HITS);
    expect(b.calls[0].priority).toBe('high');
    const sys = b.calls[0].messages[0].content;
    expect(sys).toBe(answerSystem([HITS[0].text, HITS[1].text]));
    expect(sys).not.toContain('Sampling');
  });

  it('retries an answer built on outside knowledge, then shows the passage', async () => {
    const b = scripted([
      'Under the Sarbanes-Oxley Act, external firms rotate partners every five years.',
      'Regulators like the PCAOB enforce rotation rules for public companies.',
    ]);
    const shown: string[] = [];
    const a = await answerFromNotes(b, 'Why independence?', HITS, {
      onText: t => shown.push(t),
    });
    expect(b.calls).toHaveLength(2);
    expect(b.calls[1].temperature).toBeLessThan(b.calls[0].temperature!);
    expect(a).toMatchObject({
      kind: 'fallback',
      text: `Your notes say: "${HITS[0].snippet}"`,
    });
    expect(shown).toContain(''); // the ungrounded stream was cleared
  });

  it('accepts a grounded retry', async () => {
    const a = await answerFromNotes(
      scripted([
        'Banks always use quarterly external audits.',
        'Sampling tests a selected subset of items [3].',
      ]),
      'What is sampling?',
      HITS.slice(2).concat(HITS),
    );
    expect(a.kind).toBe('answer');
  });

  it('says so when the notes do not cover the question, without streaming the marker', async () => {
    const shown: string[] = [];
    const a = await answerFromNotes(
      scripted(['NOT_IN_NOTES']),
      'Who won the 1998 World Cup?',
      HITS,
      {
        onText: t => shown.push(t),
      },
    );
    expect(a.kind).toBe('not-in-notes');
    expect(a.sources.map(s => s.chunkId)).toEqual(['d:0']);
    expect(shown.some(s => s.includes('NOT_IN'))).toBe(false);
  });

  it('needs no model call when there are no passages', async () => {
    const b = scripted(['x']);
    const a = await answerFromNotes(b, 'q', []);
    expect(a).toMatchObject({ kind: 'not-in-notes', sources: [] });
    expect(b.calls).toHaveLength(0);
  });

  it('lets a model error through, so the screen can show it', async () => {
    const b = scripted([]);
    b.complete = async () => {
      throw new Error('LLM not loaded');
    };
    await expect(answerFromNotes(b, 'q', HITS)).rejects.toThrow(
      'LLM not loaded',
    );
  });
});

describe('support', () => {
  it('scores the share of content words found in the notes', () => {
    const notes = [HITS[0].text];
    expect(
      support('Auditors must be free from relationships [1].', notes),
    ).toBe(1);
    expect(
      support('Sarbanes-Oxley requires partner rotation.', notes),
    ).toBeLessThan(0.6);
    expect(support('Yes.', notes)).toBe(1); // nothing to check
  });
});
