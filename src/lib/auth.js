import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import { isBlocked, recordFailure, clearFailures } from "@/lib/rate-limit";

// authorize() throws these codes: MISSING, INVALID_CREDENTIALS, ACCOUNT_INACTIVE,
// TOO_MANY_ATTEMPTS. The login form maps them via src/lib/auth-messages.js.

// Compared against when the username doesn't exist, so response time doesn't reveal it.
let dummyHash;
async function getDummyHash() {
  dummyHash ||= await bcrypt.hash("not-a-real-password", 12);
  return dummyHash;
}

function clientIp(req) {
  // Behind Nginx the LAST x-forwarded-for entry is the one Nginx added (not spoofable).
  const xff = req?.headers?.["x-forwarded-for"];
  if (!xff) return "unknown";
  const parts = String(xff).split(",");
  return parts[parts.length - 1].trim();
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Username and password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const username = String(credentials?.username ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!username || !password) throw new Error("MISSING");

        const key = `${clientIp(req)}|${username}`;
        if (isBlocked(key)) throw new Error("TOO_MANY_ATTEMPTS");

        await connectDB();
        const user = await User.findOne({ username }).select("+passwordHash");
        const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

        if (!user || !ok) {
          recordFailure(key);
          throw new Error("INVALID_CREDENTIALS");
        }
        // Checked only after the password is right, so it can't be used to probe usernames.
        if (!user.active) throw new Error("ACCOUNT_INACTIVE");

        clearFailures(key);
        return {
          id: String(user._id),
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        name: token.name,
        username: token.username,
        role: token.role,
      };
      return session;
    },
  },
};
