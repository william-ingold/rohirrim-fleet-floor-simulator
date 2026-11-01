import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const executable = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'rohirrim scenario '));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function run(args: string[], cwd = root) {
  return spawnSync(process.execPath, [executable, ...args], { cwd, encoding: 'utf8', timeout: 10_000 });
}

function expectSuccess(result: ReturnType<typeof run>, stdout: string): void {
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toBe(stdout);
}

describe('C01/C08: executable and mandatory root invocation', () => {
  const supplied = {
    'scenario-1.txt': 'R1 1,0,EAST\nR2 2,0,EAST\nR3 3,0,EAST\n',
    'scenario-2.txt': 'R1 0,0,EAST\nR2 1,0,WEST\n',
    'scenario-3.txt': 'R1 1,1,EAST\nR2 2,1,WEST\nR3 3,1,WEST\n',
    'scenario-4.txt': 'R1 0,1,NORTH\nR2 1,1,EAST\nR3 1,0,SOUTH\nR4 0,0,WEST\n',
    'scenario-5.txt': 'R1 2,2,SOUTH\nR2 1,1,EAST\nR1 2,2,SOUTH\nR2 3,1,EAST\n',
  };
  it('covers every supplied test-scenarios file with an independently reviewed expectation', () => {
    expect(readdirSync(join(root, 'test-scenarios')).sort()).toEqual(Object.keys(supplied).sort());
  });
  it.each(Object.entries(supplied))('executes the original mixed input/output reference %s', (name, expected) => {
    // Pass the original file unchanged, including its non-directive expected-output lines.
    // These expectations were reviewed against the supplied text, not engine helpers.
    expectSuccess(run([join(root, 'test-scenarios', name)]), expected);
  });

  it.each(['chain', 'swap', 'contention', 'rotation', 'queues', 'battery', 'goto-charger'])('prints only explicit REPORT output for %s', name => {
    const result = run([`scenarios/${name}.txt`]);
    expectSuccess(result, readFileSync(join(root, `scenarios/${name}.stdout`), 'utf8'));
  });

  it('supports the required npm root command without an API or database', () => {
    const result = spawnSync('npm', ['run', 'scenario', '--', 'scenarios/chain.txt'], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, npm_config_update_notifier: 'false' } });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    // npm prints script banners; the executable's output is checked exactly above.
    expect(result.stdout.endsWith('R1 1,0,EAST\nR2 2,0,EAST\nR3 3,0,EAST\n')).toBe(true);
  });

  it.each([{ args: [] }, { args: ['scenarios/chain.txt', 'extra.txt'] }])('rejects bad invocation $args on stderr with nonzero status', ({ args }) => {
    const result = run(args);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('npm run scenario --');
    expect(result.stderr).not.toContain('    at ');
  });

  it.each(['does-not-exist.txt', '.'])('surfaces file read failure for %s instead of an empty success', path => {
    const result = run([path]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Unable to read scenario');
    expect(result.stderr).toContain(path);
    expect(result.stderr).not.toContain('    at ');
  });

  it.skipIf(process.getuid?.() === 0)('reports a permission-denied file as a runner error', () => {
    const path = join(temporary, 'unreadable.txt');
    writeFileSync(path, 'REPORT\n');
    chmodSync(path, 0o000);
    try {
      const result = run([path]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Unable to read scenario');
      expect(result.stderr).toContain('EACCES');
    } finally { chmodSync(path, 0o600); }
  });

  it('handles filenames with spaces from another cwd; bad lines recover with successful exit', () => {
    const path = join(temporary, 'input with spaces.txt');
    writeFileSync(path, 'REPORT junk\nQUEUE R99 MOVE\nPLACE R01 0,0,EAST\nQUEUE R1 MOVE INVALID LEFT\nREPORT\nQUEUE R1 LEFT');
    const result = run(['input with spaces.txt'], temporary);
    expectSuccess(result, 'R1 0,0,EAST\n');
    const again = run(['input with spaces.txt'], temporary);
    expect(again.stdout).toBe(result.stdout);
  });

  it('does not print an unsolicited report for an empty file', () => {
    const path = join(temporary, 'empty.txt');
    writeFileSync(path, '');
    const result = run([path]);
    expectSuccess(result, '');
  });
});
