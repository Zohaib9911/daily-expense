"use client";

import { Printer } from "lucide-react";
import { btnPrimary } from "@/lib/ui";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${btnPrimary} min-h-12 w-full print:hidden`}>
      <Printer size={20} />
      Print / Save as PDF
    </button>
  );
}
