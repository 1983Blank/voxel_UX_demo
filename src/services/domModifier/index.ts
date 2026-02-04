/**
 * DOM Modifier Service
 *
 * Applies modification instructions to source DOM, producing modified HTML.
 * Supports:
 * - Core DOM operations (update, insert, remove, style)
 * - Component injection from extracted library
 * - Design token application
 * - Multi-file/screen output with navigation
 */

import type {
  Modification,
  ModificationSpec,
  ModificationResult,
  ModificationError,
  ScreenModification,
  ExtractedComponentForTools,
  DesignToken,
  PrototypeBundle,
  NavigationConfig,
} from '@/types/toolSchema';

import { executeOperation } from './operations';
import {
  injectComponent,
  injectGenericComponent,
  isComponentInsertionTool,
  isGenericComponentTool,
} from './componentInjector';
import { executeStyleOperation, createTokenMap, isStyleTool } from './styleApplicator';
import {
  buildNavigationManifest,
  buildPrototypeBundle,
  executeScreenOperation,
  isScreenTool,
  extractNavigationConfig,
} from './multiFileBuilder';

// Re-export sub-modules
export * from './operations';
export * from './componentInjector';
export * from './styleApplicator';
export * from './multiFileBuilder';

/**
 * Parse HTML into a Document (browser or server-side)
 */
function parseHTML(html: string): Document {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }
  // For server-side, throw error - need linkedom or similar
  throw new Error('DOM parsing not available. Use linkedom for server-side.');
}

/**
 * Serialize Document back to HTML string
 */
function serializeDOM(doc: Document): string {
  if (doc.documentElement) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
  }
  return doc.body?.innerHTML || '';
}

/**
 * Strip all script tags from HTML to prevent errors from source page scripts
 * Uses regex for reliability with SingleFile captures and complex HTML
 */
export function stripScripts(html: string): string {
  let result = html;
  let scriptCount = 0;
  let noscriptCount = 0;
  let eventHandlerCount = 0;

  // Count and remove script tags (including with attributes)
  // Match <script...>...</script> including multiline content
  const scriptMatches = result.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
  scriptCount = scriptMatches?.length || 0;
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // Remove noscript tags
  const noscriptMatches = result.match(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi);
  noscriptCount = noscriptMatches?.length || 0;
  result = result.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Remove inline event handlers (onclick, onload, onerror, etc.)
  // Match on* attributes with their values
  const beforeEventStrip = result.length;
  result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  result = result.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, ''); // unquoted handlers
  eventHandlerCount = Math.round((beforeEventStrip - result.length) / 20); // rough estimate

  // Remove javascript: URLs in href/src attributes
  result = result.replace(/\s+href\s*=\s*["']javascript:[^"']*["']/gi, ' href="#"');
  result = result.replace(/\s+src\s*=\s*["']javascript:[^"']*["']/gi, '');

  console.log(`[domModifier] Stripped ${scriptCount} scripts, ${noscriptCount} noscripts, ~${eventHandlerCount} event handlers`);
  console.log(`[domModifier] HTML size: ${html.length} -> ${result.length} bytes (${Math.round((1 - result.length/html.length) * 100)}% reduction)`);

  return result;
}

/**
 * Apply a single modification to a document
 */
function applySingleModification(
  doc: Document,
  mod: Modification,
  componentMap: Map<string, ExtractedComponentForTools>,
  tokenMap: Map<string, string>,
  screens: Map<string, string>
): { success: boolean; error?: string } {
  const { tool } = mod;

  // Screen management tools
  if (isScreenTool(tool)) {
    const result = executeScreenOperation(doc, mod, screens);
    return { success: result.success, error: result.error };
  }

  // Style tools
  if (isStyleTool(tool)) {
    const result = executeStyleOperation(doc, mod, tokenMap);
    return { success: result.success, error: result.error };
  }

  // Component insertion tools
  if (isComponentInsertionTool(tool)) {
    if (isGenericComponentTool(tool)) {
      const result = injectGenericComponent(doc, mod);
      return { success: result.success, error: result.error };
    } else {
      const result = injectComponent(doc, mod, componentMap);
      return { success: result.success, error: result.error };
    }
  }

  // Core DOM operations
  const result = executeOperation(doc, mod);
  return { success: result.success, error: result.error };
}

/**
 * Apply all modifications for a single screen
 */
function applyScreenModifications(
  sourceHtml: string,
  modifications: Modification[],
  componentMap: Map<string, ExtractedComponentForTools>,
  tokenMap: Map<string, string>,
  screens: Map<string, string>
): { html: string; errors: ModificationError[] } {
  const doc = parseHTML(sourceHtml);
  const errors: ModificationError[] = [];

  for (let i = 0; i < modifications.length; i++) {
    const mod = modifications[i];
    const result = applySingleModification(doc, mod, componentMap, tokenMap, screens);

    if (!result.success) {
      errors.push({
        screenId: '', // Will be filled in by caller
        modificationIndex: i,
        tool: mod.tool,
        selector: mod.selector,
        message: result.error || 'Unknown error',
        recoverable: true,
      });
    }
  }

  return {
    html: serializeDOM(doc),
    errors,
  };
}

/**
 * Apply all modifications from a specification to source HTML
 */
export async function applyModifications(
  sourceHtml: string,
  spec: ModificationSpec,
  components: ExtractedComponentForTools[] = [],
  tokens: DesignToken[] = []
): Promise<ModificationResult> {
  // Build lookup maps
  const componentMap = new Map(components.map(c => [c.id, c]));
  const tokenMap = createTokenMap(tokens);

  const screens = new Map<string, string>();
  const allErrors: ModificationError[] = [];

  // Process each screen in the specification
  for (const screenMod of spec.screens) {
    const { screenId, sourceScreenId, modifications } = screenMod;

    // Determine starting HTML for this screen
    let startingHtml: string;
    if (sourceScreenId && screens.has(sourceScreenId)) {
      // Copy from another screen
      startingHtml = screens.get(sourceScreenId)!;
    } else if (sourceScreenId === undefined && screens.size === 0) {
      // First screen, use source HTML
      startingHtml = sourceHtml;
    } else if (sourceScreenId) {
      // Source screen not found yet, use original source
      startingHtml = sourceHtml;
    } else {
      // New screen based on original source
      startingHtml = sourceHtml;
    }

    // Apply modifications
    const { html, errors } = applyScreenModifications(
      startingHtml,
      modifications,
      componentMap,
      tokenMap,
      screens
    );

    // Update errors with screen ID
    for (const error of errors) {
      error.screenId = screenId;
      allErrors.push(error);
    }

    // Store the modified screen
    screens.set(screenId, html);
  }

  // Build navigation manifest
  const navigationConfig = spec.navigation || extractNavigationFromSpec(spec);
  const navigation = buildNavigationManifest(navigationConfig, screens);

  return {
    screens,
    navigation,
    assets: [],
    errors: allErrors,
  };
}

/**
 * Extract navigation config from all screen modifications
 */
function extractNavigationFromSpec(spec: ModificationSpec): NavigationConfig {
  const allModifications: Modification[] = [];
  for (const screen of spec.screens) {
    allModifications.push(...screen.modifications);
  }
  return extractNavigationConfig(allModifications);
}

/**
 * Build complete prototype bundle from modification result
 */
export function buildBundle(
  result: ModificationResult,
  spec: ModificationSpec
): PrototypeBundle {
  return buildPrototypeBundle(result.screens, result.navigation, spec);
}

/**
 * Apply modifications and return complete bundle
 */
export async function generatePrototypeBundle(
  sourceHtml: string,
  spec: ModificationSpec,
  components: ExtractedComponentForTools[] = [],
  tokens: DesignToken[] = []
): Promise<{
  bundle: PrototypeBundle;
  errors: ModificationError[];
}> {
  const result = await applyModifications(sourceHtml, spec, components, tokens);
  const bundle = buildBundle(result, spec);

  return {
    bundle,
    errors: result.errors,
  };
}

/**
 * Validate a modification specification
 */
export function validateSpec(spec: ModificationSpec): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!spec.screens || spec.screens.length === 0) {
    errors.push('Specification must have at least one screen');
  }

  const screenIds = new Set<string>();
  for (const screen of spec.screens) {
    if (!screen.screenId) {
      errors.push('Each screen must have a screenId');
    }

    if (screenIds.has(screen.screenId)) {
      errors.push(`Duplicate screenId: ${screen.screenId}`);
    }
    screenIds.add(screen.screenId);

    // Validate modifications
    for (let i = 0; i < screen.modifications.length; i++) {
      const mod = screen.modifications[i];

      if (!mod.tool) {
        errors.push(`Screen ${screen.screenId}, modification ${i}: missing tool name`);
      }

      // Check selector for operations that need it
      const needsSelector = [
        'update_text', 'update_html', 'update_attribute', 'add_class',
        'remove_class', 'remove_element', 'add_element', 'apply_style',
      ];
      if (needsSelector.includes(mod.tool) && !mod.selector) {
        errors.push(`Screen ${screen.screenId}, modification ${i}: ${mod.tool} requires selector`);
      }
    }
  }

  // Validate navigation if present
  if (spec.navigation) {
    for (const route of spec.navigation.routes) {
      if (!screenIds.has(route.screenId)) {
        errors.push(`Route references unknown screen: ${route.screenId}`);
      }
    }

    if (spec.navigation.defaultScreen && !screenIds.has(spec.navigation.defaultScreen)) {
      errors.push(`Default screen not found: ${spec.navigation.defaultScreen}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a minimal modification spec for a single screen
 */
export function createSingleScreenSpec(
  screenId: string,
  modifications: Modification[]
): ModificationSpec {
  return {
    screens: [{
      screenId,
      modifications,
    }],
  };
}

/**
 * Merge two modification specs
 */
export function mergeSpecs(
  base: ModificationSpec,
  additions: ModificationSpec
): ModificationSpec {
  const screenMap = new Map<string, ScreenModification>();

  // Add base screens
  for (const screen of base.screens) {
    screenMap.set(screen.screenId, { ...screen });
  }

  // Merge/add new screens
  for (const screen of additions.screens) {
    if (screenMap.has(screen.screenId)) {
      // Append modifications
      const existing = screenMap.get(screen.screenId)!;
      existing.modifications = [
        ...existing.modifications,
        ...screen.modifications,
      ];
    } else {
      screenMap.set(screen.screenId, { ...screen });
    }
  }

  // Merge navigation
  const navigation: NavigationConfig = {
    routes: [
      ...(base.navigation?.routes || []),
      ...(additions.navigation?.routes || []),
    ],
    defaultScreen: additions.navigation?.defaultScreen || base.navigation?.defaultScreen || 'main',
    defaultTransition: additions.navigation?.defaultTransition || base.navigation?.defaultTransition,
  };

  return {
    screens: Array.from(screenMap.values()),
    navigation,
    sharedState: additions.sharedState || base.sharedState,
    metadata: {
      ...base.metadata,
      ...additions.metadata,
    },
  };
}
