/**
 * Approval status for a new expense of `amount` entered by `user`.
 * Over Settings.approvalRequiredAbove: a manager's expense waits for the owner; the owner IS the
 * approver, so their own is approved at once (recorded as self-approved).
 * Returns the status fields to put on the expense.
 */
export function approvalFields(amount, user, settings) {
  const overLimit = amount > settings.approvalRequiredAbove;
  if (overLimit && user.role !== "admin") return { status: "pending_approval" };
  if (overLimit) return { status: "approved", approvedBy: user.id, approvedAt: new Date() };
  return { status: "approved" };
}
