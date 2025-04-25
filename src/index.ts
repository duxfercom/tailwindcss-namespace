import type { Plugin, UserConfig } from "vite";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Regex patterns with improved accuracy
const CLASS_ATTR_REGEX = /(\s+class\s*=\s*["'])([^"']+)(["'])/g;
const JSX_CLASS_REGEX = /(\s+className\s*=\s*\{["'])([^"']+)(["']\})/g;
// Regex pattern that only matches tw-namespace attribute
const NAMESPACE_ATTR_REGEX = /tw-namespace\s*=\s*["']([^"']*)["']/g;

// File extensions to process
const SUPPORTED_EXTENSIONS = [
  ".svelte",
  ".jsx",
  ".tsx",
  ".vue",
  ".astro",
  ".html",
];

export interface TailwindNamespaceOptions {
  mode?: "build" | "all";
  namespaceDir?: string;
  extensions?: string[];
  optimizeCss?: boolean | "auto"; // Add "auto" as a valid value
}

interface ClassMapping {
  originalClasses: string;
  normalizedClasses: string;
  generatedClassName: string;
  namespace?: string;
  sourceFile?: string; // Track which source file this mapping came from
}

// Track files for mirrored structure
interface FileMapping {
  sourceFile: string;
  cssFile: string;
  mappings: ClassMapping[];
}

// Add constants for virtual import
const VIRTUAL_CSS_IMPORT = '@import "tailwindcss-namespace";';
const CSS_FILE_REGEX = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)$/;

// Add interface to extend Vite's UserConfig type with tailwindcss property
interface ExtendedUserConfig extends UserConfig {
  tailwindcss?: {
    config?: Record<string, any>;
    [key: string]: any;
  };
}

export function tailwindcssNamespace(
  options: TailwindNamespaceOptions = {}
): Plugin[] {
  // Return an array of plugins instead of a single plugin
  const mode = options.mode || "all";
  const namespaceDir = options.namespaceDir || ".tw-namespace";
  const extensions = options.extensions || SUPPORTED_EXTENSIONS;
  const optimizeCss =
    options.optimizeCss !== undefined ? options.optimizeCss : true; // Default to true

  // Track class mappings by file
  const fileMappings: Map<string, FileMapping> = new Map();

  // Track namespace usage
  const namespaceVersions = new Map<string, number>();
  const namespaceToClasses = new Map<string, Set<string>>();

  // Main CSS files
  let rootDir: string;
  let mainCssFilePath: string;

  const log = (message: string) => {
    console.log(`[tailwindcss-namespace] ${message}`);
  };

  // Create and return two plugins: our main plugin and a wrapper for the tailwind plugin
  return [
    // Main plugin for processing class names
    {
      name: "tailwindcss-namespace",
      enforce: "pre", // This ensures our plugin runs before others

      configResolved(config) {
        rootDir = config.root;

        // Create namespace directory
        const namespaceDirPath = path.join(rootDir, namespaceDir);
        if (!fs.existsSync(namespaceDirPath)) {
          fs.mkdirSync(namespaceDirPath, { recursive: true });
        }

        mainCssFilePath = path.join(namespaceDirPath, "tw-namespace.css");

        // Add a safelist file for Tailwind to find only our generated CSS
        createTailwindSafelist();
      },

      // This hook runs at the beginning of the build process
      async buildStart() {
        log("Build started - generating CSS files");

        // For production builds, scan all files to ensure we capture all possible styles
        if (process.env.NODE_ENV === "production") {
          log("Production build detected - scanning all files for styles");
          await scanAllSourceFiles();
        }

        // Generate CSS files synchronously to ensure they're ready before other processing
        updateCssFiles();

        log("Initial CSS generation complete");
      },

      // Add a hook that runs before files are processed during build
      async options() {
        if (process.env.NODE_ENV === "production") {
          log("Preparing CSS for production build");
          // Ensure CSS is ready before any other processing
          updateCssFiles();
        }
        return null;
      },

      transform(code, id) {
        // Process CSS files first and with high priority
        if (CSS_FILE_REGEX.test(id)) {
          if (code.includes(VIRTUAL_CSS_IMPORT)) {
            // Get relative path to the main CSS file
            const relativePath = path
              .relative(path.dirname(id), mainCssFilePath)
              .replace(/\\/g, "/");

            const result = code.replace(
              VIRTUAL_CSS_IMPORT,
              `@import "${relativePath}";`
            );

            return result;
          }
          return null;
        }

        // Skip if we're in build mode and running in dev
        if (mode === "build" && process.env.NODE_ENV !== "production") {
          return null;
        }

        // Skip if the file extension isn't supported
        if (!extensions.some((ext) => id.endsWith(ext))) {
          return null;
        }

        try {
          const { processedCode, changed, mappings } = processFile(code, id);

          if (changed) {
            // Store mappings for this file
            const relativePath = path.relative(rootDir, id);
            const cssFilePath = getCssFilePathForSource(relativePath);

            // Store file mapping
            fileMappings.set(relativePath, {
              sourceFile: relativePath,
              cssFile: cssFilePath,
              mappings: mappings,
            });

            // Generate individual CSS files and main import file
            updateCssFiles();

            return processedCode;
          }
        } catch (error) {
          console.error(
            `[tailwindcss-namespace] Error processing ${id}:`,
            error
          );

          // Important: don't return a transformed result on error
          // This signals to Vite that the transformation failed
          // and prevents potential infinite loops
          return null;
        }

        return null;
      },

      configureServer(server) {
        if (mode === "build") return;

        // Generate initial CSS
        updateCssFiles();

        // Add a custom middleware to ensure CSS is loaded
        server.middlewares.use((req, _res, next) => {
          // Force CSS regeneration on every request during development
          if (req.url?.endsWith(".css") && req.url.includes(namespaceDir)) {
            updateCssFiles();
          }
          next();
        });

        // Watch for file changes with immediate processing
        server.watcher.on("change", (file) => {
          if (extensions.some((ext) => file.endsWith(ext))) {
            // Process immediately in the watcher instead of waiting for HMR
            const relativePath = path.relative(rootDir, file);
            if (fileMappings.has(relativePath)) {
              try {
                // Update CSS files synchronously
                const code = fs.readFileSync(file, "utf8");
                const { changed, mappings } = processFile(code, file);

                if (changed) {
                  fileMappings.set(relativePath, {
                    sourceFile: relativePath,
                    cssFile: getCssFilePathForSource(relativePath),
                    mappings,
                  });

                  // Generate CSS immediately
                  updateCssFiles();
                }
              } catch (err) {
                console.error(`Error in watcher for ${file}:`, err);
              }
            }
          }
        });

        // Watch for file deletions
        server.watcher.on("unlink", (file) => {
          const relativePath = path.relative(rootDir, file);
          if (fileMappings.has(relativePath)) {
            // Delete corresponding CSS file
            const mapping = fileMappings.get(relativePath)!;
            const cssFilePath = path.join(
              rootDir,
              namespaceDir,
              mapping.cssFile
            );

            if (fs.existsSync(cssFilePath)) {
              fs.unlinkSync(cssFilePath);
            }
            // Remove from mappings
            fileMappings.delete(relativePath);

            // Regenerate main CSS file
            updateCssFiles();
            // Let Vite handle the update naturally - don't force reload
          }
        });

        // Watch for directory deletions
        server.watcher.on("unlinkDir", (dir) => {
          const relativePath = path.relative(rootDir, dir);
          const namespacePath = path.join(rootDir, namespaceDir, relativePath);

          // If corresponding directory exists in namespace, delete it
          if (fs.existsSync(namespacePath)) {
            try {
              fs.rmdirSync(namespacePath, { recursive: true });
            } catch (err) {
              console.error(`Error deleting directory: ${namespacePath}`, err);
            }
          }

          // Remove affected file mappings
          for (const [file] of [...fileMappings.entries()]) {
            if (file.startsWith(relativePath)) {
              fileMappings.delete(file);
            }
          }

          // Regenerate main CSS file
          updateCssFiles();
          // Let Vite handle the update naturally - don't force reload
        });
      },
    },

    // Wrapper plugin that makes sure tailwindcss is configured correctly
    {
      name: "tailwindcss-namespace:tailwind-config",
      enforce: "pre",

      // Detect if tailwindcss plugin is being used
      configResolved(config) {
        // Look for any instances of the tailwindcss plugin
        const tailwindPluginIndex = config.plugins.findIndex(
          (plugin) =>
            plugin.name === "tailwindcss" || plugin.name === "@tailwindcss/vite"
        );

        if (tailwindPluginIndex === -1) {
          // Tailwind plugin not found, log warning
          console.warn(
            "[tailwindcss-namespace] Tailwind CSS plugin not detected. Make sure to add it to your plugins."
          );
        } else {
          log(
            "Tailwind CSS plugin detected and will be configured automatically."
          );
        }
      },

      // Hook into the config hook for Vite
      config(config) {
        // Create a tailwind safelist file to force it to only process our files

        // Find existing tailwind config if any
        const extendedConfig = config as ExtendedUserConfig;
        let existingTailwindConfig = extendedConfig.tailwindcss || {};

        // Override/add specific properties
        const newTailwindConfig = {
          ...existingTailwindConfig,
          config: {
            ...(existingTailwindConfig.config || {}),
            content: [
              path.resolve(rootDir || process.cwd(), namespaceDir, "**/*.css"),
            ],
            // Force watching only our generated files
            watchFiles: [
              path.resolve(rootDir || process.cwd(), namespaceDir, "**/*.css"),
            ],
          },
        };

        // Update the Vite config
        return {
          ...config,
          tailwindcss: newTailwindConfig,
        } as ExtendedUserConfig;
      },
    },
  ];

  /**
   * Process a file to find classes and generate mappings
   */
  function processFile(
    code: string,
    id: string
  ): {
    processedCode: string;
    changed: boolean;
    mappings: ClassMapping[];
  } {
    const mappings: ClassMapping[] = [];
    let modifiedCode = code;
    let changed = false;

    // First pass: find all namespace attributes
    const namespaces: { index: number; value: string }[] = [];
    let match;

    NAMESPACE_ATTR_REGEX.lastIndex = 0;
    while ((match = NAMESPACE_ATTR_REGEX.exec(code)) !== null) {
      const value = match[1] || "";
      const index = match.index;
      namespaces.push({ index, value });
    }

    // Sort namespaces by position for correct matching
    namespaces.sort((a, b) => a.index - b.index);

    // Second pass: process class attributes - use safer replacement strategy
    CLASS_ATTR_REGEX.lastIndex = 0;
    let lastIndex = 0;
    let resultCode = "";

    while ((match = CLASS_ATTR_REGEX.exec(code)) !== null) {
      const [fullMatch, prefix, classValue, suffix] = match;
      const matchIndex = match.index;

      // Skip empty classes or classes with dynamic expressions
      if (!classValue.trim() || classValue.includes("{")) continue;

      // Append everything up to this match
      resultCode += code.substring(lastIndex, matchIndex);

      // Find the most relevant namespace for this element
      const namespace = findNamespaceForPosition(namespaces, matchIndex);

      // Process the class value
      const { normalizedClasses, generatedClassName } = processClassValue(
        classValue,
        namespace
      );

      // Store mapping with source file
      mappings.push({
        originalClasses: classValue,
        normalizedClasses,
        generatedClassName,
        namespace,
        sourceFile: id,
      });

      // Replace only the class value part while keeping prefix and suffix intact
      resultCode += `${prefix}${generatedClassName}${suffix}`;

      // Update the last index for next iteration
      lastIndex = matchIndex + fullMatch.length;

      changed = true;
    }

    // Append any remaining code
    resultCode += code.substring(lastIndex);
    modifiedCode = resultCode;

    // Similar approach for JSX className attributes
    if (changed) {
      lastIndex = 0;
      resultCode = "";
      JSX_CLASS_REGEX.lastIndex = 0;

      while ((match = JSX_CLASS_REGEX.exec(modifiedCode)) !== null) {
        const [fullMatch, prefix, classValue, suffix] = match;
        const matchIndex = match.index;

        if (!classValue.trim()) continue;

        resultCode += modifiedCode.substring(lastIndex, matchIndex);

        const namespace = findNamespaceForPosition(namespaces, matchIndex);
        const { normalizedClasses, generatedClassName } = processClassValue(
          classValue,
          namespace
        );

        // Store mapping with source file
        mappings.push({
          originalClasses: classValue,
          normalizedClasses,
          generatedClassName,
          namespace,
          sourceFile: id,
        });

        resultCode += `${prefix}${generatedClassName}${suffix}`;
        lastIndex = matchIndex + fullMatch.length;
      }

      resultCode += modifiedCode.substring(lastIndex);
      modifiedCode = resultCode;

      // Update attribute removal regex to only match tw-namespace
      modifiedCode = modifiedCode.replace(
        /\s*tw-namespace\s*=\s*["'][^"']*["']/g,
        ""
      );

      // We don't need to add data-tw-processed attributes - removing this approach
      // Instead, we'll rely on the fact that we've already replaced the class names
      // and Tailwind is configured to only process our generated CSS files
    }

    return { processedCode: modifiedCode, changed, mappings };
  }

  /**
   * Find the closest namespace attribute before a position
   */
  function findNamespaceForPosition(
    namespaces: { index: number; value: string }[],
    position: number
  ): string | undefined {
    // Find the closest namespace that appears before this position
    for (let i = namespaces.length - 1; i >= 0; i--) {
      if (namespaces[i].index < position) {
        return namespaces[i].value;
      }
    }
    return undefined;
  }

  /**
   * Process a class value to generate a unique classname
   */
  function processClassValue(
    classValue: string,
    namespace?: string
  ): { normalizedClasses: string; generatedClassName: string } {
    // Normalize the classes (sort and remove duplicates)
    const normalizedClasses = normalizeClassString(classValue);

    // For unnamed elements, use a hash-based approach
    if (!namespace || !isValidCssIdentifier(namespace)) {
      const hash = crypto
        .createHash("md5")
        .update(normalizedClasses)
        .digest("hex")
        .substring(0, 6);

      return { normalizedClasses, generatedClassName: `tw-${hash}` };
    }

    // ENHANCED NAMESPACE HANDLING

    // First time seeing this namespace
    if (!namespaceToClasses.has(namespace)) {
      namespaceToClasses.set(namespace, new Set([normalizedClasses]));
      namespaceVersions.set(namespace, 0);
      return { normalizedClasses, generatedClassName: namespace };
    }

    // Check if this exact class combination exists in the base namespace
    const existingClasses = namespaceToClasses.get(namespace)!;

    if (existingClasses.has(normalizedClasses)) {
      return { normalizedClasses, generatedClassName: namespace };
    }

    // Now check all versioned namespaces
    let foundMatch = false;
    let matchedVersion = -1;

    // Get the highest version we've seen for this namespace
    const highestVersion = namespaceVersions.get(namespace) || 0;

    // Check each version to see if we have an exact match
    for (let version = 1; version <= highestVersion; version++) {
      const versionedNamespace = `${namespace}-${version}`;
      const versionedClasses = namespaceToClasses.get(versionedNamespace);

      if (versionedClasses && versionedClasses.has(normalizedClasses)) {
        foundMatch = true;
        matchedVersion = version;
        break;
      }
    }

    // If found a match in a versioned namespace, return that
    if (foundMatch && matchedVersion > 0) {
      return {
        normalizedClasses,
        generatedClassName: `${namespace}-${matchedVersion}`,
      };
    }

    // No match found - create a new version
    const newVersion = (namespaceVersions.get(namespace) || 0) + 1;
    namespaceVersions.set(namespace, newVersion);

    const newVersionedNamespace = `${namespace}-${newVersion}`;
    namespaceToClasses.set(newVersionedNamespace, new Set([normalizedClasses]));

    return {
      normalizedClasses,
      generatedClassName: newVersionedNamespace,
    };
  }

  /**
   * Get CSS file path corresponding to a source file
   */
  function getCssFilePathForSource(sourceFile: string): string {
    // Replace extension with .css
    const dirname = path.dirname(sourceFile);
    const basename = path.basename(sourceFile, path.extname(sourceFile));

    return path.join(dirname, `${basename}.css`);
  }

  /**
   * Update all CSS files based on the current mappings
   */
  function updateCssFiles(): void {
    if (fileMappings.size === 0) {
      return;
    }

    try {
      // First clear out any redundant versioned namespaces
      cleanupNamespaceVersions();

      // If optimizeCss is set to "auto", generate all three versions and compare sizes
      if (optimizeCss === "auto") {
        // Generate the three different CSS formats
        let optimizedMainCssContent = generateCssContent(fileMappings, true);
        let standardMainCssContent = generateCssContent(fileMappings, false);
        let globalOptimizedCssContent =
          generateGlobalOptimizedCss(fileMappings);

        // Calculate content lengths excluding comments for fair comparison
        const optimizedLength = getContentLengthExcludingComments(
          optimizedMainCssContent
        );
        const standardLength = getContentLengthExcludingComments(
          standardMainCssContent
        );
        const globalOptimizedLength = getContentLengthExcludingComments(
          globalOptimizedCssContent
        );

        // Log the sizes
        log(`Comparing CSS sizes (excluding comments):`);
        log(`- Component-scoped optimized: ${optimizedLength} bytes`);
        log(`- Standard (no optimization): ${standardLength} bytes`);
        log(`- Global optimized: ${globalOptimizedLength} bytes`);

        // Determine the smallest format
        let finalMainCssContent;
        let selectedMode;

        if (
          globalOptimizedLength <= optimizedLength &&
          globalOptimizedLength <= standardLength
        ) {
          finalMainCssContent = globalOptimizedCssContent;
          selectedMode = "global-optimized";
        } else if (optimizedLength <= standardLength) {
          finalMainCssContent = optimizedMainCssContent;
          selectedMode = "component-optimized";
        } else {
          finalMainCssContent = standardMainCssContent;
          selectedMode = "standard";
        }

        // Write the main CSS file with the selected format
        fs.writeFileSync(mainCssFilePath, finalMainCssContent, "utf8");

        // Also update individual component CSS files consistently
        // (using the same optimization mode for all)
        for (const [sourceFile, mapping] of fileMappings.entries()) {
          if (selectedMode === "global-optimized") {
            // For global optimization, we extract just this component's classes from the global result
            generateComponentCssFromGlobal(
              sourceFile,
              mapping,
              globalOptimizedCssContent
            );
          } else {
            generateIndividualComponentCss(
              sourceFile,
              mapping,
              selectedMode === "component-optimized"
            );
          }
        }
      } else {
        // Use the specified format (true = optimized, false = standard)
        const mainCssContent = generateCssContent(fileMappings, !!optimizeCss);
        fs.writeFileSync(mainCssFilePath, mainCssContent, "utf8");

        // Generate individual component CSS files
        for (const [sourceFile, mapping] of fileMappings.entries()) {
          generateIndividualComponentCss(sourceFile, mapping, !!optimizeCss);
        }
      }
    } catch (error) {
      console.error(
        "[tailwindcss-namespace] Error generating CSS files:",
        error
      );
    }
  }

  /**
   * Extract component CSS from the global optimized CSS
   */
  function generateComponentCssFromGlobal(
    sourceFile: string,
    mapping: FileMapping,
    globalCss: string
  ): void {
    const fullCssPath = path.join(rootDir, namespaceDir, mapping.cssFile);
    const cssDir = path.dirname(fullCssPath);

    // Ensure directory exists
    if (!fs.existsSync(cssDir)) {
      fs.mkdirSync(cssDir, { recursive: true });
    }

    // Get all class names used by this component
    const componentClassNames = new Set<string>();
    for (const classMapping of mapping.mappings) {
      componentClassNames.add(classMapping.generatedClassName);
    }

    // Extract only relevant parts from the global CSS
    const lines = globalCss.split("\n");
    let componentCss = `/* Generated for ${sourceFile} */\n\n`;
    let inRelevantRule = false;
    let currentRule = "";

    for (const line of lines) {
      // Check if this is a CSS rule that might contain our component's classes
      if (line.includes("{")) {
        // Extract selector part
        const selectorPart = line.split("{")[0].trim();
        // Check if any of our component's classes are in this selector
        const containsComponentClass = Array.from(componentClassNames).some(
          (className) => selectorPart.includes(`.${className}`)
        );

        if (containsComponentClass) {
          inRelevantRule = true;
          currentRule = line + "\n";
          continue;
        }
      }

      // If we're in a relevant rule, capture this line
      if (inRelevantRule) {
        currentRule += line + "\n";

        // Check if the rule ends on this line
        if (line.includes("}")) {
          inRelevantRule = false;
          componentCss += currentRule;
          currentRule = "";
        }
      }
    }

    // Write the component-specific CSS
    fs.writeFileSync(fullCssPath, componentCss, "utf8");
  }

  /**
   * Generate globally optimized CSS with cross-component selector grouping
   */
  function generateGlobalOptimizedCss(
    mappings: Map<string, FileMapping>
  ): string {
    let content =
      "/* Generated by tailwindcss-namespace with global optimization */\n\n";

    // Global utility tracking across all components
    const globalUtilityToClasses = new Map<string, Set<string>>();
    const globalClassDefinitions = new Map<string, string[]>();

    // First pass: collect all utility usage across all components
    for (const [, mapping] of mappings.entries()) {
      // content += `/* Styles for ${sourceFile} */\n\n`;

      for (const classMapping of mapping.mappings) {
        const className = classMapping.generatedClassName;
        const utilities = classMapping.originalClasses
          .split(/\s+/)
          .filter(Boolean);

        // Store the utility list for this class
        globalClassDefinitions.set(className, utilities);

        // Map each utility to the classes using it
        for (const utility of utilities) {
          if (!globalUtilityToClasses.has(utility)) {
            globalUtilityToClasses.set(utility, new Set());
          }
          globalUtilityToClasses.get(utility)!.add(className);
        }
      }
    }

    // Find utility groups - utilities that are used by the same set of classes
    const globalUtilityGroups = new Map<string, string[]>();

    for (const [utility, classes] of globalUtilityToClasses.entries()) {
      const classKey = Array.from(classes).sort().join(",");
      if (!globalUtilityGroups.has(classKey)) {
        globalUtilityGroups.set(classKey, []);
      }
      globalUtilityGroups.get(classKey)!.push(utility);
    }

    // Generate CSS with globally optimized selectors
    let css = "";
    const processedUtilityClasses = new Set<string>();

    // First output the groups with multiple classes
    for (const [classKey, utilities] of globalUtilityGroups.entries()) {
      const classes = classKey.split(",").filter(Boolean);

      // Skip if there's only one class or no utilities
      if (classes.length <= 1 || utilities.length === 0) continue;

      // Generate the CSS rule with multiple selectors
      css += classes.map((c) => `.${c}`).join(", ") + " {\n";
      for (const utility of utilities) {
        css += `  @apply ${utility};\n`;
      }
      css += "}\n\n";

      // Mark these utility-class combinations as processed
      for (const className of classes) {
        for (const utility of utilities) {
          processedUtilityClasses.add(`${className}:${utility}`);
        }
      }
    }

    // Then output any remaining unique utilities for each class
    for (const [className, utilities] of globalClassDefinitions.entries()) {
      const remainingUtilities = utilities.filter(
        (u) => !processedUtilityClasses.has(`${className}:${u}`)
      );

      if (remainingUtilities.length > 0) {
        css += `.${className} {\n`;
        for (const utility of remainingUtilities) {
          css += `  @apply ${utility};\n`;
        }
        css += "}\n\n";
      }
    }

    return content + css;
  }

  /**
   * Calculate content length excluding comments
   */
  function getContentLengthExcludingComments(content: string): number {
    // Remove all CSS comments
    const contentWithoutComments = content.replace(/\/\*[\s\S]*?\*\//g, "");
    // Remove empty lines
    const contentWithoutEmptyLines = contentWithoutComments.replace(
      /^\s*[\r\n]/gm,
      ""
    );
    return contentWithoutEmptyLines.length;
  }

  /**
   * Generate CSS content with specified optimization mode
   */
  function generateCssContent(
    mappings: Map<string, FileMapping>,
    optimize: boolean
  ): string {
    let content = "/* Generated by tailwindcss-namespace */\n\n";

    for (const [sourceFile, mapping] of mappings.entries()) {
      content += `/* Styles for ${sourceFile} */\n\n`;

      if (optimize) {
        // Generate optimized CSS with selector grouping
        content += generateOptimizedCss(mapping);
      } else {
        // Generate standard CSS with individual selectors
        content += generateStandardCss(mapping);
      }
    }

    return content;
  }

  /**
   * Generate individual component CSS file
   */
  function generateIndividualComponentCss(
    sourceFile: string,
    mapping: FileMapping,
    optimize: boolean
  ): void {
    const fullCssPath = path.join(rootDir, namespaceDir, mapping.cssFile);
    const cssDir = path.dirname(fullCssPath);

    // Ensure directory exists
    if (!fs.existsSync(cssDir)) {
      fs.mkdirSync(cssDir, { recursive: true });
    }

    // Generate CSS content header
    let cssContent = `/* Generated for ${sourceFile} */\n\n`;

    // Add CSS content based on optimization setting
    if (optimize) {
      cssContent += generateOptimizedCss(mapping);
    } else {
      cssContent += generateStandardCss(mapping);
    }

    // Write the individual file
    fs.writeFileSync(fullCssPath, cssContent, "utf8");
  }

  /**
   * Generate standard CSS with individual selectors
   */
  function generateStandardCss(mapping: FileMapping): string {
    let css = "";
    const processedClasses = new Set<string>();

    for (const classMapping of mapping.mappings) {
      const className = classMapping.generatedClassName;

      // Skip duplicates
      if (processedClasses.has(className)) continue;
      processedClasses.add(className);

      css += `.${className} {\n`;
      const classes = classMapping.originalClasses.split(/\s+/).filter(Boolean);

      for (const cls of classes) {
        css += `  @apply ${cls};\n`;
      }

      css += "}\n\n";
    }

    return css;
  }

  /**
   * Generate optimized CSS with grouped selectors
   */
  function generateOptimizedCss(mapping: FileMapping): string {
    // Build a map of utilities to the classes that use them
    const utilityToClasses = new Map<string, Set<string>>();
    const classDefinitions = new Map<string, string[]>();

    // For each class, record which utilities it uses
    for (const classMapping of mapping.mappings) {
      const className = classMapping.generatedClassName;
      const utilities = classMapping.originalClasses
        .split(/\s+/)
        .filter(Boolean);

      // Store the utility list for this class
      classDefinitions.set(className, utilities);

      // Map each utility to the classes using it
      for (const utility of utilities) {
        if (!utilityToClasses.has(utility)) {
          utilityToClasses.set(utility, new Set());
        }
        utilityToClasses.get(utility)!.add(className);
      }
    }

    // Find utility groups - utilities that are used by the same set of classes
    const utilityGroups = new Map<string, string[]>();

    for (const [utility, classes] of utilityToClasses.entries()) {
      const classKey = Array.from(classes).sort().join(",");
      if (!utilityGroups.has(classKey)) {
        utilityGroups.set(classKey, []);
      }
      utilityGroups.get(classKey)!.push(utility);
    }

    // Generate CSS with grouped selectors
    let css = "";
    const processedUtilityClasses = new Set<string>();

    // First output the groups with multiple classes
    for (const [classKey, utilities] of utilityGroups.entries()) {
      const classes = classKey.split(",").filter(Boolean);

      // Skip if there's only one class or no utilities
      if (classes.length <= 1 || utilities.length === 0) continue;

      // Generate the CSS rule with multiple selectors
      css += classes.map((c) => `.${c}`).join(", ") + " {\n";
      for (const utility of utilities) {
        css += `  @apply ${utility};\n`;
      }
      css += "}\n\n";

      // Mark these utility-class combinations as processed
      for (const className of classes) {
        for (const utility of utilities) {
          processedUtilityClasses.add(`${className}:${utility}`);
        }
      }
    }

    // Then output any remaining unique utilities for each class
    for (const [className, utilities] of classDefinitions.entries()) {
      const remainingUtilities = utilities.filter(
        (u) => !processedUtilityClasses.has(`${className}:${u}`)
      );

      if (remainingUtilities.length > 0) {
        css += `.${className} {\n`;
        for (const utility of remainingUtilities) {
          css += `  @apply ${utility};\n`;
        }
        css += "}\n\n";
      }
    }

    return css;
  }

  /**
   * Clean up redundant namespace versions by validating all mappings
   */
  function cleanupNamespaceVersions(): void {
    // Collect all namespaces and their class combinations
    const allNamespaces = new Map<string, Set<string>>();
    const allVersionedNamespaces = new Map<string, Map<number, Set<string>>>();

    // First pass: collect all namespace usage data
    for (const mapping of fileMappings.values()) {
      for (const classMapping of mapping.mappings) {
        const { namespace, normalizedClasses, generatedClassName } =
          classMapping;

        if (!namespace || !isValidCssIdentifier(namespace)) continue;

        // Check if this is a versioned namespace
        const match = generatedClassName.match(
          new RegExp(`^${namespace}-(\\d+)$`)
        );

        if (match) {
          // It's a versioned namespace
          const version = parseInt(match[1], 10);

          if (!allVersionedNamespaces.has(namespace)) {
            allVersionedNamespaces.set(namespace, new Map());
          }

          if (!allVersionedNamespaces.get(namespace)!.has(version)) {
            allVersionedNamespaces.get(namespace)!.set(version, new Set());
          }

          allVersionedNamespaces
            .get(namespace)!
            .get(version)!
            .add(normalizedClasses);
        } else {
          // It's a base namespace
          if (!allNamespaces.has(namespace)) {
            allNamespaces.set(namespace, new Set());
          }

          allNamespaces.get(namespace)!.add(normalizedClasses);
        }
      }
    }

    // Reset our namespace tracking state
    namespaceToClasses.clear();
    namespaceVersions.clear();

    // Rebuild namespace tracking state with validated data
    for (const [namespace, classes] of allNamespaces.entries()) {
      namespaceToClasses.set(namespace, classes);

      // Find highest version for this namespace
      let maxVersion = 0;
      if (allVersionedNamespaces.has(namespace)) {
        maxVersion = Math.max(
          ...Array.from(allVersionedNamespaces.get(namespace)!.keys())
        );
      }

      namespaceVersions.set(namespace, maxVersion);

      // Also add the versioned namespaces
      if (allVersionedNamespaces.has(namespace)) {
        for (const [version, classes] of allVersionedNamespaces
          .get(namespace)!
          .entries()) {
          const versionedNamespace = `${namespace}-${version}`;
          namespaceToClasses.set(versionedNamespace, classes);
        }
      }
    }
  }

  /**
   * Normalize a class string by sorting and removing duplicates
   */
  function normalizeClassString(classStr: string): string {
    return classStr.split(/\s+/).filter(Boolean).sort().join(" ");
  }

  /**
   * Check if a string is a valid CSS identifier
   */
  function isValidCssIdentifier(str: string): boolean {
    return /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(str);
  }

  /**
   * Scan all source files to capture styles before build
   */
  async function scanAllSourceFiles() {
    const sourceDir = path.join(rootDir, "src");

    try {
      // Read all files in the source directory with supported extensions
      const files = await recursiveReadDir(sourceDir, (file) =>
        extensions.some((ext) => file.endsWith(ext))
      );

      // Process each file to extract class information
      for (const file of files) {
        try {
          const relativePath = path.relative(rootDir, file);
          const content = fs.readFileSync(file, "utf8");
          const { changed, mappings } = processFile(content, file);

          if (changed && mappings.length > 0) {
            // Store file mapping
            fileMappings.set(relativePath, {
              sourceFile: relativePath,
              cssFile: getCssFilePathForSource(relativePath),
              mappings,
            });
          }
        } catch (err) {
          console.error(
            `Error processing file ${file} during pre-build scan:`,
            err
          );
        }
      }

      // Generate CSS files after scanning all source files
      updateCssFiles();
    } catch (err) {
      console.error("Error scanning source files:", err);
    }
  }

  /**
   * Helper function to recursively read directory
   */
  async function recursiveReadDir(
    dir: string,
    filter: (file: string) => boolean
  ): Promise<string[]> {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = await Promise.all(
      dirents.map((dirent) => {
        const res = path.join(dir, dirent.name);
        return dirent.isDirectory() ? recursiveReadDir(res, filter) : res;
      })
    );

    return files.flat().filter(filter);
  }

  /**
   * Create a Tailwind safelist file to ensure Tailwind only processes our generated CSS
   */
  function createTailwindSafelist(): void {
    const safelistPath = path.join(
      rootDir,
      namespaceDir,
      "tailwind-safelist.css"
    );

    // Create a file that will be processed by Tailwind but only includes our generated classes
    const content = `/* Tailwind safelist - forces processing only our namespaced classes */\n
/* This file is used to ensure Tailwind only processes our generated CSS */\n
@import "./tw-namespace.css";\n
/* Explicitly set content to be ignored */\n
/* @tailwind base is applied directly in our generated CSS */\n`;

    fs.writeFileSync(safelistPath, content, "utf8");
  }
}
