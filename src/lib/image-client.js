// Browser-only. Shrinks a phone photo before upload (saves mobile data and stays well under
// body-size limits). The server compresses again to its final 1200px size.

const MAX_SIDE = 1600;

export async function shrinkImage(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. a format the browser can't decode: let the server try
  }
}

/** Upload a photo to /api/upload. Returns { url, thumbUrl }; throws an Error with a readable message. */
export async function uploadReceipt(file) {
  const body = new FormData();
  body.append("file", await shrinkImage(file), "receipt.jpg");
  let res;
  try {
    res = await fetch("/api/upload", { method: "POST", body });
  } catch {
    throw new Error("Could not reach the server. Check your connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data;
}
