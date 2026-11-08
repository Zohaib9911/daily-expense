import connectDB from "@/lib/db";
import User from "@/models/User";
import { requirePageRole } from "@/lib/auth-helpers";
import UsersManager from "./UsersManager";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePageRole(["admin"]);

  await connectDB();
  const docs = await User.find().sort({ active: -1, role: 1, name: 1 }).lean();
  const users = docs.map((u) => ({
    id: String(u._id),
    name: u.name,
    username: u.username,
    role: u.role,
    phone: u.phone || "",
    active: u.active,
  }));

  return (
    <div className="space-y-4">
      <UsersManager users={users} currentUserId={me.id} />
    </div>
  );
}
