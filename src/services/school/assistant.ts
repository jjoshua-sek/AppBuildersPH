import type { SchoolItem } from './agent';

/**
 * Answers about the student's saved school tasks (Classroom assignments and
 * their own to-dos), computed from the on-device list. No model is involved, so
 * the numbers and dates are always right and it works in airplane mode.
 */

export type SchoolIntent = 'overdue' | 'priority' | 'today' | 'upcoming' | 'todo';

const DAY = 24 * 60 * 60 * 1000;

const RULES: [SchoolIntent, RegExp][] = [
  [
    'overdue',
    /\b(miss(ed|ing)?|overdue|past due|late|behind|lagpas|nalampasan|nakalimutan)\b/i,
  ],
  [
    'priority',
    /\b(priorit\w*|urgent|first|focus|start with|most important|unahin|mahalaga|should i (do|work|finish))\b/i,
  ],
  ['today', /\b(today|tonight|ngayon)\b/i],
  [
    'upcoming',
    /\b(this week|next week|upcoming|coming up|soon|deadlines?|due|kailan)\b/i,
  ],
  ['todo', /\b(to-?do|tasks?|homework|assignments?|checklist|list)\b/i],
];

/** Which school question this is, or null for anything else (a study question). */
export function classify(text: string): SchoolIntent | null {
  for (const [intent, re] of RULES) if (re.test(text)) return intent;
  return null;
}

/** Things to hand in: Classroom assignments and the student's own tasks, not posts. */
const pending = (items: SchoolItem[]) =>
  items.filter(i => i.kind !== 'announcement' && !i.done);

const byDue = (a: SchoolItem, b: SchoolItem) =>
  (a.due ?? Infinity) - (b.due ?? Infinity) || a.title.localeCompare(b.title);

export const overdue = (items: SchoolItem[], now: number) =>
  pending(items)
    .filter(i => i.due !== null && i.due < now)
    .sort(byDue);

/** Start of the local calendar day containing `t`. */
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "was due Oct 8 (2 days ago)", "due today 5:00 PM", "due Oct 12 (in 3 days)". */
export function describeDue(due: number | null, now: number): string {
  if (due === null) return 'no due date';
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (due < now) {
    if (days === 0) return `was due today ${fmtTime(due)}`;
    return `was due ${fmtDate(due)} (${-days} ${-days === 1 ? 'day' : 'days'} ago)`;
  }
  if (days === 0) return `due today ${fmtTime(due)}`;
  if (days === 1) return `due tomorrow ${fmtTime(due)}`;
  return `due ${fmtDate(due)} (in ${days} days)`;
}

/**
 * What to do first: anything overdue (oldest first), then what is due soonest,
 * and tasks with no due date last.
 */
export const prioritize = (items: SchoolItem[]) => pending(items).sort(byDue);

const line = (i: SchoolItem, n: number, now: number) =>
  `${n}. ${i.title}${i.course && i.course !== 'My tasks' ? ` (${i.course})` : ''}: ${describeDue(i.due, now)}`;

const list = (items: SchoolItem[], now: number, max = 5) => {
  const shown = items.slice(0, max).map((i, k) => line(i, k + 1, now));
  const more = items.length - max;
  return [...shown, ...(more > 0 ? [`...and ${more} more.`] : [])].join('\n');
};

export const NO_TASKS =
  'You have no saved tasks yet. Add one in the planner, or connect Google Classroom in the app to bring in your assignments.';

/**
 * The answer to a school question, or null when `text` is not one (so the
 * caller can treat it as a question about the notes instead).
 */
export function answerSchool(
  text: string,
  items: SchoolItem[],
  now: number = Date.now(),
): string | null {
  const intent = classify(text);
  if (!intent) return null;
  const open = pending(items);
  if (!open.length) return NO_TASKS;

  switch (intent) {
    case 'overdue': {
      const late = overdue(items, now);
      if (!late.length) return "Good news: you haven't missed any deadlines.";
      return `You have ${late.length} overdue ${late.length === 1 ? 'task' : 'tasks'}:\n${list(late, now)}`;
    }
    case 'today': {
      const end = startOfDay(now) + DAY;
      const due = open.filter(i => i.due !== null && i.due >= now && i.due < end).sort(byDue);
      const late = overdue(items, now);
      const parts = [
        due.length
          ? `Due today:\n${list(due, now)}`
          : 'Nothing else is due today.',
      ];
      if (late.length) parts.push(`Still overdue:\n${list(late, now, 3)}`);
      return parts.join('\n\n');
    }
    case 'upcoming': {
      const soon = open
        .filter(i => i.due !== null && i.due >= now && i.due < now + 7 * DAY)
        .sort(byDue);
      const late = overdue(items, now);
      const parts = [
        soon.length
          ? `Due in the next 7 days:\n${list(soon, now)}`
          : 'Nothing is due in the next 7 days.',
      ];
      if (late.length) parts.push(`Overdue:\n${list(late, now, 3)}`);
      return parts.join('\n\n');
    }
    case 'priority': {
      const ranked = prioritize(items);
      const top = ranked[0];
      const why =
        top.due === null
          ? 'It has no due date, so start whenever you are ready.'
          : top.due < now
            ? 'It is already overdue, so finish it first.'
            : 'It is the next deadline.';
      return `Start with "${top.title}". ${why}\n\nYour order:\n${list(ranked, now)}`;
    }
    case 'todo':
      return `You have ${open.length} open ${open.length === 1 ? 'task' : 'tasks'}:\n${list(prioritize(items), now, 6)}`;
  }
}
