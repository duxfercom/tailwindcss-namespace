import { HTMLAttributes } from "svelte/elements";

declare module "svelte/elements" {
  interface HTMLAttributes<T> {
    /**
     * Custom namespace attribute for Tailwind CSS Namespace plugin
     */
    "@namespace"?: string;

    /**
     * Legacy namespace attribute (for backward compatibility)
     */
    "tw-namespace"?: string;

    /**
     * Tailwind namespace attribute for CSS class grouping
     */
    "data-tw"?: string;
  }
}
// Add declarations for various frameworks
// Svelte JSX
declare namespace svelte.JSX {
  interface HTMLAttributes<T> {
    /**
     * Custom attribute for Tailwind CSS namespacing
     */
    "tw-namespace"?: string;
  }
}

// React JSX (if using React components)
declare namespace React.JSX {
  interface HTMLAttributes<T> {
    /**
     * Custom attribute for Tailwind CSS namespacing
     */
    "tw-namespace"?: string;
  }
}

// Standard HTML elements (for vanilla JS/TS)
interface HTMLElement {
  /**
   * Custom attribute for Tailwind CSS namespacing
   */
  "tw-namespace"?: string;
}

// Ensure TypeScript recognizes tw-namespace as a valid attribute
interface HTMLAttributes {
  /**
   * Custom attribute for Tailwind CSS namespacing
   */
  "tw-namespace"?: string;
}
