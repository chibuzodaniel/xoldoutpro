import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { useAuth } from "./AuthContext";

// A separate call from whatever list endpoint supplied these ids (Discover,
// Search, a creator's catalog) rather than a field on ProductCardData —
// those responses are shared/cached across every viewer, so baking one
// user's ownership into them would leak it to the next viewer.
export function useOwnedProducts(productIds: string[]): Set<string> {
  const { firebaseUser } = useAuth();
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const key = Array.from(new Set(productIds)).sort().join(",");

  useEffect(() => {
    if (!firebaseUser || !key) {
      setOwned(new Set());
      return;
    }
    let cancelled = false;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ entitled: string[] }>(`/api/me/entitlements?productIds=${encodeURIComponent(key)}`, idToken))
      .then((data) => {
        if (!cancelled) setOwned(new Set(data.entitled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, key]);

  return owned;
}
