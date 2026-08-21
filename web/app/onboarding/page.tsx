"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { enablePush } from "@/lib/push";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { useInstallGuide } from "@/components/pwa/InstallGuideProvider";

const SUGGESTED_TAGS = ["Artist", "Producer", "Manager", "Label"];

export default function OnboardingPage() {
  const router = useRouter();
  const { firebaseUser, appUser, loading, refreshAppUser } = useAuth();
  const installGuide = useInstallGuide();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace("/login");
  }, [loading, firebaseUser, router]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration of the form once appUser loads async, not per-render derived state */
    if (appUser) {
      setHandle(appUser.handle);
      setDisplayName(appUser.displayName);
      setBio(appUser.bio ?? "");
      setTags(appUser.tags ?? []);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [appUser]);

  function toggleTag(tag: string) {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  }

  function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setCropFile(file);
    e.target.value = "";
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
        const finalizeRes = await apiFetch("/api/me/avatar", { method: "POST", body: JSON.stringify({ key }) });
        if (!finalizeRes.ok) throw new Error("Could not process avatar");
      }

      await refreshAppUser();
      router.push("/discover");
      installGuide.open();
      // Best-effort — pushEnabled defaults to true for new signups, but that's
      // just the stored preference; this is what actually asks the browser
      // for notification permission. Never blocks/fails onboarding: if it's
      // unsupported or denied, the user can still turn it on later from
      // Edit Profile.
      void enablePush().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !firebaseUser) return null;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-4">Set up your profile</p>
        <h1 className="font-serif text-3xl mb-8">You&apos;re in.</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col items-center gap-2 cursor-pointer">
            <div className="h-20 w-20 rounded-full bg-surface-2 border border-line overflow-hidden flex items-center justify-center">
              {avatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : (
                <span className="font-serif text-xl text-ink-3">
                  {(displayName || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <span className="text-xs text-ink-3">Add a photo</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onAvatarChange} />
          </label>

          {cropFile && (
            <ImageCropModal
              file={cropFile}
              aspect={1}
              cropShape="round"
              outputWidth={512}
              outputHeight={512}
              onCancel={() => setCropFile(null)}
              onConfirm={(cropped) => {
                setAvatarFile(cropped);
                setAvatarPreview(URL.createObjectURL(cropped));
                setCropFile(null);
              }}
            />
          )}

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

          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
              className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">
              Tags — describe yourself, doesn&apos;t restrict what you can do
            </label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                    tags.includes(tag)
                      ? "border-red text-red-soft bg-red/10"
                      : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
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
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
