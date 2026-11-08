"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Stops a form from being submitted twice.
 *  - A ref blocks a second tap in the same instant (state updates alone are too slow for that).
 *  - After a SUCCESS the form stays locked (`locked` = true) because the page is about to navigate away;
 *    re-enabling the button for the moment before the new page appears is how duplicates get created.
 *    Pass { relock: false } for forms that stay on the page (settings, close day).
 *  - After a failure (or a thrown/network error) it unlocks so the user can fix and retry.
 *
 *   const guard = useSubmitGuard();
 *   const res = await guard.run(() => createExpense(values));   // undefined => ignored (already running)
 *   <button disabled={isSubmitting || guard.locked}>
 *
 * `run` returns the action's result, or { ok: false, error } if the call threw.
 */
export function useSubmitGuard() {
  const running = useRef(false);
  const submitted = useRef(false); // a save succeeded in this form instance
  const [locked, setLocked] = useState(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async (fn, { relock = true } = {}) => {
    if (running.current) return undefined;
    running.current = true;
    setPending(true);
    let res;
    try {
      res = await fn();
    } catch {
      res = { ok: false, error: "Could not reach the server. Check your connection and try again." };
    }
    const keep = relock && res && res.ok === true;
    if (res && res.ok === true) submitted.current = true;
    if (keep) setLocked(true);
    else running.current = false;
    setPending(false);
    return res;
  }, []);

  /** Unlock again (used when a saved form is hidden, see useResetWhenHidden). */
  const release = useCallback(() => {
    running.current = false;
    submitted.current = false;
    setLocked(false);
    setPending(false);
  }, []);

  return { run, release, submitted, locked, pending, busy: locked || pending };
}

/**
 * Next.js (Cache Components) keeps a page you left HIDDEN with all its state, so coming back to "New expense" after saving
 * one showed the OLD values and a Save button stuck on "Saving...". When the form is hidden after a successful save,
 * this unlocks the button and runs `reset` (clear the fields, the chosen order, ...). Pages also wrap the form in
 * <FreshOnVisit>, which starts a brand-new form on every normal visit; this covers the browser Back button.
 */
export function useResetWhenHidden(guard, reset) {
  const latest = useRef(reset);
  useLayoutEffect(() => {
    latest.current = reset;
  });
  useLayoutEffect(() => {
    return () => {
      if (!guard.submitted.current) return; // nothing was saved: keep the user's unfinished draft
      guard.release();
      latest.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
