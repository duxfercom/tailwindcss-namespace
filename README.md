# Tailwind CSS Namespace Compiler (Alpha)

> **⚠️ ALPHA VERSION**: This project is in early development. APIs may change without notice, and some features might be incomplete. Use in production at your own risk.

A Vite 6+ plugin that compiles Tailwind CSS utility classes into namespaced class names, optimizing your HTML markup while preserving the power of Tailwind's utility-first approach.

[![Alpha](https://img.shields.io/badge/version-alpha_0.1.0-orange.svg)](https://github.com/duxfercom/tailwindcss-namespace)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/tailwindcss-namespace)](https://www.npmjs.com/package/tailwindcss-namespace)

## Requirements

- Vite 6.0 or higher
- Tailwind CSS 3.0 or higher
- Node.js 18+ recommended

## Installation

```bash
# Note: Alpha version - expect potential breaking changes
npm install tailwindcss-namespace@alpha --save-dev
```

# Tailwind CSS Namespace Compiler (Alpha)

> **⚠️ ALPHA VERSION**: This project is in early development. APIs may change without notice, and some features might be incomplete. Use in production at your own risk.

A Vite plugin that compiles Tailwind CSS utility classes into namespaced class names, optimizing your HTML markup while preserving the power of Tailwind's utility-first approach.

[![Alpha](https://img.shields.io/badge/version-alpha_0.1.0-orange.svg)](https://github.com/duxfercom/tailwindcss-namespace)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/duxfercom/tailwindcss-namespace/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/tailwindcss-namespace)](https://www.npmjs.com/package/tailwindcss-namespace)

## Overview

Tailwind Namespace Compiler lets you group Tailwind utility classes under semantic namespace identifiers, making your markup more readable and maintainable while optimizing the CSS output. Instead of long strings of utility classes, you get clean, meaningful class names that still leverage the full power of Tailwind CSS.

![Before and After Example](https://via.placeholder.com/600x200?text=Before+and+After+Example)

## ⚠️ Alpha Status Notice

This project is currently in **alpha** stage and is under active development:

- **Breaking Changes**: APIs and configuration options may change between versions
- **Limited Testing**: Has been tested primarily with Svelte, with limited testing on other frameworks
- **Performance Optimization**: Still being optimized for large-scale projects
- **Documentation**: In progress and subject to updates

We welcome feedback, bug reports, and contributions!

## Features

- 🔄 Convert multiple Tailwind utility classes into semantically named classes
- 🏷️ Define class naming via the `tw-namespace` attribute
- 🧩 Automatically versions namespaces for different utility combinations
- 🔍 Smart class deduplication across components
- 🔄 HMR support with live CSS updates
- 🔧 Works with Svelte, React, Vue, and other frameworks
- 📊 Multiple optimization strategies with automatic selection
- 🛠️ Full TypeScript support

## Installation

```bash
# Note: Alpha version - expect potential breaking changes
npm install tailwindcss-namespace@alpha --save-dev
```

## Setup

### 1. Update your vite.config.ts

```typescript
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte"; // Or your framework's plugin
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
    // Your framework plugin comes last
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

### 3. Make sure Tailwind is configured

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,js,svelte,ts,jsx,tsx,vue,astro}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## Basic Usage

Add the `tw-namespace` attribute to elements where you want to group Tailwind classes:

### Svelte Example

```svelte
<div
  tw-namespace="header"
  class="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md"
>
  This will become <div class="header">
</div>

<button
  tw-namespace="primary-btn"
  class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
>
  This will become <button class="primary-btn">
</button>
```

### React Example

```jsx
<div
  tw-namespace="card"
  className="bg-white rounded-lg shadow-md p-6 max-w-sm mx-auto">
  <h2
    tw-namespace="card-title"
    className="text-xl font-bold mb-4 text-gray-800">
    Card Title
  </h2>
  <p className="text-gray-600">
    Content without a namespace will get a generated class name
  </p>
</div>
```

### Vue Example

```vue
<template>
  <div
    tw-namespace="profile"
    class="flex items-center space-x-4 p-4 bg-gray-100 rounded-lg">
    <img
      tw-namespace="profile-avatar"
      class="w-12 h-12 rounded-full border-2 border-blue-500"
      src="/avatar.jpg"
      alt="User avatar" />
    <div class="flex flex-col">
      <span class="font-medium text-gray-900">Username</span>
    </div>
  </div>
</template>
```

## Multiple Variations of the Same Namespace

If you use the same namespace with different class combinations, the plugin automatically creates versioned namespaces:

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

Will compile to:

```html
<button class="btn">Blue Button</button>
<button class="btn-1">Red Button</button>
```

## Configuration Options

| Option         | Type                | Default                                                  | Description                                                                |
| -------------- | ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `mode`         | `"build" \| "all"`  | `"all"`                                                  | Whether to process files only during build (`"build"`) or always (`"all"`) |
| `namespaceDir` | `string`            | `".tw-namespace"`                                        | Directory for generated CSS files                                          |
| `extensions`   | `string[]`          | `[".svelte", ".jsx", ".tsx", ".vue", ".astro", ".html"]` | File extensions to process                                                 |
| `optimizeCss`  | `boolean \| "auto"` | `true`                                                   | Optimization strategy for CSS output                                       |

## CSS Optimization Strategies

- `true`: Component-scoped optimization with selector grouping
- `false`: Standard output with individual selectors
- `"auto"`: Automatically selects the smallest output between global and component-scoped optimizations

## How It Works

1. The plugin scans your component files for the `tw-namespace` attribute and corresponding `class` attributes
2. It processes the utility classes and generates optimized class names
3. It creates CSS files using `@apply` to associate the generated class names with the original Tailwind utilities
4. Tailwind CSS processes these files to generate the final CSS
5. During development, HMR ensures that CSS changes are immediately reflected

## Advanced Usage

### Using with Build Systems

For production builds, the plugin automatically uses more aggressive optimization. You can control this with the `optimizeCss` option:

```typescript
...tailwindcssNamespace({
  optimizeCss: "auto", // Try all strategies and pick the best one
}),
```

### Styling Dynamically Created Elements

For elements created dynamically, make sure they use the same namespaced classes as your static elements:

```javascript
// Create an element with the same namespaced class
const div = document.createElement("div");
div.className = "header"; // Use the namespaced class, not the original utilities
```

## Known Limitations

As this is an alpha release, please be aware of the following limitations:

- **HMR Reliability**: Occasional HMR issues might require a manual page refresh
- **Compatibility**: Not fully tested with all Vite configurations and environments
- **Large Projects**: Performance optimizations for very large projects are still in progress
- **Build Process**: May increase build time compared to standard Tailwind setup

## Performance Considerations

The plugin adds processing time to your development and build processes. For very large projects, you may want to:

- Use the `mode: "build"` option during development to skip processing until production builds
- Consider breaking your application into smaller modules

## Roadmap

- [x] Basic namespace functionality
- [x] Automatic optimization strategies
- [x] HMR support
- [ ] Integration tests with multiple frameworks
- [ ] Improved build performance
- [ ] More fine-grained configuration options
- [ ] CLI tools for generating reports
- [ ] Enhanced debugging options

## Contributing

Contributions are welcome! As this is an alpha project, there's plenty of room for improvement.

1. File an issue describing the problem or enhancement
2. Fork the repository and create a feature branch
3. Submit a pull request with your changes

Please follow coding standards and include tests for new features.

## Reporting Issues

If you encounter any problems, please file an issue on the [GitHub repository](https://github.com/duxfercom/tailwindcss-namespace/issues) with:

- Detailed description of the problem
- Steps to reproduce the issue
- Your environment details (OS, Node version, etc.)
- Relevant code samples or error messages

## Troubleshooting

### CSS Not Updating During Development

If you notice CSS isn't applying correctly after changes:

1. Make sure your import order in `vite.config.ts` is correct (namespace plugin first, then Tailwind)
2. Check that you've imported `@import "tailwindcss-namespace";` in your main CSS file
3. Verify that your Tailwind classes are valid

### Styles Missing in Production Build

Ensure your Tailwind content configuration includes all necessary files:

```javascript
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{html,js,svelte,ts,jsx,tsx,vue,astro}"],
  // ...
};
```

## Debugging

To help debug issues during this alpha stage, try these approaches:

1. Check the generated CSS files in your `.tw-namespace` directory
2. Temporarily set `optimizeCss: false` for more readable output
3. Check browser console for any errors related to CSS loading
4. Ensure the plugin order in `vite.config.ts` is correct

## License

MIT
