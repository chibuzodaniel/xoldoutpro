"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";

const SUGGESTED_TAGS = ["Artist", "Producer", "Manager", "Label"];

export default function EditProfilePage() {
  const router = useRouter();
  const { appUser, refreshAppUser } = useAuth();

  const [handle, setHandle] = useState(appUser?.handle ?? "");
  const [displayName, setDisplayName] = useState(appUser?.displayName ?? "");
  const [bio, setBio] = useState(appUser?.bio ?? "");
  const [tags, setTags] = useState<string[]>(appUser?.tags ?? []);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleTag(tag: string) {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const patchRes = await apiFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ handle, displayName, bio, tags }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save profile");
      }
      if (avatarFile) {
        const key = await uploadImage(avatarFile, "avatar");
        await apiFetch("/api/me/avatar", { method: "POST", body: JSON.stringify({ key }) });
      }
      if (coverFile) {
        const key = await uploadImage(coverFile, "cover");
        await apiFetch("/api/me/cover", { method: "POST", body: JSON.stringify({ key }) });
      }
      await refreshAppUser();
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!appUser) return null;

  return (
    <div className="px-4 py-6 max-w-sm mx-auto">
      <h1 className="font-serif text-2xl mb-6">Edit profile</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Cover photo</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
            className="text-xs text-ink-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Avatar</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            className="text-xs text-ink-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Handle</label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            required
            minLength={3}
            maxLength={24}
            pattern="[a-z0-9_]+"
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={60}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red resize-none"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Tags</label>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TAGS.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  tags.includes(tag) ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-soft">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </div>
  );
}
