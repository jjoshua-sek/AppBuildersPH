import type { SchoolItem } from '../agent';
import {
  answerSchool,
  classify,
  describeDue,
  NO_TASKS,
  overdue,
  prioritize,
} from '../assistant';

// Wed 2026-10-14 10:00 local time.
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const at = (day: number, h = 17, m = 0) => new Date(2026, 9, day, h, m).getTime();

let n = 0;
const item = (p: Partial<SchoolItem>): SchoolItem => ({
  id: `i${++n}`,
  kind: 'assignment',
  title: 'Task',
  body: '',
  course: 'Math',
  due: null,
  url: '',
  done: false,
  remote: true,
  modified: '',
  ...p,
});

const ITEMS = [
  item({ title: 'Lab report', course: 'Science', due: at(12) }), // 2 days late
  item({ title: 'Essay draft', course: 'English', due: at(9) }), // 5 days late
  item({ title: 'Quiz review', due: at(14) }), // today 5 PM
  item({ title: 'Project', due: at(16) }), // in 2 days
  item({ title: 'Read chapter 4', due: at(30) }), // later
  item({ title: 'Buy index cards', kind: 'task', course: 'My tasks', remote: false }), // no date
  item({ title: 'Old homework', due: at(1), done: true }), // done: ignored
  item({ title: 'Class announcement', kind: 'announcement', due: at(2) }), // post: ignored
];

describe('classify', () => {
  it.each([
    ['what deadlines have we missed?', 'overdue'],
    ['Do I have anything overdue', 'overdue'],
    ['What should I prioritize?', 'priority'],
    ['what should I do first', 'priority'],
    ['anything due today?', 'today'],
    ['what are my upcoming deadlines', 'upcoming'],
    ['show my to-do list', 'todo'],
    ['ano ang mga lagpas na deadline', 'overdue'],
  ])('%s -> %s', (q, intent) => expect(classify(q)).toBe(intent));

  it('leaves study questions alone', () => {
    expect(classify('What is COBIT used for?')).toBeNull();
    expect(classify('Explain photosynthesis')).toBeNull();
  });
});

describe('describeDue', () => {
  it('says how late or how soon', () => {
    expect(describeDue(null, NOW)).toBe('no due date');
    expect(describeDue(at(12), NOW)).toBe('was due Oct 12 (2 days ago)');
    expect(describeDue(at(13), NOW)).toBe('was due Oct 13 (1 day ago)');
    expect(describeDue(at(14, 17), NOW)).toBe('due today 5:00 PM');
    expect(describeDue(at(14, 8), NOW)).toBe('was due today 8:00 AM');
    expect(describeDue(at(15, 9, 30), NOW)).toBe('due tomorrow 9:30 AM');
    expect(describeDue(at(20), NOW)).toBe('due Oct 20 (in 6 days)');
  });
});

describe('overdue and prioritize', () => {
  it('overdue lists only open work past its due date, oldest first', () => {
    expect(overdue(ITEMS, NOW).map(i => i.title)).toEqual(['Essay draft', 'Lab report']);
  });

  it('prioritize is overdue first, then soonest, then undated; skips done work and posts', () => {
    expect(prioritize(ITEMS).map(i => i.title)).toEqual([
      'Essay draft',
      'Lab report',
      'Quiz review',
      'Project',
      'Read chapter 4',
      'Buy index cards',
    ]);
  });

  it('does not change the list it is given', () => {
    const copy = [...ITEMS];
    prioritize(ITEMS);
    expect(ITEMS).toEqual(copy);
  });
});

describe('answerSchool', () => {
  it('lists missed deadlines with how late they are', () => {
    const a = answerSchool('What deadlines have we missed?', ITEMS, NOW)!;
    expect(a).toContain('2 overdue tasks');
    expect(a).toContain('1. Essay draft (English): was due Oct 9 (5 days ago)');
    expect(a).toContain('2. Lab report (Science): was due Oct 12 (2 days ago)');
    expect(a).not.toContain('Quiz review');
    expect(a).not.toContain('announcement');
  });

  it('says so when nothing is overdue', () => {
    const fine = ITEMS.filter(i => i.due === null || i.due > NOW);
    expect(answerSchool('anything overdue?', fine, NOW)).toContain("haven't missed any");
  });

  it('names the first thing to do and gives the order', () => {
    const a = answerSchool('What should I prioritize?', ITEMS, NOW)!;
    expect(a).toContain('Start with "Essay draft". It is already overdue');
    expect(a).toContain('3. Quiz review (Math): due today 5:00 PM');
    expect(a).toContain('...and 1 more.');
  });

  it('priority with only a future deadline calls it the next deadline', () => {
    const a = answerSchool('what to prioritize', [item({ title: 'Project', due: at(16) })], NOW)!;
    expect(a).toContain('It is the next deadline.');
  });

  it('shows what is due today, and what is still overdue', () => {
    const a = answerSchool('what is due today?', ITEMS, NOW)!;
    expect(a).toContain('Due today:\n1. Quiz review');
    expect(a).toContain('Still overdue:');
  });

  it('shows the next 7 days', () => {
    const a = answerSchool('upcoming deadlines', ITEMS, NOW)!;
    expect(a).toContain('Due in the next 7 days:');
    expect(a).toContain('Project');
    expect(a).not.toContain('Read chapter 4'); // 16 days away
  });

  it('shows the to-do list', () => {
    expect(answerSchool('show my to-do list', ITEMS, NOW)).toContain('You have 6 open tasks');
  });

  it('with no tasks it explains how to add some', () => {
    expect(answerSchool('what did I miss?', [], NOW)).toBe(NO_TASKS);
    expect(answerSchool('what did I miss?', [item({ done: true })], NOW)).toBe(NO_TASKS);
  });

  it('returns null for questions that are not about tasks', () => {
    expect(answerSchool('What is COBIT used for?', ITEMS, NOW)).toBeNull();
  });
});
