/**
 * Design Token Extraction Service
 * Uses LLM vision to classify design tokens with semantic names
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface RawToken {
  type: 'color' | 'typography' | 'spacing' | 'border-radius' | 'shadow';
  value: string;
  count: number;
}

export interface ClassifiedToken {
  type: 'color' | 'typography' | 'spacing' | 'border-radius' | 'shadow';
  value: string;
  name: string;
  category: string;
  subcategory?: string;
  description: string;
  usageCount: number;
  cssVariable?: string;
}

interface ExtractResponse {
  success: boolean;
  tokens?: ClassifiedToken[];
  error?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
}

/**
 * Extract raw tokens from HTML (colors, typography, spacing, etc.)
 */
export function extractRawTokensFromHtml(html: string): RawToken[] {
  const tokens: RawToken[] = [];

  // Extract colors (hex, rgb, hsl - excluding CSS variable references)
  const colorRegex = /#([0-9A-Fa-f]{6})\b|#([0-9A-Fa-f]{3})\b|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/gi;
  const colorCounts = new Map<string, number>();

  let match;
  while ((match = colorRegex.exec(html)) !== null) {
    const color = normalizeColor(match[0]);
    if (color) {
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    }
  }

  colorCounts.forEach((count, color) => {
    if (count >= 2) {
      tokens.push({ type: 'color', value: color, count });
    }
  });

  // Extract font families
  const fontFamilyRegex = /font-family:\s*([^;}"']+)/gi;
  const fontFamilies = new Map<string, number>();

  while ((match = fontFamilyRegex.exec(html)) !== null) {
    const family = match[1].trim().replace(/["']/g, '').split(',')[0].trim();
    if (family && !family.includes('var(') && family.length > 1) {
      fontFamilies.set(family, (fontFamilies.get(family) || 0) + 1);
    }
  }

  fontFamilies.forEach((count, family) => {
    tokens.push({ type: 'typography', value: family, count });
  });

  // Extract font sizes
  const fontSizeRegex = /font-size:\s*([\d.]+(?:px|rem|em))/gi;
  const fontSizes = new Map<string, number>();

  while ((match = fontSizeRegex.exec(html)) !== null) {
    const size = match[1].toLowerCase();
    fontSizes.set(size, (fontSizes.get(size) || 0) + 1);
  }

  fontSizes.forEach((count, size) => {
    if (count >= 2) {
      tokens.push({ type: 'typography', value: size, count });
    }
  });

  // Extract spacing (padding, margin, gap)
  const spacingRegex = /(?:padding|margin|gap)(?:-(?:top|right|bottom|left))?:\s*([\d.]+(?:px|rem|em))/gi;
  const spacingValues = new Map<string, number>();

  while ((match = spacingRegex.exec(html)) !== null) {
    const value = match[1].toLowerCase();
    if (value !== '0' && value !== '0px') {
      spacingValues.set(value, (spacingValues.get(value) || 0) + 1);
    }
  }

  spacingValues.forEach((count, value) => {
    if (count >= 2) {
      tokens.push({ type: 'spacing', value, count });
    }
  });

  // Extract border radius
  const borderRadiusRegex = /border-radius:\s*([\d.]+(?:px|rem|em|%))/gi;
  const radiusValues = new Map<string, number>();

  while ((match = borderRadiusRegex.exec(html)) !== null) {
    const value = match[1].toLowerCase();
    if (value !== '0' && value !== '0px') {
      radiusValues.set(value, (radiusValues.get(value) || 0) + 1);
    }
  }

  radiusValues.forEach((count, value) => {
    tokens.push({ type: 'border-radius', value, count });
  });

  // Extract box shadows
  const boxShadowRegex = /box-shadow:\s*([^;}"]+)/gi;
  const shadowValues = new Map<string, number>();

  while ((match = boxShadowRegex.exec(html)) !== null) {
    const value = match[1].trim();
    if (value !== 'none' && !value.includes('var(')) {
      shadowValues.set(value, (shadowValues.get(value) || 0) + 1);
    }
  }

  shadowValues.forEach((count, value) => {
    tokens.push({ type: 'shadow', value, count });
  });

  // Sort by count and limit
  return tokens
    .sort((a, b) => b.count - a.count)
    .slice(0, 50); // Limit to 50 tokens for LLM context
}

/**
 * Normalize color to hex format
 */
function normalizeColor(color: string): string | null {
  const lower = color.toLowerCase().trim();

  // Skip CSS variables
  if (lower.includes('var(')) return null;

  // Already hex
  if (lower.startsWith('#')) {
    // Convert 3-digit to 6-digit
    if (lower.length === 4) {
      return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`;
    }
    return lower.length === 7 ? lower : null;
  }

  // RGB/RGBA
  const rgbMatch = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const toHex = (n: string) => parseInt(n).toString(16).padStart(2, '0');
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }

  return null;
}

/**
 * Call the LLM edge function to classify tokens
 */
export async function classifyTokensWithLLM(
  screenId: string,
  screenName: string,
  screenshotBase64: string,
  rawTokens: RawToken[],
  options?: {
    provider?: 'anthropic' | 'openai' | 'google';
    model?: string;
  }
): Promise<ClassifiedToken[]> {
  if (!isSupabaseConfigured()) {
    console.warn('[DesignTokenExtraction] Supabase not configured');
    return [];
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  console.log('[DesignTokenExtraction] Calling extract-design-tokens function');
  console.log('[DesignTokenExtraction] Raw tokens:', rawTokens.length);

  const { data, error } = await supabase.functions.invoke<ExtractResponse>(
    'extract-design-tokens',
    {
      body: {
        screenId,
        screenName,
        screenshotBase64,
        rawTokens,
        provider: options?.provider,
        model: options?.model,
      },
    }
  );

  if (error) {
    console.error('[DesignTokenExtraction] Function error:', error);
    throw error;
  }

  if (!data?.success) {
    console.error('[DesignTokenExtraction] Extraction failed:', data?.error);
    throw new Error(data?.error || 'Token extraction failed');
  }

  console.log('[DesignTokenExtraction] Classified', data.tokens?.length, 'tokens');
  console.log('[DesignTokenExtraction] Provider:', data.provider, 'Model:', data.model);
  console.log('[DesignTokenExtraction] Duration:', data.durationMs, 'ms');

  return data.tokens || [];
}

/**
 * Check if LLM extraction is available (user has API key configured)
 */
export async function isLLMExtractionAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { data: keyConfigs } = await supabase
      .from('user_api_key_refs')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .limit(1);

    return (keyConfigs?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
