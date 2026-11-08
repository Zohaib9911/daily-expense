"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { inputClass } from "@/lib/ui";

export { inputClass };

/** Uncontrolled password field with a show/hide toggle (44px+ tap target). */
export default function PasswordInput({ id, name, autoComplete, placeholder, required, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${inputClass} pr-14`}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800"
      >
        {show ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
  );
}
