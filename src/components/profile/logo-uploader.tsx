"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import { removeAvatar, setAvatar, type ProfileActionState } from "@/app/(app)/profile/actions";
import { FormMessage } from "@/components/auth/form-message";
import { SubmitButton } from "@/components/auth/submit-button";
import { Avatar } from "@/components/profile/avatar";
import { Button } from "@/components/ui/button";
import { newAvatarPath } from "@/lib/domain/avatar";
import { createClient } from "@/lib/supabase/client";

const OUTPUT_PX = 256;
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/** Square-crop and downscale in the browser so the upload is always a small WebP. */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_PX, OUTPUT_PX);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
        "image/webp",
        0.85,
      );
    });
  } finally {
    bitmap.close();
  }
}

export function LogoUploader({
  userId,
  displayName,
  avatarPath,
}: {
  userId: string;
  displayName: string;
  avatarPath: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<ProfileActionState>({});
  const [busy, startTransition] = useTransition();
  const [removeState, removeAction] = useActionState<ProfileActionState, FormData>(
    removeAvatar,
    {},
  );

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMessage({ error: "Choose an image file." });
    if (file.size > MAX_INPUT_BYTES) return setMessage({ error: "That image is over 12 MB." });
    setMessage({});
    startTransition(async () => {
      try {
        const blob = await toSquareWebp(file);
        const path = newAvatarPath(userId, Date.now());
        const { error } = await createClient()
          .storage.from("logos")
          .upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
        if (error) throw new Error(error.message);
        const fd = new FormData();
        fd.set("path", path);
        setMessage(await setAvatar({}, fd));
      } catch (err) {
        setMessage({ error: err instanceof Error ? err.message : "Upload failed." });
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={displayName} path={avatarPath} size="lg" />
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          data-testid="logo-input"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : avatarPath ? "Replace logo" : "Upload logo"}
          </Button>
          {avatarPath ? (
            <form action={removeAction}>
              <SubmitButton size="sm" variant="ghost" pendingText="Removing…">
                Remove
              </SubmitButton>
            </form>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          Square-cropped to 256 px and stored as WebP. PNG, JPEG, WebP or GIF up to 12 MB.
        </p>
        <FormMessage state={message.error || message.success ? message : removeState} />
      </div>
    </div>
  );
}
