import mongoose from "mongoose";

/**
 * Cached Mongoose connection.
 * In dev, Next.js hot reload re-evaluates modules, which would open a new
 * connection every time. Keeping the cache on `globalThis` survives reloads.
 */
let cached = globalThis._mongooseCache;
if (!cached) {
  cached = globalThis._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env.local.");
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 10000 })
      .then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null; // allow retry on next call
    throw err;
  }
  return cached.conn;
}

export default connectDB;
