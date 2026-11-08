import { notFound, redirect } from "next/navigation";
import { Hammer } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { requirePageUser } from "@/lib/auth-helpers";
import { QUICK_ACTIONS, moduleForSlug } from "@/lib/nav";

// Placeholder for every module that isn't built yet (/orders, /expenses/new, ...), so the
// menus never lead to a 404. When you build a module, add its own folder, e.g.
// src/app/(app)/orders/page.js: a more specific route wins over this catch-all.
export default async function ComingSoonPage({ params }) {
  const { slug } = await params;
  const user = await requirePageUser();

  const route = moduleForSlug(slug);
  if (!route) notFound();

  // Same visibility rules as the menus (the real pages must enforce roles themselves).
  if (route.roles && !route.roles.includes(user.role)) redirect("/");
  const path = `/${slug.join("/")}`;
  const action = QUICK_ACTIONS.find((a) => a.href === path);
  if (action && !action.roles.includes(user.role)) redirect("/");

  return (
    <EmptyState
      icon={Hammer}
      title={`${action ? action.label : route.title} is coming soon`}
      description="This part of the portal hasn't been built yet."
    />
  );
}
