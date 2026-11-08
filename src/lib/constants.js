// Plain data shared by models (plain node scripts), server code and client components.
// No imports here, so it is safe everywhere.

export const EXPENSE_CATEGORIES = [
  "salary",
  "staff_advance",
  "food",
  "raw_material",
  "transport",
  "utilities",
  "rent",
  "tools_repair",
  "marketing",
  "misc",
];

export const PAYMENT_METHODS = ["cash", "bank", "jazzcash", "easypaisa"];

export const METHOD_LABELS = {
  cash: "Cash",
  bank: "Bank",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
};

export const ORDER_STATUSES = ["pending", "in_production", "ready", "delivered", "cancelled"];

export const ORDER_STATUS_LABELS = {
  pending: "Pending",
  in_production: "In Production",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Which status an order may move to from each status (delivered is final).
export const ORDER_TRANSITIONS = {
  pending: ["in_production", "cancelled"],
  in_production: ["ready", "pending", "cancelled"],
  ready: ["delivered", "in_production", "cancelled"],
  delivered: [],
  cancelled: ["pending"],
};

export const PAYMENT_TYPES = ["order_advance", "order_balance", "other_income"];

export const PAYMENT_TYPE_LABELS = {
  order_advance: "Order advance",
  order_balance: "Order balance",
  other_income: "Other income",
};

export const MATERIAL_UNITS = ["pcs", "kg", "ft", "meter", "sheet", "litre", "bundle"];

// Expenses that were created automatically by another record. Each money-out record (advance,
// salary payment, material purchase, supplier payment) creates exactly ONE Expense, linked back
// with sourceType/sourceId. Reports must total cash out from Expense only, never also add the
// source records' own amounts.
export const EXPENSE_SOURCE_TYPES = ["staff_advance", "salary", "material_purchase", "supplier_payment"];
