import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Attendance from "@/models/Attendance";
import Expense from "@/models/Expense";
import SalaryPayment from "@/models/SalaryPayment";
import Settings from "@/models/Settings";
import Staff from "@/models/Staff";
import StaffAdvance from "@/models/StaffAdvance";
import { AppError } from "@/lib/auth-helpers";
import { assertDayUnlocked, createWithAudit, logAudit, voidWithAudit } from "@/lib/audit";
import { dayKey, entryDateFromKey } from "@/lib/dates";
import { approvalFields } from "@/lib/expense-status";
import { formatPKR } from "@/lib/format";
import { allocateAdvances, calcGross, monthLabel, monthRange } from "@/lib/salary";

// Server-only. Everything that moves staff money goes through here, so the advance, the salary
// payment and the Expense each one creates always agree with each other:
//   giveAdvance  -> StaffAdvance + Expense(staff_advance)
//   paySalary    -> SalaryPayment (+ advance recoveries) + Expense(salary) for the net amount
// The auto-created Expense is linked back (`sourceType`/`sourceId`), and voiding the advance or
// salary payment voids that Expense too. If a later step fails, the earlier steps are voided again.

const ObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/* ------------------------------------------------------------------ queries */

/** Unrecovered advances of one staff member, oldest first, as plain objects. */
export async function outstandingAdvances(staffId) {
  const docs = await StaffAdvance.find({ staff: staffId, isFullyRecovered: false }).sort({ date: 1, createdAt: 1 }).lean();
  return docs
    .map((a) => ({ id: String(a._id), date: a.date, amount: a.amount, recovered: a.recoveredAmount, outstanding: a.amount - a.recoveredAmount, note: a.note || "" }))
    .filter((a) => a.outstanding > 0);
}

/** Map of staffId -> total outstanding advance, for the given staff (or everyone). */
export async function outstandingByStaff(staffIds) {
  const match = staffIds ? { staff: { $in: staffIds.map(ObjectId) } } : {};
  const rows = await StaffAdvance.aggregate([
    { $match: match }, // voided advances are left out by default
    { $group: { _id: "$staff", total: { $sum: { $subtract: ["$amount", "$recoveredAmount"] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.total]));
}

/** Map of staffId -> { present, half, absent } for a month. */
export async function attendanceCounts(staffIds, month) {
  const { start, end } = monthRange(month);
  const rows = await Attendance.aggregate([
    { $match: { staff: { $in: staffIds.map(ObjectId) }, date: { $gte: start, $lt: end } } },
    { $group: { _id: { staff: "$staff", status: "$status" }, n: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    const key = String(r._id.staff);
    const c = map.get(key) ?? { present: 0, half: 0, absent: 0 };
    if (r._id.status === "present") c.present = r.n;
    else if (r._id.status === "half_day") c.half = r.n;
    else if (r._id.status === "absent") c.absent = r.n;
    map.set(key, c);
  }
  return map;
}

/** Salary figures for one staff member and month (what the Pay Salary form shows). `staff` is a lean doc. */
export async function salaryFigures(staff, month) {
  const counts = (await attendanceCounts([staff._id], month)).get(String(staff._id)) ?? { present: 0, half: 0, absent: 0 };
  const calc = calcGross({
    wageType: staff.wageType,
    wageAmount: staff.wageAmount,
    joinKey: staff.joinDate ? dayKey(staff.joinDate) : null,
    month,
    counts,
  });
  const payments = await SalaryPayment.find({ staff: staff._id, month }).sort({ date: 1 }).lean();
  const paidGross = payments.reduce((s, p) => s + p.grossAmount, 0);
  return { counts, ...calc, payments, paidCount: payments.length, paidGross, remainingGross: Math.max(0, calc.gross - paidGross) };
}

/* -------------------------------------------------------- advance recovery */

/** Re-derive an advance's recoveredAmount from the non-voided salary payments that deducted from it. */
export async function syncAdvanceRecovery(advanceId) {
  const oid = ObjectId(advanceId);
  const [row] = await SalaryPayment.aggregate([
    { $match: { "advanceAllocations.advance": oid } },
    { $unwind: "$advanceAllocations" },
    { $match: { "advanceAllocations.advance": oid } },
    { $group: { _id: null, total: { $sum: "$advanceAllocations.amount" } } },
  ]);
  const doc = await StaffAdvance.findById(oid).setOptions({ showVoided: true });
  if (!doc) throw new AppError("Advance not found", 404);
  const before = { recoveredAmount: doc.recoveredAmount, isFullyRecovered: doc.isFullyRecovered };
  doc.recoveredAmount = row?.total ?? 0; // the model's hook recomputes isFullyRecovered
  await doc.save();
  return { before, after: { recoveredAmount: doc.recoveredAmount, isFullyRecovered: doc.isFullyRecovered } };
}

async function resyncAndLog(allocations, user) {
  for (const a of allocations) {
    const r = await syncAdvanceRecovery(a.advance);
    if (r.before.recoveredAmount !== r.after.recoveredAmount) {
      await logAudit({ collectionName: StaffAdvance.collection.name, recordId: a.advance, action: "update", oldValue: r.before, newValue: r.after, user });
    }
  }
}

/* ----------------------------------------------------------------- advances */

export async function giveAdvance({ staffId, amount, method, dateKey, note = "" }, user) {
  await connectDB();
  const staff = await Staff.findById(staffId).lean();
  if (!staff) throw new AppError("Staff member not found", 404);
  if (!staff.active) throw new AppError("This staff member is not active", 409);

  const date = entryDateFromKey(dateKey);
  await assertDayUnlocked(user, date, "create"); // fail before creating anything
  const settings = await Settings.getSingleton();

  const advance = await createWithAudit(StaffAdvance, { staff: staff._id, amount, method, date, note }, user);
  try {
    const expense = await createWithAudit(
      Expense,
      {
        category: "staff_advance",
        amount,
        paidTo: staff.name,
        method,
        date,
        note: `Advance to ${staff.name}${note ? `: ${note}` : ""}`,
        sourceType: "staff_advance",
        sourceId: advance._id,
        ...approvalFields(amount, user, settings),
      },
      user
    );
    await StaffAdvance.updateOne({ _id: advance._id }, { expense: expense._id });
  } catch (err) {
    await voidWithAudit(StaffAdvance, advance.id, "Automatically voided: the linked expense could not be created", user).catch(() => {});
    throw err;
  }
  return advance;
}

export async function voidAdvance(advanceId, reason, user) {
  await connectDB();
  if (!mongoose.isValidObjectId(advanceId)) throw new AppError("Advance not found", 404);
  const adv = await StaffAdvance.findById(advanceId).setOptions({ showVoided: true }).lean();
  if (!adv) throw new AppError("Advance not found", 404);
  if (adv.recoveredAmount > 0) {
    throw new AppError(`${formatPKR(adv.recoveredAmount)} of this advance was already deducted from a salary. Void that salary payment first.`, 409);
  }
  const doc = await voidWithAudit(StaffAdvance, advanceId, reason, user);
  if (adv.expense) await voidWithAudit(Expense, adv.expense, `Advance voided: ${reason}`, user);
  return doc;
}

/* ------------------------------------------------------------------- salary */

export async function paySalary({ staffId, month, bonus = 0, otherDeduction = 0, advanceDeducted = 0, method, dateKey, override = false }, user) {
  await connectDB();
  const staff = await Staff.findById(staffId).lean();
  if (!staff) throw new AppError("Staff member not found", 404);

  const fig = await salaryFigures(staff, month);
  if (fig.notJoined) throw new AppError(`${staff.name} had not joined by ${monthLabel(month)}`, 409);

  const mayOverride = override && user.role === "admin";
  if (fig.paidCount > 0 && !mayOverride) {
    throw new AppError(
      user.role === "admin"
        ? `${staff.name} was already paid for ${monthLabel(month)}. Tick "pay again" to add another payment.`
        : `${staff.name} was already paid for ${monthLabel(month)}. Only the owner can pay a month twice.`,
      409
    );
  }

  // Gross is always worked out here from attendance, never taken from the browser. When paying a
  // month again (owner override) only the part not yet paid is added.
  const gross = fig.remainingGross;
  const outstanding = await outstandingAdvances(staff._id);
  const outstandingTotal = outstanding.reduce((s, a) => s + a.outstanding, 0);
  if (advanceDeducted > outstandingTotal) {
    throw new AppError(`Only ${formatPKR(outstandingTotal)} of advances is outstanding for ${staff.name}`, 409);
  }
  const net = gross + bonus - advanceDeducted - otherDeduction;
  if (net < 0) throw new AppError("The deductions are more than the salary. Net pay can't be negative.", 400);
  if (gross + bonus <= 0) throw new AppError(`There is nothing to pay: the salary for ${monthLabel(month)} is Rs 0`, 400);

  const date = entryDateFromKey(dateKey);
  await assertDayUnlocked(user, date, "create");
  const settings = await Settings.getSingleton();
  const { allocations } = allocateAdvances(outstanding, advanceDeducted);

  const payment = await createWithAudit(
    SalaryPayment,
    { staff: staff._id, month, grossAmount: gross, daysWorked: fig.daysWorked, advanceDeducted, bonus, otherDeduction, date, method, advanceAllocations: allocations },
    user
  );
  await resyncAndLog(allocations, user);

  if (net > 0) {
    try {
      const expense = await createWithAudit(
        Expense,
        {
          category: "salary",
          amount: net,
          paidTo: staff.name,
          method,
          date,
          note: `Salary ${monthLabel(month)} for ${staff.name}`,
          sourceType: "salary",
          sourceId: payment._id,
          ...approvalFields(net, user, settings),
        },
        user
      );
      await SalaryPayment.updateOne({ _id: payment._id }, { expense: expense._id });
    } catch (err) {
      await voidWithAudit(SalaryPayment, payment.id, "Automatically voided: the linked expense could not be created", user).catch(() => {});
      await resyncAndLog(allocations, user).catch(() => {});
      throw err;
    }
  }
  return payment;
}

export async function voidSalary(paymentId, reason, user) {
  await connectDB();
  if (!mongoose.isValidObjectId(paymentId)) throw new AppError("Salary payment not found", 404);
  const pay = await SalaryPayment.findById(paymentId).setOptions({ showVoided: true }).lean();
  if (!pay) throw new AppError("Salary payment not found", 404);

  const doc = await voidWithAudit(SalaryPayment, paymentId, reason, user);
  await resyncAndLog(pay.advanceAllocations || [], user); // gives the deducted advances back
  if (pay.expense) await voidWithAudit(Expense, pay.expense, `Salary payment voided: ${reason}`, user);
  return doc;
}
