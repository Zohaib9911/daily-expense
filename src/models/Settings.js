import { Schema, rupees, addAuditFields, getModel } from "./_shared.js";

// Singleton: one document with key "main". Use Settings.getSingleton().
const SettingsSchema = new Schema(
  {
    key: { type: String, default: "main", unique: true },
    receiptRequiredAbove: rupees({ default: 5000 }),
    approvalRequiredAbove: rupees({ default: 20000 }),
    shopName: { type: String, trim: true, default: "My Shop" },
    // Cash in the drawer when the shop starts using the app. Used as the opening cash of the FIRST daily closing.
    openingCashBalance: rupees({ default: 0 }),
  },
  { timestamps: true }
);
addAuditFields(SettingsSchema);

SettingsSchema.statics.getSingleton = async function () {
  return this.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
};

export default getModel("Settings", SettingsSchema);
