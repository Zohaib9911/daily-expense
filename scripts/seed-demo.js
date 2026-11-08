// Usage:  node scripts/seed-demo.js
//
// Fills an EMPTY database with realistic demo data in PKR so every screen has something to show:
//   5 staff, 3 suppliers, 20 orders with advances/balances (most with costs linked to the order, one loss-maker), 60 days of expenses and payments,
//   raw-material purchases and supplier payments, staff advances, last month's salaries, attendance,
//   daily cash closings (a few with differences, two days skipped), pending / rejected approvals,
//   a few voided records, receipt photos (generated placeholders) and a matching audit trail.
//
// Safety:
//   - REFUSES to run when NODE_ENV=production.
//   - REFUSES to run when the database already has business data (orders, expenses, staff, ...).
//     Point MONGODB_URI at a fresh database, e.g. mongodb://127.0.0.1:27017/shop_portal_demo
//   - REFUSES to create accounts with a known password on a database that already has real users.
//     (Use --use-existing-users to attach the demo data to your existing admin/manager instead; no accounts are created.)
//
// Demo logins (fresh database only): demo.owner / demo.manager / demo.viewer, password DemoPass123
// (override with DEMO_PASSWORD). Everything is deterministic: running it twice on two empty databases gives the same data.
// Receipt photos go to UPLOAD_DIR (default ./uploads), the same folder the app uses.
//
// The data is written straight to MongoDB (not through the server actions), but follows the same rules:
// amounts are whole rupees, auto-created expenses carry sourceType/sourceId, order/purchase/salary totals
// are computed by the model hooks, and every record has an AuditLog entry.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { fromZonedTime } from "date-fns-tz";
import { TIMEZONE, dayKey, todayKarachi } from "../src/lib/dates.js";
import {
  User, Order, Payment, Expense, Supplier, MaterialPurchase, SupplierPayment,
  Staff, Attendance, StaffAdvance, SalaryPayment, DailyClosing, AuditLog, Settings,
} from "../src/models/index.js";

/* ------------------------------------------------------------------ guards */

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV=production. Demo data must never be written to a production database.");
  process.exit(1);
}
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file missing: fine */
  }
}
// The env file may itself set NODE_ENV=production on the server: check again after loading it.
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run: NODE_ENV=production (set in the environment file).");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Create .env.local from .env.example.");
  process.exit(1);
}
const USE_EXISTING = process.argv.includes("--use-existing-users");
const PASSWORD = process.env.DEMO_PASSWORD || "DemoPass123";

/* ------------------------------------------------------------------ helpers */

// Deterministic random numbers (same data on every run).
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261107);
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p) => rnd() < p;
const pick = (arr) => arr[int(0, arr.length - 1)];
const roundTo = (n, step) => Math.round(n / step) * step;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (n) => n.toLocaleString("en-US");

const NOW = new Date();
const TODAY = todayKarachi();
const addDays = (key, n) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dow = (key) => new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const DAYS = Array.from({ length: 60 }, (_, i) => addDays(TODAY, i - 59)); // oldest first, last = today
const monthOf = (key) => key.slice(0, 7);
const prevMonth = (m) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 2, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const daysInMonth = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

/** A moment on a Karachi day. Never in the future (today's entries are placed a little before now). */
function at(key, hour, minute = 0) {
  const d = fromZonedTime(`${key}T${pad(hour)}:${pad(minute)}:00`, TIMEZONE);
  return d > NOW ? new Date(NOW.getTime() - int(2, 90) * 60000) : d;
}
const noon = (key) => fromZonedTime(`${key}T12:00:00`, TIMEZONE); // date-only fields (attendance, delivery date, closing day)
const plus = (d, hours) => new Date(Math.min(d.getTime() + hours * 3600000, NOW.getTime()));

/* ------------------------------------------------------------- record store */

const store = new Map(); // Model -> [plain docs]
const auditRows = [];
let ownerU, managerU, viewerU;

function audit(Model, o, action, by, when, oldValue, newValue) {
  const row = {
    collectionName: Model.collection.name,
    recordId: o._id,
    action,
    oldValue: oldValue === undefined ? undefined : JSON.parse(JSON.stringify(oldValue)),
    newValue: JSON.parse(JSON.stringify(newValue === undefined ? o : newValue)),
    user: by._id,
    userName: by.name,
    ip: "demo-seed",
    timestamp: when,
  };
  if (row.oldValue === undefined) delete row.oldValue;
  auditRows.push(row);
}

/**
 * Build one record: run the model's validation hooks (computed totals, order numbers), then keep the plain object
 * with explicit createdAt/isBackdated so history looks real. `late` = entered the next day for a past date.
 */
async function make(Model, data, { by, createdAt, late = false, log = true }) {
  const doc = new Model({ ...data, createdBy: by._id, updatedBy: by._id });
  await doc.validate();
  const o = doc.toObject({ versionKey: false });
  o.createdAt = createdAt;
  o.updatedAt = createdAt;
  if (Model.schema.path("isBackdated")) o.isBackdated = Boolean(late);
  if (!store.has(Model)) store.set(Model, []);
  store.get(Model).push(o);
  if (log) audit(Model, o, "create", by, createdAt);
  return o;
}

function voidIt(Model, o, reason, by, when) {
  const before = JSON.parse(JSON.stringify(o));
  o.isVoided = true;
  o.voidReason = reason;
  o.voidedBy = by._id;
  o.voidedAt = when;
  o.updatedBy = by._id;
  o.updatedAt = when;
  audit(Model, o, "void", by, when, before, o);
}

/** When did an entry made on `key` get recorded? Late entries are made the next morning for the day itself at noon. */
function entryTimes(key, late) {
  const lateOk = late && key !== TODAY;
  return lateOk
    ? { createdAt: at(addDays(key, 1), int(9, 12), int(0, 59)), date: noon(key), late: true }
    : (() => {
        const t = at(key, int(10, 19), int(0, 59));
        return { createdAt: t, date: t, late: false };
      })();
}

/* ---------------------------------------------------------------- receipts */

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
let receiptCount = 0;

/** A placeholder "bill" image stored exactly where the app's uploader would put it. Returns the app URL. */
async function makeReceipt(shop, payee, amount, key) {
  const id = crypto.randomBytes(16).toString("hex");
  const ym = `${key.slice(0, 4)}/${key.slice(5, 7)}`;
  const dir = path.join(UPLOAD_ROOT, "receipts", ym);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, `${id}.jpg`);
  const svg = `<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="1000" fill="#ffffff"/><rect x="30" y="30" width="740" height="940" fill="none" stroke="#94a3b8" stroke-width="3" stroke-dasharray="10 8"/>
    <text x="400" y="140" font-family="Arial, sans-serif" font-size="44" font-weight="bold" text-anchor="middle" fill="#0f172a">${esc(payee)}</text>
    <text x="400" y="200" font-family="Arial, sans-serif" font-size="28" text-anchor="middle" fill="#475569">DEMO BILL - not a real document</text>
    <text x="400" y="330" font-family="Arial, sans-serif" font-size="30" text-anchor="middle" fill="#475569">${esc(key)}</text>
    <text x="400" y="470" font-family="Arial, sans-serif" font-size="78" font-weight="bold" text-anchor="middle" fill="#0f172a">Rs ${fmt(amount)}</text>
    <text x="400" y="580" font-family="Arial, sans-serif" font-size="26" text-anchor="middle" fill="#475569">Paid by ${esc(shop)}</text>
  </svg>`;
  try {
    await sharp(Buffer.from(svg)).jpeg({ quality: 72 }).toFile(full);
  } catch {
    // No SVG text support on this machine: a plain grey page still lets the receipt screens work.
    await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#e2e8f0" } }).jpeg({ quality: 72 }).toFile(full);
  }
  await sharp(full).resize({ width: 240 }).jpeg({ quality: 70 }).toFile(path.join(dir, `${id}-t.jpg`));
  receiptCount += 1;
  return `/api/files/receipts/${ym}/${id}.jpg`;
}

/* -------------------------------------------------------------------- main */

const LIMIT_RECEIPT = 5000;
const LIMIT_APPROVAL = 20000;
const OPENING_CASH = 80000; // cash in the drawer on the first day (also Settings.openingCashBalance)
const SHOP = "Khaas Furniture (Demo)";
const cashIn = {}; // key -> rupees (cash payments received, not voided)
const cashOut = {}; // key -> rupees (APPROVED cash expenses, not voided)
const addCash = (map, key, amount) => (map[key] = (map[key] || 0) + amount);
const totals = { paymentsIn: 0, expensesApproved: 0, expensesPending: 0, expensesRejected: 0 };

/**
 * One Expense. `by`: ownerU | managerU. Over the approval limit a manager's expense is owner-approved a couple of
 * hours later, unless `status` forces "pending_approval" / "rejected". `source` links an auto-created expense.
 */
async function addExpense({ category, amount, paidTo, method = "cash", note, key, by = managerU, late = false, status, receiptUrl, source, rejectReason, when, order }) {
  const t = when || entryTimes(key, late); // `when`: an auto-created expense shares the exact moment of the record that created it
  if (method === "cash" && amount > 15000) method = "bank"; // big payments go through the bank, so the cash drawer stays realistic
  const data = { category, amount, paidTo, method, note, date: t.date, receiptUrl, status: "approved" };
  if (order) data.order = order; // cost of one customer order (profit per order)
  if (source) {
    data.sourceType = source.type;
    data.sourceId = source.id;
  }
  const over = amount > LIMIT_APPROVAL;
  let approvedAt = null;
  if (status === "pending_approval") data.status = "pending_approval";
  else if (status === "rejected") data.status = "rejected";
  else if (over) {
    approvedAt = by === ownerU ? t.createdAt : plus(t.createdAt, int(1, 4));
    data.approvedBy = ownerU._id;
    data.approvedAt = approvedAt;
  }
  let rejectedAt = null;
  if (status === "rejected") {
    rejectedAt = plus(t.createdAt, int(3, 20));
    Object.assign(data, { rejectReason, rejectedBy: ownerU._id, rejectedAt });
  }
  const o = await make(Expense, data, { by, createdAt: t.createdAt, late: t.late, log: true });
  if (approvedAt && by !== ownerU) audit(Expense, o, "approve", ownerU, approvedAt, { status: "pending_approval", amount }, { status: "approved", amount, approvedBy: ownerU._id, approvedAt });
  if (rejectedAt) audit(Expense, o, "reject", ownerU, rejectedAt, { status: "pending_approval", amount }, { status: "rejected", amount, rejectReason, rejectedBy: ownerU._id, rejectedAt });

  const k = dayKey(o.date);
  if (o.status === "approved") {
    totals.expensesApproved += amount;
    if (method === "cash") addCash(cashOut, k, amount);
  } else if (o.status === "pending_approval") totals.expensesPending += amount;
  else totals.expensesRejected += amount;
  return o;
}

async function addPayment({ order, amount, method, type, key, note, by = managerU, late = false, at: when }) {
  const t = when ? { createdAt: when, date: when, late: false } : entryTimes(key, late);
  const o = await make(Payment, { order, amount, method, type, date: t.date, note }, { by, createdAt: t.createdAt, late: t.late });
  return o;
}
function countPayment(o) {
  totals.paymentsIn += o.amount;
  if (o.method === "cash") addCash(cashIn, dayKey(o.date), o.amount);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const dbName = mongoose.connection.name;
  console.log(`Target database: ${dbName} on ${mongoose.connection.host}`);

  // Refuse to touch a database that already holds business data.
  const busy = [];
  for (const M of [Order, Payment, Expense, Staff, Supplier, MaterialPurchase, SupplierPayment, StaffAdvance, SalaryPayment, Attendance, DailyClosing]) {
    const n = await M.collection.countDocuments({});
    if (n > 0) busy.push(`${M.collection.name} (${n})`);
  }
  if (busy.length) {
    console.error(`Refusing to run: this database already has data: ${busy.join(", ")}.`);
    console.error("Use a fresh database for the demo, e.g. MONGODB_URI=mongodb://127.0.0.1:27017/shop_portal_demo");
    process.exitCode = 1;
    return;
  }

  /* ----- users ----- */
  const existing = await User.find().select("+passwordHash").lean();
  const demoNames = new Set(["demo.owner", "demo.manager", "demo.viewer"]);
  const realUsers = existing.filter((u) => !demoNames.has(u.username));
  if (USE_EXISTING) {
    ownerU = existing.find((u) => u.role === "admin" && u.active !== false);
    managerU = existing.find((u) => u.role === "manager" && u.active !== false) || ownerU;
    viewerU = existing.find((u) => u.role === "viewer") || null;
    if (!ownerU) {
      console.error("--use-existing-users needs an admin user. Create one with scripts/seed-admin.js first.");
      process.exitCode = 1;
      return;
    }
    console.log(`Using existing users: owner "${ownerU.username}", manager "${managerU.username}". No accounts created.`);
  } else {
    if (realUsers.length) {
      console.error("Refusing to run: this database already has real user accounts, and the demo would add accounts with a KNOWN password.");
      console.error("Use a fresh database, or pass --use-existing-users to attach the demo data to your existing admin/manager.");
      process.exitCode = 1;
      return;
    }
    const hash = await bcrypt.hash(PASSWORD, 10);
    const mk = async (username, name, role) =>
      existing.find((u) => u.username === username) || (await User.create({ username, name, role, passwordHash: hash })).toObject();
    ownerU = await mk("demo.owner", "Demo Owner", "admin");
    managerU = await mk("demo.manager", "Demo Manager", "manager");
    viewerU = await mk("demo.viewer", "Demo Viewer", "viewer");
  }

  /* ----- settings ----- */
  await Settings.getSingleton();
  await Settings.updateOne(
    { key: "main" },
    { shopName: SHOP, receiptRequiredAbove: LIMIT_RECEIPT, approvalRequiredAbove: LIMIT_APPROVAL, openingCashBalance: OPENING_CASH, updatedBy: ownerU._id }
  );

  /* ----- staff ----- */
  const staffDefs = [
    { name: "Imran Qureshi", role: "Head carpenter", wageType: "monthly", wageAmount: 55000, join: "2024-03-01", phone: "0300-5551101" },
    { name: "Bilal Ahmed", role: "Carpenter", wageType: "monthly", wageAmount: 38000, join: "2024-09-15", phone: "0301-5551102" },
    { name: "Sajid Mehmood", role: "Polish and finishing", wageType: "daily", wageAmount: 1600, join: "2025-02-01", phone: "0302-5551103" },
    { name: "Waqas Ali", role: "Helper", wageType: "daily", wageAmount: 1100, join: "2025-08-10", phone: "0303-5551104" },
    { name: "Nadia Shaheen", role: "Sales and office", wageType: "monthly", wageAmount: 32000, join: "2025-05-01", phone: "0304-5551105" },
  ];
  const staff = [];
  for (const d of staffDefs) {
    const o = await make(
      Staff,
      { name: d.name, role: d.role, wageType: d.wageType, wageAmount: d.wageAmount, phone: d.phone, joinDate: noon(d.join), active: true },
      { by: ownerU, createdAt: at(DAYS[0], 9, 5) }
    );
    staff.push({ ...o, joinKey: d.join });
  }

  /* ----- suppliers ----- */
  const supplierDefs = [
    { name: "Rehman Timber Mart", phone: "0321-7771001", address: "Timber Market, Gate 3", openingBalance: 85000 },
    { name: "Al-Madina Hardware and Fittings", phone: "0322-7771002", address: "Main Bazaar, Shop 14", openingBalance: 0 },
    { name: "Gulshan Foam and Fabric", phone: "0323-7771003", address: "Block C, Industrial Area", openingBalance: -15000 }, // we paid in advance
  ];
  const suppliers = [];
  for (const d of supplierDefs) suppliers.push(await make(Supplier, { ...d, active: true }, { by: ownerU, createdAt: at(DAYS[0], 9, 20) }));

  /* ----- attendance (Mon-Sat; Sundays off). Also covers last month fully, for salaries. ----- */
  const curMonth = monthOf(TODAY);
  const lastMonth = prevMonth(curMonth);
  const attStart = DAYS[0] < `${lastMonth}-01` ? DAYS[0] : `${lastMonth}-01`;
  const attDays = [];
  for (let k = attStart; k <= TODAY; k = addDays(k, 1)) attDays.push(k);
  const counts = new Map(); // staffId -> month -> { present, half, absent }
  for (const s of staff) {
    const byMonth = {};
    for (const k of attDays) {
      if (dow(k) === 0 || k < s.joinKey) continue;
      const r = rnd();
      const status = r < 0.07 ? "absent" : r < 0.11 ? "half_day" : "present";
      const m = monthOf(k);
      const c = (byMonth[m] ||= { present: 0, half: 0, absent: 0 });
      if (status === "present") c.present += 1;
      else if (status === "half_day") c.half += 1;
      else c.absent += 1;
      await make(Attendance, { staff: s._id, date: noon(k), status }, { by: managerU, createdAt: at(k, 9, int(0, 40)) });
    }
    counts.set(String(s._id), byMonth);
  }

  /* ----- orders and payments ----- */
  const catalog = [
    ["Sheesham double bed (king)", 85000], ["Dressing table with mirror", 32000], ["Sofa set 5-seater", 120000],
    ["Dining table with 6 chairs", 95000], ["Wardrobe 3-door", 70000], ["Center table", 18000],
    ["Study table", 22000], ["TV console", 28000], ["Shoe rack", 9000], ["Side tables (pair)", 14000],
  ];
  const customers = ["Ahsan Raza", "Fatima Noor", "Hamza Sheikh", "Mrs. Sadia Malik", "Dr. Kamran", "Ali Traders", "Zainab Khan", "Usman Gondal", "Rabia Butt", "Tariq Mehmood", "Farhan Siddiqui", "Ayesha Iqbal", "Noman Javed", "Hina Tahir", "M. Asif", "Saira Bano", "Waseem Abbas", "Kiran Shah", "Adeel Hussain", "Mr. Bashir"];
  const methodsW = ["cash", "cash", "cash", "cash", "bank", "bank", "bank", "jazzcash", "jazzcash", "easypaisa"]; // roughly 40% of customer money arrives as cash
  const orderOffsets = [-58, -55, -52, -49, -46, -42, -39, -36, -33, -30, -27, -23, -20, -17, -14, -11, -8, -5, -3, -1];
  const orders = [];
  for (let i = 0; i < 20; i++) {
    let k = addDays(TODAY, orderOffsets[i]);
    if (dow(k) === 0) k = addDays(k, 1);
    const age = Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${k}T00:00:00Z`)) / 86400000);
    const lines = int(1, 3);
    const chosen = new Set();
    const items = [];
    while (items.length < lines) {
      const c = pick(catalog);
      if (chosen.has(c[0])) continue;
      chosen.add(c[0]);
      items.push({ name: c[0], qty: c[1] <= 22000 && chance(0.3) ? 2 : 1, rate: c[1] });
    }
    const total = items.reduce((s, it) => s + it.qty * it.rate, 0);
    const discount = chance(0.4) ? roundTo(total * (int(2, 5) / 100), 500) : 0;
    const net = total - discount;

    // status by age (one cancelled order, a few overdue ones)
    let status;
    if (i === 3) status = "cancelled";
    else if (age >= 35) status = chance(0.9) ? "delivered" : "ready";
    else if (age >= 20) status = pick(["delivered", "delivered", "ready", "ready", "in_production"]);
    else if (age >= 8) status = pick(["ready", "in_production", "in_production", "pending"]);
    else status = pick(["pending", "pending", "in_production"]);
    if (i === 10) status = "in_production"; // deliberately overdue below
    if (i === 12) status = "pending";

    let deliveryKey = addDays(k, int(12, 28));
    if (i === 10) deliveryKey = addDays(TODAY, -4);
    if (i === 12) deliveryKey = addDays(TODAY, -2);
    if (status === "delivered") deliveryKey = (() => { const d = addDays(k, int(9, 21)); return d > TODAY ? TODAY : d; })();

    const advPct = int(30, 60) / 100;
    const advance = Math.min(net, Math.max(5000, roundTo(net * advPct, 1000)));
    const orderId = new mongoose.Types.ObjectId();
    const payments = [];
    const orderAt = at(k, int(11, 17), int(0, 59));
    const late = i === 7 || i === 15;
    const orderCreated = late && k !== TODAY ? at(addDays(k, 1), 10, 15) : orderAt;
    payments.push({ type: "order_advance", amount: advance, method: pick(methodsW), key: k, at: orderCreated, note: "" });

    let remaining = net - advance;
    if (status === "delivered") {
      const part = [4, 8, 14].includes(i); // a few customers still owe a small amount
      const pay = part ? Math.max(0, remaining - roundTo(remaining * 0.1 + 2000, 500)) : remaining;
      if (pay > 0) {
        const payAt = at(deliveryKey, int(12, 18), int(0, 59));
        payments.push({ type: "order_balance", amount: pay, method: pick(methodsW), key: deliveryKey, at: payAt });
        remaining -= pay;
      }
    } else if (status === "ready" && chance(0.45) && remaining > 10000) {
      const pay = roundTo(remaining * 0.4, 1000);
      const dk = addDays(TODAY, -int(1, 4));
      payments.push({ type: "order_balance", amount: pay, method: pick(methodsW), key: dk, at: at(dk, 14, int(0, 59)) });
      remaining -= pay;
    }
    const received = payments.reduce((s, p) => s + p.amount, 0);
    const delivered = status === "delivered";

    const o = await make(
      Order,
      {
        _id: orderId,
        customerName: customers[i],
        customerPhone: `03${int(0, 4)}${int(0, 9)}-${int(1000000, 9999999)}`,
        address: pick(["DHA Phase 5", "Gulberg III", "Johar Town", "Model Town", "Bahria Town", "Satellite Town", "Cantt"]) + ", city",
        items,
        discount,
        advanceReceived: received,
        status,
        orderDate: late && k !== TODAY ? noon(k) : orderCreated,
        deliveryDate: noon(deliveryKey),
        notes: chance(0.3) ? pick(["Dark walnut polish", "Deliver after 5pm", "Customer will send measurements", "Extra drawer on the left"]) : undefined,
      },
      { by: managerU, createdAt: orderCreated, late: late && k !== TODAY }
    );
    orders.push(o);
    for (const p of payments) {
      const pr = await addPayment({ order: orderId, amount: p.amount, method: p.method, type: p.type, key: p.key, at: p.at, note: p.note });
      countPayment(pr);
    }
    // status history in the audit trail (the orders report counts deliveries from it)
    const path_ = { pending: [], in_production: ["in_production"], ready: ["in_production", "ready"], delivered: ["in_production", "ready", "delivered"], cancelled: ["cancelled"] }[status];
    let prev = "pending";
    let when = orderCreated;
    for (const st of path_) {
      when = st === "delivered" ? at(deliveryKey, int(12, 18), 30) : plus(when, int(30, 120));
      if (when < orderCreated) when = plus(orderCreated, 2);
      audit(Order, o, "update", managerU, when, { status: prev }, { status: st });
      prev = st;
    }
    void delivered;
  }

  // a voided payment: entered twice by mistake, voided next day (excluded everywhere, never in the order's received total)
  {
    const target = orders[5];
    const k = dayKey(target.orderDate);
    const dupAt = at(k, 17, 40);
    const dup = await addPayment({ order: target._id, amount: 6000, method: "cash", type: "order_balance", key: k, at: dupAt });
    voidIt(Payment, dup, "Entered twice by mistake", managerU, plus(dupAt, 20));
  }

  // other income (not tied to an order)
  for (const [off, amount, method, note] of [[-44, 12000, "cash", "Sale of wood offcuts and sawdust"], [-21, 7500, "cash", "Polish job for a neighbour's door"], [-9, 18500, "bank", "Repair of a customer's sofa frame"]]) {
    const k = addDays(TODAY, off);
    const p = await addPayment({ amount, method, type: "other_income", key: k, note });
    countPayment(p);
  }

  /* ----- costs bought for one customer order (pipes, rope, powder coating...): profit per order ----- */
  {
    const jobs = [
      ["Steel pipes", "raw_material", 0.1], ["Rope", "raw_material", 0.07], ["Powder coating", "tools_repair", 0.09],
      ["Foam and fabric", "raw_material", 0.12], ["Polish and varnish", "raw_material", 0.06], ["Hardware and fittings", "raw_material", 0.05],
    ];
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i];
      if (o.status === "cancelled" || (i % 5 === 4 && i !== 9)) continue; // every fifth order has no costs entered yet
      const n = i === 9 ? 3 : int(1, 3);
      const picked = [...jobs].sort(() => rnd() - 0.5).slice(0, n);
      const start = dayKey(o.orderDate);
      let k = start;
      for (const [what, category, frac] of picked) {
        k = addDays(k, int(1, 5));
        if (k > TODAY) k = TODAY;
        if (dow(k) === 0) k = addDays(k, 1) > TODAY ? k : addDays(k, 1);
        // order 9 is deliberately a loss-maker: its costs add up to more than the order is worth
        const amount = Math.max(1000, roundTo(o.netAmount * (i === 9 ? frac * 5 : frac), 500));
        const paidTo = pick(["Steel market", "Rope and cane shop", "Powder coat works", "Local market"]);
        await addExpense({
          category, amount, paidTo, method: pick(["cash", "bank", "jazzcash"]), note: `${what} for ${o.orderNo}`, key: k,
          order: o._id, receiptUrl: amount > LIMIT_RECEIPT ? await makeReceipt(SHOP, paidTo, amount, k) : undefined,
        });
      }
    }
  }

  /* ----- regular expenses, 60 days ----- */
  const marketing = new Map([[-50, ["Facebook and Instagram ads", 8000, "jazzcash"]], [-33, ["Flex banner printing", 12000, "bank"]], [-14, ["Facebook and Instagram ads", 6500, "jazzcash"]], [-4, ["Instagram reel shoot", 10000, "bank"]]]);
  for (let idx = 0; idx < DAYS.length; idx++) {
    const k = DAYS[idx];
    const off = idx - 59;
    const dom = Number(k.slice(8, 10));
    // Monthly bills are paid on their day even when it is a Sunday.
    if (dom === 1) {
      await addExpense({ category: "rent", amount: 120000, paidTo: "Mr. Chaudhry (landlord)", method: "bank", note: "Shop rent", key: k, by: ownerU, receiptUrl: await makeReceipt(SHOP, "Shop rent", 120000, k) });
    }
    if (dom === 8) {
      const amount = roundTo(int(36000, 48000), 100);
      await addExpense({ category: "utilities", amount, paidTo: "Electricity company", method: "bank", note: "Electricity bill", key: k, by: ownerU, receiptUrl: await makeReceipt(SHOP, "Electricity bill", amount, k) });
    }
    if (dom === 12) await addExpense({ category: "utilities", amount: 4200, paidTo: "Gas company", note: "Gas bill", key: k });
    if (dom === 5) await addExpense({ category: "utilities", amount: 3500, paidTo: "Internet provider", method: "bank", note: "Internet", key: k });
    if (dow(k) === 0) continue; // otherwise Sunday is the weekly off day
    const late = () => chance(0.05);

    if (chance(0.92)) await addExpense({ category: "food", amount: roundTo(int(600, 1800), 50), paidTo: "Tea and lunch", key: k, late: late() });
    if (chance(0.35)) await addExpense({ category: "transport", amount: roundTo(int(1000, 5000), 100), paidTo: pick(["Suzuki loader", "Rickshaw", "Loading labour"]), note: pick(["Wood delivery", "Customer delivery", "Fittings pickup"]), key: k, late: late() });
    if (chance(0.08)) {
      const amount = roundTo(int(1500, 16000), 500);
      const paidTo = pick(["Hardware shop", "Machine mechanic", "Saw blade sharpening"]);
      await addExpense({ category: "tools_repair", amount, paidTo, key: k, late: late(), receiptUrl: amount > LIMIT_RECEIPT ? await makeReceipt(SHOP, paidTo, amount, k) : undefined });
    }
    if (chance(0.06)) await addExpense({ category: "misc", amount: roundTo(int(300, 2500), 50), paidTo: "Local shop", note: pick(["Cleaning supplies", "Light bulbs and extension", "First-aid box refill"]), key: k, late: late() });
    if (chance(0.08)) await addExpense({ category: "raw_material", amount: roundTo(int(2000, 5000), 100), paidTo: "Local market", note: "Sandpaper, glue and nails (small purchase)", key: k, receiptUrl: undefined });

    if (marketing.has(off)) {
      const [paidTo, amount, method] = marketing.get(off);
      await addExpense({ category: "marketing", amount, paidTo, method, key: k, receiptUrl: amount > LIMIT_RECEIPT ? await makeReceipt(SHOP, paidTo, amount, k) : undefined });
    }
  }

  // owner-approval examples: two pending, one rejected, one voided
  {
    const k1 = addDays(TODAY, -2);
    const a1 = 28500;
    await addExpense({ category: "tools_repair", amount: a1, paidTo: "Rizwan Electric Works", method: "bank", note: "Planer machine motor rewinding", key: k1, status: "pending_approval", receiptUrl: await makeReceipt(SHOP, "Rizwan Electric Works", a1, k1) });
    const k2 = addDays(TODAY, -1);
    const a2 = 24000;
    await addExpense({ category: "marketing", amount: a2, paidTo: "Sign Art Printers", method: "bank", note: "Shop signboard and flex", key: k2, status: "pending_approval", receiptUrl: await makeReceipt(SHOP, "Sign Art Printers", a2, k2) });
    const k3 = addDays(TODAY, -7);
    const a3 = 22000;
    await addExpense({ category: "misc", amount: a3, paidTo: "Cash to a relative", note: "Family function gift", key: k3, status: "rejected", rejectReason: "Not a shop expense. Please pay this from your own pocket.", receiptUrl: await makeReceipt(SHOP, "Cash to a relative", a3, k3) });
    const k4 = addDays(TODAY, -9);
    const dupe = await addExpense({ category: "food", amount: 1200, paidTo: "Tea and lunch", key: k4 });
    // undo the totals this one added: it is voided below
    totals.expensesApproved -= 1200;
    addCash(cashOut, dayKey(dupe.date), -1200);
    voidIt(Expense, dupe, "Entered twice by mistake", ownerU, plus(dupe.createdAt, 20));
  }

  /* ----- raw material purchases and supplier payments ----- */
  const supplierItems = [
    [["Sheesham wood", "ft", 2400, [12, 36]], ["Kikar wood", "ft", 1300, [20, 55]], ["Plywood 18mm", "sheet", 7200, [3, 8]]],
    [["Hinges (set)", "pcs", 120, [60, 200]], ["Drawer slides", "pcs", 650, [20, 60]], ["Screws", "kg", 450, [6, 20]], ["Lacquer and polish", "litre", 1500, [10, 30]]],
    [["Foam sheet", "sheet", 4800, [2, 6]], ["Fabric", "meter", 950, [15, 40]], ["Springs", "bundle", 2200, [2, 5]]],
  ];
  const purchasePlan = [[-56, 0], [-52, 1], [-47, 0], [-44, 2], [-40, 0], [-35, 1], [-30, 2], [-27, 0], [-22, 1], [-17, 0], [-12, 2], [-6, 1], [-3, 0]];
  let voidedDone = false;
  for (const [off, si] of purchasePlan) {
    let k = addDays(TODAY, off);
    if (dow(k) === 0) k = addDays(k, 1);
    const sup = suppliers[si];
    const n = int(1, si === 1 ? 3 : 2);
    const pool = [...supplierItems[si]];
    const items = [];
    for (let j = 0; j < n && pool.length; j++) {
      const [name, unit, rate, [lo, hi]] = pool.splice(int(0, pool.length - 1), 1)[0];
      items.push({ name, unit, qty: int(lo, hi), rate: roundTo(rate * (0.95 + rnd() * 0.1), 10) });
    }
    const total = items.reduce((s, it) => s + Math.round(it.qty * it.rate), 0);
    const mode = rnd();
    const paid = mode < 0.3 ? 0 : mode < 0.65 ? roundTo(total * (int(40, 70) / 100), 1000) : total;
    const method = pick(["cash", "bank", "bank"]);
    const billUrl = await makeReceipt(SHOP, sup.name, total, k);
    const t = entryTimes(k, false);
    const pur = await make(
      MaterialPurchase,
      { supplier: sup._id, items, paidAmount: paid, method, date: t.date, receiptUrl: billUrl, note: chance(0.3) ? "Delivered to the workshop" : undefined },
      { by: chance(0.8) ? managerU : ownerU, createdAt: t.createdAt }
    );
    let exp = null;
    if (paid > 0) {
      exp = await addExpense({ category: "raw_material", amount: paid, paidTo: sup.name, method, note: `Purchase from ${sup.name}`, key: k, by: managerU, receiptUrl: billUrl, source: { type: "material_purchase", id: pur._id }, when: { createdAt: pur.createdAt, date: pur.date, late: false } });
      pur.expense = exp._id;
    }
    // one purchase entered against the wrong supplier: voided together with its expense
    if (!voidedDone && off === -30 && exp) {
      voidedDone = true;
      const when = plus(pur.createdAt, 26);
      voidIt(MaterialPurchase, pur, "Wrong supplier selected, re-entered", managerU, when);
      if (exp.status === "approved") {
        totals.expensesApproved -= exp.amount;
        if (exp.method === "cash") addCash(cashOut, dayKey(exp.date), -exp.amount);
      }
      voidIt(Expense, exp, `Purchase voided: Wrong supplier selected, re-entered`, managerU, when);
    }
  }

  const supPayments = [
    [-45, 0, 40000, "bank"], [-30, 1, 25000, "cash"], [-20, 0, 60000, "bank"], [-15, 2, 12000, "jazzcash"], [-8, 1, 15000, "cash"],
    [-1, 0, 30000, "bank", "pending_approval"],
  ];
  for (const [off, si, amount, method, status] of supPayments) {
    let k = addDays(TODAY, off);
    if (dow(k) === 0) k = addDays(k, 1);
    const sup = suppliers[si];
    const t = entryTimes(k, false);
    const pay = await make(SupplierPayment, { supplier: sup._id, amount, method, date: t.date, note: "On account" }, { by: managerU, createdAt: t.createdAt });
    const exp = await addExpense({ category: "raw_material", amount, paidTo: sup.name, method, note: `Payment to ${sup.name}`, key: k, by: managerU, status, source: { type: "supplier_payment", id: pay._id }, when: { createdAt: pay.createdAt, date: pay.date, late: false } });
    pay.expense = exp._id;
  }

  /* ----- staff advances and last month's salaries ----- */
  const payKey = `${curMonth}-03` <= TODAY ? `${curMonth}-03` : TODAY;
  const advPlan = [[1, -40, 10000, "cash"], [3, -26, 5000, "cash"], [2, -20, 8000, "jazzcash"], [0, -3, 15000, "bank"], [4, -5, 6000, "cash"]].map(([si, off, amount, method]) => {
    let key = addDays(TODAY, off);
    if (dow(key) === 0) key = addDays(key, 1);
    return { si, key, amount, method, id: new mongoose.Types.ObjectId(), recovered: 0 };
  });
  const gross = (s, month) => {
    const c = counts.get(String(s._id))?.[month] || { present: 0, half: 0, absent: 0 };
    const dim = daysInMonth(month);
    const startDay = s.joinKey.slice(0, 7) === month ? Number(s.joinKey.slice(8, 10)) : 1;
    if (s.joinKey.slice(0, 7) > month) return { gross: 0, days: 0 };
    const periodDays = dim - (startDay - 1);
    if (s.wageType === "daily") return { gross: Math.round(s.wageAmount * (c.present + c.half * 0.5)), days: c.present + c.half * 0.5 };
    const days = Math.max(0, periodDays - c.absent - c.half * 0.5);
    return { gross: Math.round((s.wageAmount / dim) * days), days };
  };
  const salaryPlan = staff.map((s, si) => {
    const g = gross(s, lastMonth);
    const mine = advPlan.filter((a) => a.si === si && a.key <= payKey).sort((a, b) => (a.key < b.key ? -1 : 1));
    let left = Math.floor(g.gross * 0.5); // never deduct more than half the salary
    const allocations = [];
    for (const a of mine) {
      const take = Math.min(a.amount - a.recovered, left);
      if (take > 0) {
        allocations.push({ advance: a.id, amount: take });
        a.recovered += take;
        left -= take;
      }
    }
    const deducted = allocations.reduce((x, y) => x + y.amount, 0);
    const bonus = si === 4 ? 3000 : 0;
    return { s, si, gross: g.gross, days: g.days, allocations, deducted, bonus, net: g.gross + bonus - deducted };
  });

  for (const a of advPlan) {
    const s = staff[a.si];
    const t = entryTimes(a.key, false);
    const adv = await make(
      StaffAdvance,
      { _id: a.id, staff: s._id, amount: a.amount, method: a.method, date: t.date, note: pick(["Family medical expense", "House rent shortfall", "Wedding in the family", "Motorbike repair"]), recoveredAmount: a.recovered },
      { by: managerU, createdAt: t.createdAt }
    );
    const exp = await addExpense({ category: "staff_advance", amount: a.amount, paidTo: s.name, method: a.method, note: `Advance to ${s.name}`, key: a.key, by: managerU, source: { type: "staff_advance", id: adv._id }, when: { createdAt: adv.createdAt, date: adv.date, late: false } });
    adv.expense = exp._id;
  }
  for (const p of salaryPlan) {
    if (p.gross + p.bonus <= 0) continue;
    const t = entryTimes(payKey, false);
    const method = p.si % 2 === 0 ? "bank" : "cash";
    const sal = await make(
      SalaryPayment,
      { staff: p.s._id, month: lastMonth, grossAmount: p.gross, daysWorked: p.days, advanceDeducted: p.deducted, bonus: p.bonus, otherDeduction: 0, date: t.date, method, advanceAllocations: p.allocations },
      { by: managerU, createdAt: t.createdAt }
    );
    if (p.net > 0) {
      const exp = await addExpense({ category: "salary", amount: p.net, paidTo: p.s.name, method, note: `Salary ${lastMonth} for ${p.s.name}`, key: payKey, by: managerU, source: { type: "salary", id: sal._id }, when: { createdAt: sal.createdAt, date: sal.date, late: false } });
      sal.expense = exp._id;
    }
  }

  /* ----- daily cash closings: every day up to 3 days ago, two skipped, three with a difference ----- */
  const skip = new Set([26, 41]);
  const diffs = new Map([[12, [-500, "Tea money paid but not entered"]], [30, [200, "Customer left extra cash, adjusted later"]], [49, [-1200, "Short: small notes miscounted at closing"]]]);
  let prevCounted = OPENING_CASH;
  let carry = 0; // net cash of days that were never closed
  let closed = 0;
  for (let idx = 0; idx <= 56; idx++) {
    const k = DAYS[idx];
    const net = (cashIn[k] || 0) - (cashOut[k] || 0);
    if (skip.has(idx)) {
      carry += net;
      continue;
    }
    const opening = prevCounted + carry;
    const expected = opening + (cashIn[k] || 0) - (cashOut[k] || 0);
    const [diff, note] = diffs.get(idx) || [0, undefined];
    const counted = expected + diff;
    await make(
      DailyClosing,
      { date: noon(k), openingBalance: opening, totalIn: cashIn[k] || 0, totalOut: cashOut[k] || 0, actualCounted: counted, note, closedBy: managerU._id, isLocked: true },
      { by: managerU, createdAt: at(k, 20, int(0, 40)) }
    );
    prevCounted = counted;
    carry = 0;
    closed += 1;
  }

  /* ----- write everything ----- */
  const written = {};
  for (const [Model, docs] of store) {
    if (!docs.length) continue;
    await Model.collection.insertMany(docs);
    written[Model.collection.name] = docs.length;
  }
  await AuditLog.collection.insertMany(auditRows);
  written.auditlogs = auditRows.length;

  console.log("\nDemo data written:");
  for (const [name, n] of Object.entries(written)) console.log(`  ${name.padEnd(18)} ${n}`);
  console.log(`  receipt photos     ${receiptCount} (in ${UPLOAD_ROOT})`);
  console.log(`  cash closings      ${closed} (days ${DAYS[0]} to ${DAYS[56]}; two days skipped on purpose)`);
  console.log("\nExpected totals over the 60 days (use these to cross-check the Reports page):");
  console.log(`  Money received (payments, not voided)          Rs ${fmt(totals.paymentsIn)}`);
  console.log(`  Expenses counted (approved, not voided)        Rs ${fmt(totals.expensesApproved)}`);
  console.log(`  Awaiting approval, NOT counted                 Rs ${fmt(totals.expensesPending)}`);
  console.log(`  Rejected, NOT counted                          Rs ${fmt(totals.expensesRejected)}`);
  if (!USE_EXISTING) console.log(`\nLogins (password ${process.env.DEMO_PASSWORD ? "from DEMO_PASSWORD" : PASSWORD}): demo.owner (admin), demo.manager (manager), demo.viewer (viewer)`);
  void viewerU;
}

try {
  await main();
} catch (err) {
  console.error("Demo seeding failed:", err);
  console.error("Some data may have been written; use a fresh database and run it again.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
