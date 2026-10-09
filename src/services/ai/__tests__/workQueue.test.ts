import { WorkQueue } from '../workQueue';

/** A job that finishes when `finish` is called, or when stopped. */
function controllable(log: string[], name: string) {
  let finish: () => void = () => {};
  const run = () =>
    new Promise<string>(resolve => {
      log.push(`start ${name}`);
      finish = () => resolve(name);
    });
  return { run, finish: () => finish() };
}

const tick = () => new Promise<void>(r => setTimeout(r, 0));
const logged = (log: string[], name: string) => async () => {
  log.push(name);
  return name;
};

test('runs one job at a time, highest priority first', async () => {
  const log: string[] = [];
  const q = new WorkQueue(() => {});
  const a = controllable(log, 'a');
  const pa = q.run('normal', a.run);
  const pLow = q.run('low', logged(log, 'low'));
  const pHigh = q.run('high', logged(log, 'high'));
  await tick();
  expect(log).toEqual(['start a']);
  a.finish();
  await Promise.all([pa, pLow, pHigh]);
  expect(log).toEqual(['start a', 'high', 'low']);
});

test('a high job preempts a running low job, which then re-runs in full', async () => {
  const log: string[] = [];
  let stopCalls = 0;
  let current: { finish: () => void } | null = null;
  const q = new WorkQueue(() => {
    stopCalls++;
    current?.finish(); // like stopCompletion(): the running job returns early
  });
  let lowRuns = 0;
  const pLow = q.run('low', () => {
    lowRuns++;
    const job = controllable(log, `low#${lowRuns}`);
    const p = job.run();
    current = job;
    return p;
  });
  await tick();
  const pHigh = q.run('high', logged(log, 'high'));
  expect(await pHigh).toBe('high');
  await tick();
  current!.finish();
  expect(await pLow).toBe('low#2');
  expect(stopCalls).toBe(1);
  expect(log).toEqual(['start low#1', 'high', 'start low#2']);
});

test('a rejected job does not block the queue', async () => {
  const q = new WorkQueue(() => {});
  const bad = q.run('normal', async () => {
    throw new Error('boom');
  });
  const good = q.run('normal', async () => 'ok');
  await expect(bad).rejects.toThrow('boom');
  expect(await good).toBe('ok');
});
