import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** sessionStorage key: set once the first-visit intro has played. Shared by the intro and the root layout script. */
export const INTRO_KEY = "asterra-intro";
