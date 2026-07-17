import type { Variants, Transition } from "framer-motion";

/** Expo-out — calm, "settled" entrance easing (Linear-like). */
export const easeOut: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Snappy spring for interactive elements (hover, tap, dialogs). */
export const spring: Transition = { type: "spring", stiffness: 400, damping: 32 };

/** Softer spring for larger surfaces (dialogs, panels). */
export const softSpring: Transition = { type: "spring", stiffness: 300, damping: 30 };

/** Page-level fade + slight rise. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: easeOut } },
};

/** Stagger container — children animate in sequence. */
export const listContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

/** Stagger item — rise + fade. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOut } },
};

/** Dialog content spring-in. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: softSpring },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15 } },
};
