# Tailwind CSS Namespace

[![Alpha Version](https://img.shields.io/badge/Alpha-0.1.0-orange?style=for-the-badge)](https://github.com/duxfercom/tailwindcss-namespace)
[![MIT License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](https://github.com/duxfercom/tailwindcss-namespace/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/tailwindcss-namespace?style=for-the-badge)](https://www.npmjs.com/package/tailwindcss-namespace)

> **⚠️ ALPHA SOFTWARE**: This project is in active development. APIs may change between versions. Currently optimized for Svelte applications with plans for broader framework support in future releases.

A Vite plugin that converts Tailwind utility classes into semantic, namespaced class names, making your markup cleaner while preserving Tailwind's power.

## Overview

Tailwind CSS Namespace lets you group multiple Tailwind utility classes under meaningful namespace identifiers, optimizing your HTML markup and improving code readability.

```svelte
<!-- Before -->
<div class="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-600 transition-colors">
  Button
</div>

<!-- After -->
<div tw-namespace="primary-button" class="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-600 transition-colors">
  Button
</div>

<!-- Renders as -->
<div class="primary-button">
  Button
</div>
```

## Features

- 🔄 Convert utility classes into semantic namespaced classes
- 🏷️ Define naming via the simple `tw-namespace` attribute
- 🧩 Automatic versioning for different class combinations
- 🔍 Smart class deduplication and optimization
- 🔄 HMR support with instant CSS updates
- 🔧 Currently optimized for Svelte
- 📊 Multiple optimization strategies
- 🛠️ Full TypeScript support

## Installation

```bash
npm install tailwindcss-namespace@alpha --save-dev
```

## Setup

### 1. Update your vite.config.ts

```typescript
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { tailwindcssNamespace } from "tailwindcss-namespace";

export default defineConfig({
  plugins: [
    // Spread the array of plugins returned by tailwindcssNamespace
    ...tailwindcssNamespace({
      mode: "all", // Process files in both dev and build
      namespaceDir: ".tw-namespace", // Directory for generated files
      optimizeCss: "auto", // Auto-select the best optimization strategy
    }),
    // The Tailwind plugin MUST come after our namespace plugin
    tailwindcss(),
    // Svelte plugin comes last
    svelte(),
  ],
});
```

### 2. Import in your main CSS file

```css
/* In your app.css or main.css */
@import "tailwindcss";

/* Import our namespaced styles */
@import "tailwindcss-namespace";

/* Other styles below */
```

### 3. Configure Tailwind

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## Usage

Add the `tw-namespace` attribute to elements:

```svelte
<div
  tw-namespace="header"
  class="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md"
>
  My Header
</div>

<button
  tw-namespace="primary-btn"
  class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
>
  Primary Button
</button>
```

### Multiple Variations

```svelte
<!-- First usage of "btn" namespace -->
<button tw-namespace="btn" class="bg-blue-500 text-white p-2 rounded">
  Blue Button
</button>

<!-- Different classes with same namespace - will be "btn-1" -->
<button tw-namespace="btn" class="bg-red-500 text-white p-2 rounded">
  Red Button
</button>
```

## Configuration Options

| Option         | Type                | Default                            | Description                                                                |
| -------------- | ------------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `mode`         | `"build" \| "all"`  | `"all"`                            | Whether to process files only during build (`"build"`) or always (`"all"`) |
| `namespaceDir` | `string`            | `".tw-namespace"`                  | Directory for generated CSS files                                          |
| `extensions`   | `string[]`          | `[".svelte", ".jsx", ".tsx", ...]` | File extensions to process                                                 |
| `optimizeCss`  | `boolean \| "auto"` | `true`                             | Optimization strategy for CSS output                                       |

## How It Works

1. The plugin scans your files for the `tw-namespace` attribute
2. It processes the utility classes and generates optimized class names
3. It creates CSS files with `@apply` directives that map to the original Tailwind utilities
4. During development, HMR ensures styles update immediately when changes are made

## Roadmap

- [x] Basic namespace functionality
- [x] Automatic optimization strategies
- [x] HMR support for Svelte
- [ ] Official support for React and Vue
- [ ] Improved build performance
- [ ] More fine-grained configuration options
- [ ] CLI tools for analysis and reporting

## Troubleshooting

### CSS Not Updating During Development

1. Make sure your import order in `vite.config.ts` is correct (namespace plugin first, then Tailwind)
2. Check that you've imported `@import "tailwindcss-namespace";` in your main CSS file
3. Verify that your Tailwind classes are valid

### Styles Missing in Production Build

Ensure your Tailwind content configuration includes all necessary files:

```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  // ...
};
```

## License

MIT
