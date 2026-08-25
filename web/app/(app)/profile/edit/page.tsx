"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useAuth, type SocialLink } from "@/components/auth/AuthProvider";
import { firebaseAuth } from "@/lib/firebase/client";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { enablePush, disablePush } from "@/lib/push";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { DeleteAccountSheet } from "@/components/profile/DeleteAccountSheet";

const PLATFORMS: SocialLink["platform"][] = ["Instagram", "X", "TikTok", "YouTube", "Website"];

export default function EditProfilePage() {
  const router = useRouter();
  const { appUser, refreshAppUser } = useAuth();

  const [handle, setHandle] = useState(appUser?.handle ?? "");
  const [displayName, setDisplayName] = useState(appUser?.displayName ?? "");
  const [bio, setBio] = useState(appUser?.bio ?? "");
  const [tags, setTags] = useState<string[]>(appUser?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(appUser?.socialLinks ?? []);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(appUser?.avatarUrl ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(appUser?.coverUrl ?? null);
  const [cropTarget, setCropTarget] = useState<{ file: File; kind: "avatar" | "cover" } | null>(null);
  const [pushEnabled, setPushEnabled] = useState(appUser?.pushEnabled ?? false);
  const [pushBusy, setPushBusy] = useState(false);
  const [digestSubscribed, setDigestSubscribed] = useState(appUser?.emailDigestSubscribed ?? false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setTags((cur) => [...cur, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((cur) => cur.filter((t) => t !== tag));
  }

  function addSocialLink() {
    if (socialLinks.length >= 6) return;
    setSocialLinks((cur) => [...cur, { platform: "Instagram", url: "" }]);
  }

  function updateSocialLink(index: number, patch: Partial<SocialLink>) {
    setSocialLinks((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function removeSocialLink(index: number) {
    setSocialLinks((cur) => cur.filter((_, i) => i !== index));
  }

  async function handleTogglePush() {
    setPushBusy(true);
    setError(null);
    try {
      if (pushEnabled) {
        await disablePush();
        setPushEnabled(false);
      } else {
        const result = await enablePush();
        if (!result.ok) {
          setError(result.error);
        } else {
          setPushEnabled(true);
        }
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleToggleDigest() {
    setDigestBusy(true);
    const next = !digestSubscribed;
    try {
      const res = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ emailDigestSubscribed: next }) });
      if (res.ok) setDigestSubscribed(next);
    } finally {
      setDigestBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanLinks = socialLinks.filter((l) => l.url.trim().length > 0);
      const patchRes = await apiFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ handle, displayName, bio, tags, socialLinks: cleanLinks }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save profile");
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

  async function handleLogout() {
    if (firebaseAuth) await signOut(firebaseAuth);
    router.push("/login");
  }

  if (!appUser) return null;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-line-soft mb-6">
        <button onClick={() => router.back()} className="text-xl text-ink-2" aria-label="Back">
          ‹
        </button>
        <h1 className="font-serif text-xl">Settings</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 flex flex-col gap-8 max-w-sm mx-auto">
        <div className="flex flex-col gap-4">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Photos</h2>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Cover photo</label>
            <label className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-ink-3">Add cover photo</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCropTarget({ file, kind: "cover" });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Avatar</label>
            <label className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-ink-3">Add</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCropTarget({ file, kind: "avatar" });
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {cropTarget && (
          <ImageCropModal
            file={cropTarget.file}
            aspect={cropTarget.kind === "avatar" ? 1 : 3}
            cropShape={cropTarget.kind === "avatar" ? "round" : "rect"}
            outputWidth={cropTarget.kind === "avatar" ? 512 : 1200}
            outputHeight={cropTarget.kind === "avatar" ? 512 : 400}
            onCancel={() => setCropTarget(null)}
            onConfirm={(cropped) => {
              if (cropTarget.kind === "avatar") {
                setAvatarFile(cropped);
                setAvatarPreview(URL.createObjectURL(cropped));
              } else {
                setCoverFile(cropped);
                setCoverPreview(URL.createObjectURL(cropped));
              }
              setCropTarget(null);
            }}
          />
        )}

        <div className="flex flex-col gap-4">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Profile</h2>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Handle</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              required
              minLength={3}
              maxLength={24}
              pattern="[a-z0-9_]+"
              className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Display name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={60}
              className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Bio</h2>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={3}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Tags</h2>
          <div className="flex flex-wrap gap-2 mb-1">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="text-ink-3" aria-label={`Remove ${tag}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag (e.g. Producer)"
              maxLength={24}
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
            <button
              type="button"
              onClick={addTag}
              className="rounded-lg border border-line px-4 text-sm font-semibold"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Social accounts</h2>
          <div className="flex flex-col gap-2">
            {socialLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={link.platform}
                  onChange={(e) => updateSocialLink(i, { platform: e.target.value as SocialLink["platform"] })}
                  className="rounded-lg border border-line bg-surface px-2 py-2 text-xs outline-none"
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  value={link.url}
                  onChange={(e) => updateSocialLink(i, { url: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red"
                />
                <button
                  type="button"
                  onClick={() => removeSocialLink(i)}
                  className="text-ink-3 shrink-0"
                  aria-label="Remove social account"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {socialLinks.length < 6 && (
            <button type="button" onClick={addSocialLink} className="text-left text-xs font-semibold text-red-soft">
              + Add social account
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-soft">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-red px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save Changes"}
        </button>
      </form>

      <div className="px-4 max-w-sm mx-auto mt-8">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Push Notifications</h2>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 mb-8">
          <div>
            <p className="text-sm font-semibold mb-0.5">Get notified in the background</p>
            <p className="text-xs text-ink-3">New releases, purchases, and follows — even when the app isn&apos;t open.</p>
          </div>
          <button
            type="button"
            onClick={handleTogglePush}
            disabled={pushBusy}
            aria-pressed={pushEnabled}
            className="relative h-6 w-11 rounded-full shrink-0 border border-line bg-surface-2 transition-colors disabled:opacity-50"
          >
            {/* left-0 is load-bearing, not decorative: the dot is a plain
                <span>, naturally inline, and buttons default to
                text-align: center — without an explicit left, its "auto"
                static position resolves against that centering instead of
                the track's edge, landing it off to the right (worse once
                translated further right for "on"). left-0 anchors it to a
                known 0, so translate-x-0.5/-5 (2px/20px) move it a
                predictable amount from the track's actual left edge.
                Track is 44px (w-11) with a 1px border each side, so the
                padding box the dot positions within is 42px, not 44 —
                translate-x-5 leaves a clean ~2px inset on the right,
                matching the 2px left inset when off. */}
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full transition-[transform,background-color] ${
                pushEnabled ? "translate-x-5 bg-red" : "translate-x-0.5 bg-white"
              }`}
            />
          </button>
        </div>

        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Email Digest</h2>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 mb-8">
          <div>
            <p className="text-sm font-semibold mb-0.5">Best-sellers, by email</p>
            <p className="text-xs text-ink-3">Weekly, monthly, and yearly top songs plus a few things worth checking out.</p>
          </div>
          <button
            type="button"
            onClick={handleToggleDigest}
            disabled={digestBusy}
            aria-pressed={digestSubscribed}
            className="relative h-6 w-11 rounded-full shrink-0 border border-line bg-surface-2 transition-colors disabled:opacity-50"
          >
            <span
              className={`absolute left-0 top-0.5 h-5 w-5 rounded-full transition-[transform,background-color] ${
                digestSubscribed ? "translate-x-5 bg-red" : "translate-x-0.5 bg-white"
              }`}
            />
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="w-full rounded-lg border border-line px-4 py-3.5 text-sm font-semibold text-red-soft"
        >
          Log Out
        </button>

        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3 mt-8">Danger Zone</h2>
        <button
          onClick={() => setDeleteSheetOpen(true)}
          className="w-full rounded-lg border border-red-soft px-4 py-3.5 text-sm font-semibold text-red-soft transition-colors duration-150 hover:bg-red-soft/10"
        >
          Delete Account
        </button>
      </div>

      <DeleteAccountSheet open={deleteSheetOpen} onClose={() => setDeleteSheetOpen(false)} handle={appUser.handle} />
    </div>
  );
}
