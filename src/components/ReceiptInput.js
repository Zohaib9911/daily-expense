"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { uploadReceipt } from "@/lib/image-client";
import { thumbUrl } from "@/lib/validation/expense";
import { btnGhost } from "@/lib/ui";

/**
 * Receipt photo picker. "Take photo" opens the camera (capture="environment");
 * "From gallery" opens the photo library. The photo is shrunk, uploaded to /api/upload
 * straight away, and `onChange` gets the stored URL ("" when removed).
 */
export default function ReceiptInput({ value, onChange, required, error, label = "Receipt photo" }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const camera = useRef(null);
  const gallery = useRef(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same photo again
    if (!file) return;
    setProblem("");
    setBusy(true);
    try {
      const { url } = await uploadReceipt(file);
      onChange(url);
    } catch (err) {
      setProblem(err.message);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shown = problem || error;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{required ? <span className="text-red-600"> (required)</span> : " (optional)"}
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(value)} alt="Receipt" className="h-20 w-20 shrink-0 rounded-lg bg-slate-100 object-cover" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-green-700">Photo attached</p>
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700"
            >
              <X size={16} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={`${btnGhost} min-h-14 flex-col`}>
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
            {busy ? "Uploading..." : "Take photo"}
          </button>
          <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className={`${btnGhost} min-h-14 flex-col`}>
            <ImagePlus size={22} />
            From gallery
          </button>
        </div>
      )}

      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="receipt-camera" />
      <input ref={gallery} type="file" accept="image/*" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="receipt-gallery" />

      {shown && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {shown}
        </p>
      )}
    </div>
  );
}
