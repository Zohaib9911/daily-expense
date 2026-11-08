import { Schema, getModel } from "./_shared.js";

// Atomic sequence counters (e.g. "order" -> ORD-0001).
const CounterSchema = new Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

const Counter = getModel("Counter", CounterSchema);
export default Counter;

export async function nextSequence(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return doc.seq;
}
