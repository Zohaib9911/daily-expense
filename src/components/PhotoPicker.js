"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { uploadReceipt } from "@/lib/image-client";
import { thumbUrl } from "@/lib/validation/expense";
import { btnGhost } from "@/lib/ui";

/**
 * Several optional photos (e.g. furniture for an order). Each photo is shrunk and uploaded to /api/upload
 * straight away; `value` is the array of stored URLs and `onChange(nextArray)` gets the new list.
 * "Take photo" opens the camera, "From gallery" lets you pick several at once. `onBusyChange(true|false)` tells the
 * form to hold its Save button while a photo is still uploading.
 */
export default function PhotoPicker({ value = [], onChange, onBusyChange, max = 6, label = "Photos", hint, error }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(0); // photos still on their way
  const [problem, setProblem] = useState("");
  const camera = useRef(null);
  const gallery = useRef(null);
  const latest = useRef(value); // the list as of now, so photos finishing one after another don't overwrite each other
  useEffect(() => {
    latest.current = value;
  }, [value]);

  useEffect(() => {
    onBusyChange?.(uploading > 0);
  }, [uploading, onBusyChange]);

  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = ""; // allow choosing the same photo again
    if (!files.length) return;
    setProblem("");
    const room = max - latest.current.length - uploading;
    if (room <= 0) return setProblem(`You can add up to ${max} photos.`);
    const chosen = files.slice(0, room);
    if (files.length > room) setProblem(`Only ${max} photos fit; the extra ones were skipped.`);

    setUploading((n) => n + chosen.length);
    for (const file of chosen) {
      try {
        const { url } = await uploadReceipt(file);
        const next = [...latest.current, url];
        latest.current = next;
        onChange(next);
      } catch (err) {
        setProblem(err.message);
        toast.error(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const remove = (url) => {
    const next = latest.current.filter((u) => u !== url);
    latest.current = next;
    onChange(next);
  };

  const full = value.length + uploading >= max;
  const shown = problem || error;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} <span className="font-normal text-slate-500">(optional, up to {max})</span>
      </span>

      {(value.length > 0 || uploading > 0) && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {value.map((url, i) => (
            <li key={url} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(url)} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1.5"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white">
                  <X size={16} />
                </span>
              </button>
            </li>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <li key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
              <Loader2 size={24} className="animate-spin" aria-label="Uploading" />
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => camera.current?.click()} className={`${btnGhost} min-h-14 flex-col`}>
            <Camera size={22} />
            Take photo
          </button>
          <button type="button" onClick={() => gallery.current?.click()} className={`${btnGhost} min-h-14 flex-col`}>
            <ImagePlus size={22} />
            From gallery
          </button>
        </div>
      )}
      {hint && !shown && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}

      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="photos-camera" />
      <input ref={gallery} type="file" accept="image/*" multiple onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="photos-gallery" />

      {shown && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {shown}
        </p>
      )}
    </div>
  );
}
