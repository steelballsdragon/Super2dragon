import { stableStringify } from '../util/text.js';

export type GuardVerdict = { action: 'continue' } | { action: 'warn'; message: string } | { action: 'stop'; reason: string };

/**
 * Detects unproductive agent behaviour: the same failing call repeated, long
 * streaks of failures, or the same call issued over and over.
 */
export class LoopGuard {
  private readonly failuresBySignature = new Map<string, number>();
  private consecutiveFailures = 0;
  private lastSignature = '';
  private sameCallStreak = 0;
  private readonly finalTexts: string[] = [];

  constructor(
    private readonly limits = { repeatFailWarn: 2, repeatFailStop: 4, consecutiveFailStop: 8, sameCallWarn: 3, sameCallStop: 6 },
  ) {}

  recordTool(name: string, args: unknown, ok: boolean): GuardVerdict {
    const sig = `${name}:${stableStringify(args)}`;
    this.sameCallStreak = sig === this.lastSignature ? this.sameCallStreak + 1 : 1;
    this.lastSignature = sig;
    if (ok) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
      this.failuresBySignature.set(sig, (this.failuresBySignature.get(sig) ?? 0) + 1);
    }
    const fails = this.failuresBySignature.get(sig) ?? 0;
    if (!ok && fails >= this.limits.repeatFailStop) {
      return { action: 'stop', reason: `The same ${name} call failed ${fails} times in a row without a change of approach.` };
    }
    if (this.consecutiveFailures >= this.limits.consecutiveFailStop) {
      return { action: 'stop', reason: `${this.consecutiveFailures} tool calls failed in a row.` };
    }
    if (this.sameCallStreak >= this.limits.sameCallStop) {
      return { action: 'stop', reason: `The agent repeated the identical ${name} call ${this.sameCallStreak} times.` };
    }
    if (!ok && fails >= this.limits.repeatFailWarn) {
      return { action: 'warn', message: `This exact ${name} call has now failed ${fails} times. Do not repeat it unchanged: read the error, inspect the relevant files, and try a different approach.` };
    }
    if (this.sameCallStreak >= this.limits.sameCallWarn) {
      return { action: 'warn', message: `You have made this identical ${name} call ${this.sameCallStreak} times in a row and already have its result. Move on to the next step.` };
    }
    return { action: 'continue' };
  }

  recordFinalText(text: string): GuardVerdict {
    const t = text.trim();
    this.finalTexts.push(t);
    const same = this.finalTexts.filter((x) => x === t).length;
    if (t && same >= 3) return { action: 'stop', reason: 'The model produced the same reply three times.' };
    return { action: 'continue' };
  }
}
