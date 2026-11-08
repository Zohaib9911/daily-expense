"use client";

import { useActionState, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { KeyRound, Loader2, Plus, UserCheck, UserX } from "lucide-react";
import PasswordInput, { inputClass } from "@/components/PasswordInput";
import { changeRole, createUser, resetPassword, setActive } from "./actions";

const ROLES = [
  { value: "admin", label: "Admin (owner)" },
  { value: "manager", label: "Manager (partner)" },
  { value: "viewer", label: "Viewer (read-only)" },
];

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-60";
const btnPrimary = `${btn} bg-emerald-600 text-white hover:bg-emerald-700`;
const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

function Message({ state }) {
  const toast = useToast();
  useEffect(() => {
    if (!state) return;
    if (state.ok === false) toast.error(state.error);
    else if (state.message) toast.success(state.message);
  }, [state, toast]);
  if (!state) return null;
  if (state.ok === false) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </p>
    );
  }
  return <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>;
}

function Submit({ pending, children, className = btnPrimary }) {
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

function AddUser() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createUser, null);
  const v = state?.values;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${btnPrimary} w-full`}
      >
        <Plus size={18} />
        Add user
      </button>

      {(open || state) && (
        <form action={action} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="new-name">Full name</Label>
            <input id="new-name" name="name" required defaultValue={v?.name} className={inputClass} />
          </div>
          <div>
            <Label htmlFor="new-username">Username</Label>
            <input
              id="new-username"
              name="username"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              defaultValue={v?.username}
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor="new-phone">Phone (optional)</Label>
            <input
              id="new-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={v?.phone}
              className={inputClass}
            />
          </div>
          <div>
            <Label htmlFor="new-role">Role</Label>
            <select id="new-role" name="role" defaultValue={v?.role || "viewer"} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="new-password">Password (min 8 characters)</Label>
            <PasswordInput id="new-password" name="password" autoComplete="new-password" required minLength={8} />
          </div>
          <Message state={state} />
          <Submit pending={pending}>Create user</Submit>
        </form>
      )}
    </section>
  );
}

function RoleForm({ user }) {
  const [state, action, pending] = useActionState(changeRole, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={user.id} />
      <Label htmlFor={`role-${user.id}`}>Role</Label>
      <div className="flex gap-2">
        <select id={`role-${user.id}`} name="role" defaultValue={user.role} className={`${inputClass} flex-1`}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Submit pending={pending} className={btnGhost}>
          Save
        </Submit>
      </div>
      <Message state={state} />
    </form>
  );
}

function PasswordForm({ user }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetPassword, null);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${btnGhost} w-full`}>
        <KeyRound size={16} />
        Reset password
      </button>
      {(open || state) && (
        <form action={action} className="space-y-2">
          <input type="hidden" name="userId" value={user.id} />
          <Label htmlFor={`pw-${user.id}`}>New password (min 8 characters)</Label>
          <PasswordInput id={`pw-${user.id}`} name="password" autoComplete="new-password" required minLength={8} />
          <Message state={state} />
          <Submit pending={pending}>Set new password</Submit>
        </form>
      )}
    </div>
  );
}

function ActiveForm({ user }) {
  const [state, action, pending] = useActionState(setActive, null);
  const next = !user.active;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!next && !window.confirm(`Deactivate ${user.name}? They will be signed out and can't log in.`)) {
          e.preventDefault();
        }
      }}
      className="space-y-2"
    >
      <input type="hidden" name="userId" value={user.id} />
      <input type="hidden" name="active" value={String(next)} />
      <Submit
        pending={pending}
        className={`${btn} w-full ${
          next ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-red-300 bg-white text-red-600 hover:bg-red-50"
        }`}
      >
        {next ? <UserCheck size={16} /> : <UserX size={16} />}
        {next ? "Reactivate user" : "Deactivate user"}
      </Submit>
      <Message state={state} />
    </form>
  );
}

function UserCard({ user, isSelf }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-2xl bg-white p-4 shadow-sm ${user.active ? "" : "opacity-75"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-slate-900">
            {user.name}
            {isSelf && <span className="ml-2 text-xs font-normal text-slate-500">(you)</span>}
          </span>
          <span className="block truncate text-sm text-slate-500">@{user.username}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">
            {user.role}
          </span>
          {!user.active && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">Inactive</span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {user.phone && <p className="text-sm text-slate-600">Phone: {user.phone}</p>}
          {isSelf ? (
            <p className="text-sm text-slate-500">
              You can&apos;t change your own role or deactivate yourself, which stops you locking yourself out.
            </p>
          ) : (
            <RoleForm user={user} />
          )}
          <PasswordForm user={user} />
          {!isSelf && <ActiveForm user={user} />}
        </div>
      )}
    </li>
  );
}

export default function UsersManager({ users, currentUserId }) {
  return (
    <div className="space-y-4">
      <AddUser />
      <ul className="space-y-3">
        {users.map((u) => (
          <UserCard key={u.id} user={u} isSelf={u.id === currentUserId} />
        ))}
      </ul>
    </div>
  );
}
