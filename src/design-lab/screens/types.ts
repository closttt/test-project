/** A significant element of a screen the owner can review on its own (marked data-lab-block="id" in the screen). */
export interface BlockMeta {
  id: string;
  name: string;
  /** What it is now and what data it shows — context for the owner's feedback. */
  about: string;
}

/** Metadata each style folder exports from meta.ts — read by the decision board. */
export interface VariantMeta {
  /** File name without extension: v1 → screens/<screen>/<style>/v1.tsx */
  id: string;
  name: string;
  composition: string;
  /** Reference ids from decisions.ts REFS. */
  refs: string[];
  benefit: string;
  tradeoff: string;
  /** Reviewable elements of this screen, top to bottom. */
  blocks?: BlockMeta[];
}

export interface StyleMeta {
  id: string;
  name: string;
  /** Sort order on the board. */
  order: number;
  summary: string;
  variants: VariantMeta[];
}
