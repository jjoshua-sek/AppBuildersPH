import type { Priority } from '../../types';

const RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

type Job = {
  priority: Priority;
  run: () => Promise<unknown>;
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
  preempted: boolean;
};

/**
 * Runs one model job at a time, highest priority first (FIFO within a priority).
 * A 'high' job that arrives while a 'low' job is running stops the low job; the
 * low job is re-run from scratch afterwards, so its result is always complete.
 * On a budget phone this keeps the tutor responsive while "why it matters"
 * cards are generated in the background.
 */
export class WorkQueue {
  private pending: Job[] = [];
  private running: Job | null = null;

  constructor(private stop: () => void) {}

  run<T>(priority: Priority, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.enqueue({ priority, run, resolve, reject, preempted: false });
      if (this.running && RANK[priority] === 0 && RANK[this.running.priority] === 2) {
        this.running.preempted = true;
        this.stop();
      }
      this.pump();
    });
  }

  get size() {
    return this.pending.length + (this.running ? 1 : 0);
  }

  private enqueue(job: Job, front = false) {
    const i = this.pending.findIndex(p =>
      front ? RANK[p.priority] >= RANK[job.priority] : RANK[p.priority] > RANK[job.priority],
    );
    this.pending.splice(i < 0 ? this.pending.length : i, 0, job);
  }

  private pump() {
    if (this.running || !this.pending.length) return;
    const job = this.pending.shift()!;
    this.running = job;
    job
      .run()
      .then(
        v => {
          if (job.preempted) {
            job.preempted = false;
            this.enqueue(job, true);
          } else {
            job.resolve(v);
          }
        },
        e => job.reject(e),
      )
      .finally(() => {
        this.running = null;
        this.pump();
      });
  }
}
