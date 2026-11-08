import { BarChart3, Banknote, ClipboardList, PackageCheck, Receipt, ScrollText, Truck, Users } from "lucide-react";
import { buildActivityReport } from "@/lib/reports/activity";
import { buildCashBook } from "@/lib/reports/cash-book";
import { buildExpenseReport } from "@/lib/reports/expenses";
import { buildOrderProfit } from "@/lib/reports/order-profit";
import { buildOrderReport } from "@/lib/reports/orders";
import { buildProfitLoss } from "@/lib/reports/profit-loss";
import { buildStaffReport } from "@/lib/reports/staff";
import { buildSupplierReport } from "@/lib/reports/suppliers";

/** Every report: URL slug -> title, blurb, who may open it, and the function that builds it. */
export const REPORTS = {
  "profit-loss": { title: "Profit & Loss", blurb: "Sales received, expenses by category, net profit and the last 6 months.", icon: BarChart3, build: buildProfitLoss },
  expenses: { title: "Expense report", blurb: "Spending by category, then payee, with every transaction.", icon: Receipt, build: buildExpenseReport },
  "cash-book": { title: "Cash book", blurb: "Every cash in and out by date with a running balance.", icon: Banknote, build: buildCashBook },
  orders: { title: "Order report", blurb: "Orders created and delivered, value, received and balances by customer.", icon: ClipboardList, build: buildOrderReport },
  "order-profit": { title: "Order profit", blurb: "Profit or loss of each order: value minus the expenses entered for it.", icon: PackageCheck, build: buildOrderProfit },
  staff: { title: "Staff report", blurb: "Salary paid, advances given and recovered per person.", icon: Users, build: buildStaffReport },
  suppliers: { title: "Supplier report", blurb: "Purchases, payments and dues per supplier.", icon: Truck, build: buildSupplierReport },
  activity: { title: "Partner activity", blurb: "Entries, edits, voids and backdated entries per person.", icon: ScrollText, build: buildActivityReport, adminOnly: true },
};

export const reportsFor = (role) => Object.entries(REPORTS).filter(([, r]) => !r.adminOnly || role === "admin");
