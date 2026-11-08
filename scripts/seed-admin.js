// Usage: node scripts/seed-admin.js <username> <password> <name>
// Creates the first admin user. Reads MONGODB_URI from .env.local or .env.
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/User.js";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file missing: fine */
  }
}

const [username, password, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim();

if (!username || !password || !name) {
  console.error('Usage: node scripts/seed-admin.js <username> <password> <name>');
  console.error('Example: node scripts/seed-admin.js owner "StrongPass123" "Owner Name"');
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Create .env.local from .env.example.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const uname = username.trim().toLowerCase();
  if (await User.exists({ username: uname })) {
    console.error(`User "${uname}" already exists. Nothing changed.`);
    process.exitCode = 1;
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, username: uname, passwordHash, role: "admin", active: true });
    user.createdBy = user._id; // self-created bootstrap account
    await user.save();
    console.log(`Admin created: ${user.username} (${user.name}), id ${user._id}`);
  }
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
