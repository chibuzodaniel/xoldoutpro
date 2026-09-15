import type { ProductCardData } from "./discoverTypes";

// Heavy Rotation returns full ProductCardData shapes (same query web's
// getHeavyRotation uses) — this alias just documents the intent at call
// sites without repeating the whole type.
export type HeavyRotationProduct = ProductCardData;
