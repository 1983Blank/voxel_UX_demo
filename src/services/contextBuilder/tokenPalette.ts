/**
 * Token Palette - Builds design token context for LLM prompts
 *
 * Creates a formatted palette of available design tokens that
 * the LLM can reference when applying styles.
 */

import type {
  DesignToken,
  TokenCategory,
  TokenPalette,
} from '@/types/toolSchema';

/**
 * Group tokens by category
 */
export function createTokenPalette(tokens: DesignToken[]): TokenPalette {
  const palette: TokenPalette = {
    colors: [],
    fonts: [],
    spacing: [],
    radius: [],
    shadows: [],
    borders: [],
    animations: [],
  };

  for (const token of tokens) {
    switch (token.category) {
      case 'color':
        palette.colors.push(token);
        break;
      case 'font':
        palette.fonts.push(token);
        break;
      case 'spacing':
        palette.spacing.push(token);
        break;
      case 'radius':
        palette.radius.push(token);
        break;
      case 'shadow':
        palette.shadows.push(token);
        break;
      case 'border':
        palette.borders.push(token);
        break;
      case 'animation':
        palette.animations.push(token);
        break;
    }
  }

  return palette;
}

/**
 * Format a color token for display
 */
function formatColorToken(token: DesignToken): string {
  // Check if it's a hex color
  const isHex = /^#[0-9a-f]{3,8}$/i.test(token.value);
  const preview = isHex ? ` ██` : '';
  return `${token.name}: ${token.value}${preview}`;
}

/**
 * Format a generic token for display
 */
function formatToken(token: DesignToken): string {
  let line = `${token.name}: ${token.value}`;
  if (token.cssVariable) {
    line += ` (var(${token.cssVariable}))`;
  }
  return line;
}

/**
 * Generate token palette section for system prompt
 */
export function generatePalettePrompt(tokens: DesignToken[]): string {
  const palette = createTokenPalette(tokens);
  const lines: string[] = ['## Design Tokens', ''];

  // Colors
  if (palette.colors.length > 0) {
    lines.push('### Colors');
    lines.push('Use these color tokens for text, background, and border colors:');
    for (const token of palette.colors) {
      lines.push(`- ${formatColorToken(token)}`);
    }
    lines.push('');
  }

  // Typography
  if (palette.fonts.length > 0) {
    lines.push('### Typography');
    lines.push('Font families and sizes:');
    for (const token of palette.fonts) {
      lines.push(`- ${formatToken(token)}`);
    }
    lines.push('');
  }

  // Spacing
  if (palette.spacing.length > 0) {
    lines.push('### Spacing');
    lines.push('Use for padding, margin, and gap:');
    for (const token of palette.spacing) {
      lines.push(`- ${formatToken(token)}`);
    }
    lines.push('');
  }

  // Border radius
  if (palette.radius.length > 0) {
    lines.push('### Border Radius');
    for (const token of palette.radius) {
      lines.push(`- ${formatToken(token)}`);
    }
    lines.push('');
  }

  // Shadows
  if (palette.shadows.length > 0) {
    lines.push('### Shadows');
    for (const token of palette.shadows) {
      lines.push(`- ${formatToken(token)}`);
    }
    lines.push('');
  }

  // Borders
  if (palette.borders.length > 0) {
    lines.push('### Borders');
    for (const token of palette.borders) {
      lines.push(`- ${formatToken(token)}`);
    }
    lines.push('');
  }

  if (lines.length === 2) {
    // No tokens
    return `## Design Tokens

No design tokens defined. Use CSS values directly in style tools.
`;
  }

  return lines.join('\n');
}

/**
 * Generate compact token reference
 */
export function generateCompactPalette(
  tokens: DesignToken[],
  maxPerCategory: number = 10
): string {
  const palette = createTokenPalette(tokens);
  const lines: string[] = [];

  const categories: Array<{ name: string; tokens: DesignToken[] }> = [
    { name: 'colors', tokens: palette.colors },
    { name: 'fonts', tokens: palette.fonts },
    { name: 'spacing', tokens: palette.spacing },
    { name: 'radius', tokens: palette.radius },
    { name: 'shadows', tokens: palette.shadows },
  ];

  for (const { name, tokens: catTokens } of categories) {
    if (catTokens.length === 0) continue;

    const limited = catTokens.slice(0, maxPerCategory);
    const names = limited.map(t => t.name);

    lines.push(`${name}: ${names.join(', ')}`);

    if (catTokens.length > maxPerCategory) {
      lines[lines.length - 1] += ` (+${catTokens.length - maxPerCategory} more)`;
    }
  }

  return lines.join('\n') || 'No design tokens defined.';
}

/**
 * Find tokens by category
 */
export function getTokensByCategory(
  tokens: DesignToken[],
  category: TokenCategory
): DesignToken[] {
  return tokens.filter(t => t.category === category);
}

/**
 * Find token by name
 */
export function findToken(
  tokens: DesignToken[],
  name: string
): DesignToken | undefined {
  return tokens.find(t => t.name === name);
}

/**
 * Get token value (resolves CSS variables if needed)
 */
export function getTokenValue(token: DesignToken): string {
  return token.value;
}

/**
 * Convert token name to CSS variable reference
 */
export function tokenToCSSVar(token: DesignToken): string {
  if (token.cssVariable) {
    return `var(${token.cssVariable})`;
  }
  // Generate CSS variable name from token name
  const varName = `--${token.category}-${token.name}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  return `var(${varName}, ${token.value})`;
}

/**
 * Generate CSS variables block from tokens
 */
export function generateCSSVariables(tokens: DesignToken[]): string {
  const lines: string[] = [':root {'];

  for (const token of tokens) {
    const varName = token.cssVariable ||
      `--${token.category}-${token.name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    lines.push(`  ${varName}: ${token.value};`);
  }

  lines.push('}');
  return lines.join('\n');
}

/**
 * Check if palette has sufficient tokens for design system compliance
 */
export function isPaletteComplete(palette: TokenPalette): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (palette.colors.length === 0) missing.push('colors');
  if (palette.fonts.length === 0) missing.push('fonts');
  if (palette.spacing.length === 0) missing.push('spacing');

  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Suggest semantic token names based on values
 */
export function suggestTokenName(
  _value: string,
  category: TokenCategory,
  existingTokens: DesignToken[]
): string {
  const existingNames = new Set(existingTokens.map(t => t.name));

  // Base suggestions by category
  const baseSuggestions: Record<TokenCategory, string[]> = {
    color: ['primary', 'secondary', 'accent', 'background', 'text', 'border', 'error', 'success', 'warning'],
    font: ['heading', 'body', 'mono', 'small', 'large'],
    spacing: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'],
    radius: ['none', 'sm', 'md', 'lg', 'full'],
    shadow: ['sm', 'md', 'lg', 'xl'],
    border: ['thin', 'medium', 'thick'],
    animation: ['fast', 'normal', 'slow'],
  };

  const suggestions = baseSuggestions[category] || [];

  for (const suggestion of suggestions) {
    if (!existingNames.has(suggestion)) {
      return suggestion;
    }
  }

  // Fallback: use numbered name
  let i = 1;
  while (existingNames.has(`${category}-${i}`)) {
    i++;
  }
  return `${category}-${i}`;
}
