import {
  BarChart3,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  HandCoins,
  House,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingBasket,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

// Single source of truth for navigation. Used by the sidebar, bottom nav, More menu,
// Add sheet, top-bar title and the "coming soon" placeholder page.
// `roles` limits who SEES an item (omit = everyone). Pages and actions must still
// enforce roles on the server.

const ADMIN = ["admin"];
export const WRITER_ROLES = ["admin", "manager"]; // viewers are read-only

export const ROUTES = [
  { key: "home", href: "/", label: "Home", title: "Dashboard", icon: House },
  { key: "orders", href: "/orders", label: "Orders", title: "Orders", icon: ClipboardList },
  { key: "payments", href: "/payments", label: "Cash In", title: "Cash In", icon: HandCoins },
  { key: "expenses", href: "/expenses", label: "Expenses", title: "Expenses", icon: Receipt },
  { key: "materials", href: "/materials", label: "Raw Material", title: "Raw Material", icon: Package },
  { key: "suppliers", href: "/suppliers", label: "Suppliers", title: "Suppliers", icon: Truck },
  { key: "staff", href: "/staff", label: "Staff & Salary", title: "Staff & Salary", icon: Users },
  { key: "advances", href: "/advances", label: "Staff Advances", title: "Staff Advances", icon: Wallet },
  { key: "closing", href: "/closing", label: "Daily Closing", title: "Daily Closing", icon: CalendarCheck },
  { key: "reports", href: "/reports", label: "Reports", title: "Reports", icon: BarChart3 },
  { key: "approvals", href: "/approvals", label: "Approvals", title: "Approvals", icon: CheckCircle2, roles: ADMIN },
  { key: "audit", href: "/audit-log", label: "Audit Log", title: "Audit Log", icon: ScrollText, roles: ADMIN },
  { key: "settings", href: "/settings", label: "Settings", title: "Settings", icon: Settings, roles: ADMIN },
];

// Pages that aren't menu items but still need a top-bar title.
const EXTRA_TITLES = [
  { href: "/settings/users", title: "Users" },
  { href: "/staff/new", title: "Add Staff" },
  { href: "/staff/attendance", title: "Attendance" },
  { href: "/staff/salary", title: "Pay Salary" },
  { href: "/staff/salary-sheet", title: "Salary Sheet" },
  { href: "/advances/new", title: "Give Advance" },
  { href: "/closing/history", title: "Closing History" },
  { href: "/suppliers/new", title: "Add Supplier" },
  { href: "/suppliers/pay", title: "Pay Supplier" },
  { href: "/materials/new", title: "Buy Material" },
];

// The "+" sheet. Create flows live at <module>/new.
export const QUICK_ACTIONS = [
  { label: "Add Expense", href: "/expenses/new", icon: Receipt, tone: "out" },
  { label: "Receive Payment", href: "/payments/new", icon: HandCoins, tone: "in" },
  { label: "New Order", href: "/orders/new", icon: ClipboardPlus, tone: "neutral" },
  { label: "Buy Material", href: "/materials/new", icon: ShoppingBasket, tone: "out" },
  { label: "Pay Salary", href: "/staff/salary/new", icon: Banknote, tone: "out" },
  { label: "Give Advance", href: "/advances/new", icon: Wallet, tone: "out" },
  { label: "Daily Closing", href: "/closing", icon: CalendarCheck, tone: "neutral" },
].map((a) => ({ ...a, roles: WRITER_ROLES }));

// Order of items in the phone "More" menu.
const MORE_KEYS = [
  "payments", "staff", "advances", "suppliers", "materials", "closing",
  "reports", "approvals", "audit", "settings",
];

const allowed = (item, role) => !item.roles || item.roles.includes(role);
const byKey = (key) => ROUTES.find((r) => r.key === key);

export const routesFor = (role) => ROUTES.filter((r) => allowed(r, role));
export const quickActionsFor = (role) => QUICK_ACTIONS.filter((a) => allowed(a, role));
export const moreItemsFor = (role) => MORE_KEYS.map(byKey).filter((r) => allowed(r, role));
export const canAdd = (role) => WRITER_ROLES.includes(role);

export const BOTTOM_LEFT = [byKey("home"), byKey("orders")];
export const BOTTOM_RIGHT = [byKey("expenses")];

export function isActivePath(pathname, href) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Title for the top bar: longest matching route. */
export function titleForPath(pathname) {
  const all = [...ROUTES, ...EXTRA_TITLES].filter((r) => isActivePath(pathname, r.href));
  all.sort((a, b) => b.href.length - a.href.length);
  return all[0]?.title ?? "Shop Portal";
}

/** First path segment -> module route (for the placeholder page). */
export function moduleForSlug(slug) {
  return ROUTES.find((r) => r.href !== "/" && r.href === `/${slug[0]}`);
}
