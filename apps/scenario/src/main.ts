import { readFileSync } from 'node:fs';
import { runScenario } from './runner.js';

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function main(args: readonly string[]): void {
  if (args.length !== 1 || !args[0]) {
    fail('Usage: npm run scenario -- path/to/scenario.txt');
    return;
  }
  const path = args[0];
  let input: string;
  try { input = readFileSync(path, 'utf8'); }
  catch (error) {
    fail(`Unable to read scenario ${JSON.stringify(path)}: ${message(error)}`);
    return;
  }
  try { process.stdout.write(runScenario(input).stdout); }
  catch (error) { fail(`Scenario failed: ${message(error)}`); }
}

main(process.argv.slice(2));
