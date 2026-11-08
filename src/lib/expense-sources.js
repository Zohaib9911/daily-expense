// What to tell the user about an auto-created expense, by its sourceType (client- and server-safe).
export const EXPENSE_SOURCES = {
  staff_advance: { what: "a staff advance", fix: "void that advance (Staff Advances)" },
  salary: { what: "a salary payment", fix: "void that salary payment (Staff & Salary)" },
  material_purchase: { what: "a material purchase", fix: "void that purchase (Raw Material)" },
  supplier_payment: { what: "a supplier payment", fix: "void that payment (Suppliers)" },
};
