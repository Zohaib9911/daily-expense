import { cache } from "react";
import connectDB from "@/lib/db";
import Settings from "@/models/Settings";

/** Shop name from Settings, with a fallback so pages still render if the DB is unreachable. */
export const getShopName = cache(async () => {
  try {
    await connectDB();
    const s = await Settings.findOne({ key: "main" }).select("shopName").lean();
    return s?.shopName || "Khaas Furniture";
  } catch {
    return "Khaas Furniture";
  }
});
