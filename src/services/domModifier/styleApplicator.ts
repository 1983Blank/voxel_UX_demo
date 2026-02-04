/**
 * Style Applicator - Applies design token styles to elements
 *
 * Resolves token names to CSS values and applies them to elements.
 */

import type { DesignToken, Modification } from '@/types/toolSchema';
import type { OperationResult } from './operations';

/**
 * Style property mapping from tool params to CSS properties
 */
const STYLE_PROPERTY_MAP: Record<string, string> = {
  backgroundColor: 'background-color',
  textColor: 'color',
  borderColor: 'border-color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  padding: 'padding',
  margin: 'margin',
  gap: 'gap',
  borderRadius: 'border-radius',
  boxShadow: 'box-shadow',
  border: 'border',
};

/**
 * Resolve a token name to its CSS value
 */
export function resolveToken(
  tokenName: string,
  tokenMap: Map<string, string>
): string | undefined {
  return tokenMap.get(tokenName);
}

/**
 * Create token map from design tokens array
 */
export function createTokenMap(tokens: DesignToken[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const token of tokens) {
    map.set(token.name, token.value);
    // Also store with CSS variable if available
    if (token.cssVariable) {
      map.set(token.cssVariable, `var(${token.cssVariable})`);
    }
  }
  return map;
}

/**
 * Apply style from apply_style tool
 */
export function applyStyle(
  element: Element,
  params: Record<string, unknown>,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    for (const [param, value] of Object.entries(params)) {
      if (param === 'selector' || value === null || value === undefined) continue;

      const cssProperty = STYLE_PROPERTY_MAP[param];
      if (!cssProperty) continue;

      // Try to resolve as token first
      const tokenValue = typeof value === 'string'
        ? resolveToken(value, tokenMap)
        : undefined;

      const cssValue = tokenValue || String(value);
      htmlEl.style.setProperty(cssProperty, cssValue);
    }

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply text color
 */
export function applyTextColor(
  element: Element,
  colorName: string,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const value = resolveToken(colorName, tokenMap) || colorName;
    (element as HTMLElement).style.color = value;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply background color
 */
export function applyBackgroundColor(
  element: Element,
  colorName: string,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const value = resolveToken(colorName, tokenMap) || colorName;
    (element as HTMLElement).style.backgroundColor = value;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply font family
 */
export function applyFontFamily(
  element: Element,
  fontName: string,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const value = resolveToken(fontName, tokenMap) || fontName;
    (element as HTMLElement).style.fontFamily = value;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply font size
 */
export function applyFontSize(
  element: Element,
  sizeName: string,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const value = resolveToken(sizeName, tokenMap) || sizeName;
    (element as HTMLElement).style.fontSize = value;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply padding with directional support
 */
export function applyPadding(
  element: Element,
  params: Record<string, unknown>,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    if (params.all) {
      const value = resolveToken(String(params.all), tokenMap) || String(params.all);
      htmlEl.style.padding = value;
    }

    if (params.x) {
      const value = resolveToken(String(params.x), tokenMap) || String(params.x);
      htmlEl.style.paddingLeft = value;
      htmlEl.style.paddingRight = value;
    }

    if (params.y) {
      const value = resolveToken(String(params.y), tokenMap) || String(params.y);
      htmlEl.style.paddingTop = value;
      htmlEl.style.paddingBottom = value;
    }

    if (params.top) {
      const value = resolveToken(String(params.top), tokenMap) || String(params.top);
      htmlEl.style.paddingTop = value;
    }
    if (params.right) {
      const value = resolveToken(String(params.right), tokenMap) || String(params.right);
      htmlEl.style.paddingRight = value;
    }
    if (params.bottom) {
      const value = resolveToken(String(params.bottom), tokenMap) || String(params.bottom);
      htmlEl.style.paddingBottom = value;
    }
    if (params.left) {
      const value = resolveToken(String(params.left), tokenMap) || String(params.left);
      htmlEl.style.paddingLeft = value;
    }

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply margin with directional support
 */
export function applyMargin(
  element: Element,
  params: Record<string, unknown>,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    if (params.all) {
      const value = resolveToken(String(params.all), tokenMap) || String(params.all);
      htmlEl.style.margin = value;
    }

    if (params.x) {
      const value = resolveToken(String(params.x), tokenMap) || String(params.x);
      htmlEl.style.marginLeft = value;
      htmlEl.style.marginRight = value;
    }

    if (params.y) {
      const value = resolveToken(String(params.y), tokenMap) || String(params.y);
      htmlEl.style.marginTop = value;
      htmlEl.style.marginBottom = value;
    }

    if (params.top) {
      const value = resolveToken(String(params.top), tokenMap) || String(params.top);
      htmlEl.style.marginTop = value;
    }
    if (params.right) {
      const value = resolveToken(String(params.right), tokenMap) || String(params.right);
      htmlEl.style.marginRight = value;
    }
    if (params.bottom) {
      const value = resolveToken(String(params.bottom), tokenMap) || String(params.bottom);
      htmlEl.style.marginBottom = value;
    }
    if (params.left) {
      const value = resolveToken(String(params.left), tokenMap) || String(params.left);
      htmlEl.style.marginLeft = value;
    }

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply gap (for flex/grid containers)
 */
export function applyGap(
  element: Element,
  gapName: string,
  tokenMap: Map<string, string>
): OperationResult {
  try {
    const value = resolveToken(gapName, tokenMap) || gapName;
    (element as HTMLElement).style.gap = value;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply layout styles
 */
export function applyLayout(
  element: Element,
  params: Record<string, unknown>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    if (params.display) {
      htmlEl.style.display = String(params.display);
    }
    if (params.flexDirection) {
      htmlEl.style.flexDirection = String(params.flexDirection);
    }
    if (params.justifyContent) {
      htmlEl.style.justifyContent = String(params.justifyContent);
    }
    if (params.alignItems) {
      htmlEl.style.alignItems = String(params.alignItems);
    }
    if (params.flexWrap) {
      htmlEl.style.flexWrap = String(params.flexWrap);
    }
    if (params.gridTemplateColumns) {
      htmlEl.style.gridTemplateColumns = String(params.gridTemplateColumns);
    }
    if (params.gridTemplateRows) {
      htmlEl.style.gridTemplateRows = String(params.gridTemplateRows);
    }

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply sizing styles
 */
export function applySize(
  element: Element,
  params: Record<string, unknown>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    if (params.width) htmlEl.style.width = String(params.width);
    if (params.height) htmlEl.style.height = String(params.height);
    if (params.minWidth) htmlEl.style.minWidth = String(params.minWidth);
    if (params.maxWidth) htmlEl.style.maxWidth = String(params.maxWidth);
    if (params.minHeight) htmlEl.style.minHeight = String(params.minHeight);
    if (params.maxHeight) htmlEl.style.maxHeight = String(params.maxHeight);

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Apply positioning styles
 */
export function applyPosition(
  element: Element,
  params: Record<string, unknown>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;

    if (params.position) htmlEl.style.position = String(params.position);
    if (params.top) htmlEl.style.top = String(params.top);
    if (params.right) htmlEl.style.right = String(params.right);
    if (params.bottom) htmlEl.style.bottom = String(params.bottom);
    if (params.left) htmlEl.style.left = String(params.left);
    if (params.zIndex !== undefined) htmlEl.style.zIndex = String(params.zIndex);

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Execute a style operation based on modification instruction
 */
export function executeStyleOperation(
  doc: Document,
  mod: Modification,
  tokenMap: Map<string, string>
): OperationResult {
  const { tool, selector, params } = mod;

  if (!selector) {
    return { success: false, error: 'Selector required for style operation' };
  }

  const element = doc.querySelector(selector);
  if (!element) {
    return { success: false, error: `Element not found: ${selector}` };
  }

  switch (tool) {
    case 'apply_style':
      return applyStyle(element, params, tokenMap);

    case 'apply_text_color':
      return applyTextColor(element, params.color as string, tokenMap);

    case 'apply_background_color':
      return applyBackgroundColor(element, params.color as string, tokenMap);

    case 'apply_font_family':
      return applyFontFamily(element, params.font as string, tokenMap);

    case 'apply_font_size':
      return applyFontSize(element, params.size as string, tokenMap);

    case 'apply_padding':
      return applyPadding(element, params, tokenMap);

    case 'apply_margin':
      return applyMargin(element, params, tokenMap);

    case 'apply_gap':
      return applyGap(element, params.gap as string, tokenMap);

    case 'apply_layout':
      return applyLayout(element, params);

    case 'apply_size':
      return applySize(element, params);

    case 'apply_position':
      return applyPosition(element, params);

    default:
      return { success: false, error: `Unknown style operation: ${tool}` };
  }
}

/**
 * Check if a tool name is a style operation
 */
export function isStyleTool(toolName: string): boolean {
  return toolName.startsWith('apply_') || toolName === 'set_style';
}
