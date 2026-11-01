export class Clock {
  time = 0; next = 0; jobs = new Map();
  now = () => this.time;
  setTimeout = (run, delay) => { const id = ++this.next; this.jobs.set(id, { run, at: this.time + delay }); return id; };
  clearTimeout = id => this.jobs.delete(id);
  advance(ms) {
    const end = this.time + ms;
    while (true) {
      const job = [...this.jobs].sort((a, b) => a[1].at - b[1].at || a[0] - b[0]).find(([, j]) => j.at <= end);
      if (!job) break;
      this.time = job[1].at; this.jobs.delete(job[0]); job[1].run();
    }
    this.time = end;
  }
}
