import { PromiseToPay } from "./types";

/**
 * Promise-to-Pay (P2P) state machine.
 *
 * NONE -> PENDING (customer commits to a date)
 * PENDING -> REMINDER_SCHEDULED (a non-intrusive soft reminder is queued ~1 day before the promised date)
 * REMINDER_SCHEDULED -> FULFILLED (payment landed on/before promised date)
 * REMINDER_SCHEDULED -> BROKEN (promised date passed with no payment)
 */

export function createPromise(promisedDateIso: string, now: Date): PromiseToPay {
  const reminderAt = new Date(new Date(promisedDateIso).getTime() - 24 * 60 * 60 * 1000);
  return {
    status: "PENDING",
    promisedDate: promisedDateIso,
    createdAt: now.toISOString(),
    reminderAt: reminderAt.toISOString(),
  };
}

export function advancePromiseState(
  p2p: PromiseToPay,
  now: Date,
  paymentReceived: boolean
): PromiseToPay {
  if (p2p.status === "NONE" || !p2p.promisedDate) return p2p;

  if (paymentReceived) {
    return { ...p2p, status: "FULFILLED" };
  }

  const promisedDate = new Date(p2p.promisedDate);
  const reminderDate = p2p.reminderAt ? new Date(p2p.reminderAt) : promisedDate;

  if (p2p.status === "PENDING" && now >= reminderDate && now < promisedDate) {
    return { ...p2p, status: "REMINDER_SCHEDULED" };
  }

  if (now >= promisedDate) {
    return { ...p2p, status: "BROKEN", brokenReason: "Promised date elapsed without payment confirmation." };
  }

  return p2p;
}

export function isPromiseActive(p2p: PromiseToPay): boolean {
  return p2p.status === "PENDING" || p2p.status === "REMINDER_SCHEDULED";
}
