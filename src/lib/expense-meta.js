import {
  Banknote,
  Wallet,
  Utensils,
  Package,
  Truck,
  Zap,
  House,
  Wrench,
  Megaphone,
  Shapes,
} from "lucide-react";

// Label + icon for each expense category (client- and server-safe).
export const CATEGORY_META = {
  salary: { label: "Salary", icon: Banknote },
  staff_advance: { label: "Staff Advance", icon: Wallet },
  food: { label: "Food", icon: Utensils },
  raw_material: { label: "Raw Material", icon: Package },
  transport: { label: "Transport", icon: Truck },
  utilities: { label: "Utilities", icon: Zap },
  rent: { label: "Rent", icon: House },
  tools_repair: { label: "Tools & Repair", icon: Wrench },
  marketing: { label: "Marketing", icon: Megaphone },
  misc: { label: "Misc", icon: Shapes },
};
