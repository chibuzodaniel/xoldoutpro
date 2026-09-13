import type { LibraryEntitlement } from "./libraryTypes";

export type Collection = { id: string; name: string; itemCount: number; covers: string[] };

export type CollectionDetailItem = { entitlement: LibraryEntitlement; addedAt: string };
