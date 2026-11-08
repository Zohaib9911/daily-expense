"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";

/**
 * Wrap a form page's form in this. Next.js keeps pages you navigated away from (hidden, with their state), so opening
 * "New expense" a second time would show the first form's values. `bfcacheId` changes on every fresh visit (a link click or
 * router.push) but stays the same for Back/Forward, so a normal visit starts a brand-new form and Back still restores a draft.
 * `resetKey` also starts a new form when the form's starting data changes (e.g. a different ?order=).
 */
export default function FreshOnVisit({ children, resetKey = "" }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={`${bfcacheId}:${resetKey}`}>{children}</Fragment>;
}
