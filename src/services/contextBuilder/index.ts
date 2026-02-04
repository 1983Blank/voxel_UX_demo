/**
 * Context Builder Service
 *
 * Builds optimized LLM context for prototype generation including:
 * - Source DOM summary with selector hints
 * - Component catalog with descriptions and props
 * - Design token palette
 * - Tool schema integration
 */

import type {
  PrototypeContext,
  ExtractedComponentForTools,
  DesignToken,
  DOMSummary,
  ToolDefinition,
} from '@/types/toolSchema';

import { generateToolSchema, getToolsForAPI } from '../toolGenerator';
import { summarizeDOM, generateSelectorHints } from './domSummarizer';
import { buildComponentCatalog, generateCatalogPrompt, generateCompactCatalog } from './componentCatalog';
import { createTokenPalette, generatePalettePrompt, generateCompactPalette } from './tokenPalette';

// Re-export sub-modules
export * from './domSummarizer';
export * from './componentCatalog';
export * from './tokenPalette';

/**
 * Options for building prototype context
 */
export interface ContextBuilderOptions {
  /** Include multi-screen tools */
  includeScreenTools?: boolean;
  /** Include interaction/state tools */
  includeInteractionTools?: boolean;
  /** Maximum context size (approximate characters) */
  maxContextSize?: number;
  /** Use compact format for large contexts */
  compactMode?: boolean;
  /** Include example usage hints */
  includeExamples?: boolean;
}

const DEFAULT_OPTIONS: ContextBuilderOptions = {
  includeScreenTools: true,
  includeInteractionTools: true,
  maxContextSize: 50000,
  compactMode: false,
  includeExamples: true,
};

/**
 * Build complete prototype context for LLM generation
 */
export function buildPrototypeContext(
  sourceHtml: string,
  userPrompt: string,
  components: ExtractedComponentForTools[] = [],
  tokens: DesignToken[] = [],
  options: ContextBuilderOptions = {}
): PrototypeContext {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 1. Summarize source DOM
  const domSummary = summarizeDOM(sourceHtml);

  // 2. Generate tool schema
  const toolSchema = generateToolSchema(components, tokens, {
    includeScreenTools: opts.includeScreenTools,
    includeInteractionTools: opts.includeInteractionTools,
    useFallbackComponents: components.length === 0,
  });

  // 3. Build component catalog
  const componentCatalog = buildComponentCatalog(components);

  // 4. Build token palette
  const tokenPalette = createTokenPalette(tokens);

  // 5. Generate system prompt
  const systemPrompt = generateSystemPrompt(
    domSummary,
    components,
    tokens,
    toolSchema.tools,
    opts
  );

  // 6. Generate source context
  const sourceContext = generateSourceContext(domSummary, opts);

  return {
    tools: toolSchema.tools,
    systemPrompt,
    sourceContext,
    userPrompt,
    componentCatalog,
    tokens: tokenPalette,
  };
}

/**
 * Generate system prompt with all context
 */
function generateSystemPrompt(
  domSummary: DOMSummary,
  components: ExtractedComponentForTools[],
  tokens: DesignToken[],
  tools: ToolDefinition[],
  options: ContextBuilderOptions
): string {
  const sections: string[] = [];

  // Introduction
  sections.push(`You are a UI prototype modifier. Your job is to MODIFY an existing webpage DOM based on user requests.

IMPORTANT RULES:
1. Use ONLY the provided tools to make changes - never output raw HTML
2. Reference elements using CSS selectors from the source DOM
3. Make targeted modifications - preserve as much original structure as possible
4. Use design tokens for styling when available
5. Insert components from the library rather than building from scratch
`);

  // DOM structure section
  if (options.compactMode) {
    sections.push(`## Source DOM
Complexity: ${domSummary.complexity}
Sections: ${domSummary.sections.join(', ')}
Size: ${Math.round(domSummary.originalSize / 1024)}KB

Key selectors available in the DOM are listed below the user prompt.
`);
  } else {
    sections.push(`## Source DOM Structure

${domSummary.structure}
`);
    sections.push(generateSelectorHints(domSummary));
  }

  // Component catalog
  if (options.compactMode) {
    sections.push(`## Components
${generateCompactCatalog(components, 15)}
`);
  } else {
    sections.push(generateCatalogPrompt(components));
  }

  // Design tokens
  if (options.compactMode) {
    sections.push(`## Tokens
${generateCompactPalette(tokens, 8)}
`);
  } else {
    sections.push(generatePalettePrompt(tokens));
  }

  // Tool categories summary
  sections.push(generateToolSummary(tools));

  // Examples
  if (options.includeExamples) {
    sections.push(generateExamples(components.length > 0, tokens.length > 0));
  }

  return sections.join('\n');
}

/**
 * Generate tool summary section
 */
function generateToolSummary(tools: ToolDefinition[]): string {
  const categories = new Map<string, number>();
  for (const tool of tools) {
    const cat = tool._meta?.category || 'other';
    categories.set(cat, (categories.get(cat) || 0) + 1);
  }

  const lines = ['## Available Tools', ''];
  for (const [cat, count] of categories) {
    lines.push(`- ${cat}: ${count} tools`);
  }
  lines.push('');
  lines.push(`Total: ${tools.length} tools available`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate source context section
 */
function generateSourceContext(
  domSummary: DOMSummary,
  options: ContextBuilderOptions
): string {
  if (options.compactMode) {
    // Just key elements and sections
    const lines = ['Key Elements:', ''];
    for (const el of domSummary.keyElements.slice(0, 15)) {
      let line = `- ${el.selector}`;
      if (el.type !== 'other') line += ` (${el.type})`;
      if (el.text) line += `: "${el.text}"`;
      lines.push(line);
    }
    return lines.join('\n');
  }

  return domSummary.structure;
}

/**
 * Generate usage examples
 */
function generateExamples(hasComponents: boolean, hasTokens: boolean): string {
  const lines = ['## Usage Examples', ''];

  // Text update example
  lines.push('### Update text content');
  lines.push('```');
  lines.push('update_text(selector: ".hero-title", text: "New Headline")');
  lines.push('```');
  lines.push('');

  // Style example
  if (hasTokens) {
    lines.push('### Apply design token styles');
    lines.push('```');
    lines.push('apply_style(selector: ".cta-button", backgroundColor: "primary", textColor: "white")');
    lines.push('```');
  } else {
    lines.push('### Apply styles');
    lines.push('```');
    lines.push('set_style(selector: ".cta-button", styles: { backgroundColor: "#007bff", color: "white" })');
    lines.push('```');
  }
  lines.push('');

  // Component insertion example
  if (hasComponents) {
    lines.push('### Insert component');
    lines.push('```');
    lines.push('insert_button_primary(selector: ".actions", position: "append", text: "Click Me", variant: "primary")');
    lines.push('```');
  } else {
    lines.push('### Add element');
    lines.push('```');
    lines.push('add_element(selector: ".actions", position: "append", html: "<button class=\\"btn\\">Click Me</button>")');
    lines.push('```');
  }
  lines.push('');

  // Multi-screen example
  lines.push('### Create multi-screen prototype');
  lines.push('```');
  lines.push('create_screen(screenId: "checkout", title: "Checkout Page")');
  lines.push('add_navigation(selector: "#checkout-btn", targetScreen: "checkout", transition: "slide-left")');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * Estimate context size in tokens (rough approximation)
 */
export function estimateContextTokens(context: PrototypeContext): number {
  const totalChars = context.systemPrompt.length +
    context.sourceContext.length +
    context.userPrompt.length +
    JSON.stringify(context.tools).length;

  // Rough estimate: ~4 characters per token
  return Math.ceil(totalChars / 4);
}

/**
 * Optimize context for token limits
 */
export function optimizeContextForLimit(
  context: PrototypeContext,
  maxTokens: number
): PrototypeContext {
  const currentTokens = estimateContextTokens(context);

  if (currentTokens <= maxTokens) {
    return context;
  }

  // Rebuild with compact mode
  // This is a simplified approach - in practice, you'd selectively trim sections
  console.warn(`Context too large (${currentTokens} tokens), switching to compact mode`);

  return {
    ...context,
    // Truncate source context
    sourceContext: context.sourceContext.substring(0, 5000) + '\n... (truncated)',
    // Keep essential system prompt parts
    systemPrompt: context.systemPrompt.substring(0, 10000) + '\n... (see tools for full capabilities)',
  };
}

/**
 * Format context for API request
 */
export function formatContextForAPI(context: PrototypeContext): {
  system: string;
  userMessage: string;
  tools: ReturnType<typeof getToolsForAPI>;
} {
  return {
    system: context.systemPrompt,
    userMessage: `Source DOM:\n${context.sourceContext}\n\nUser Request: ${context.userPrompt}`,
    tools: getToolsForAPI({ tools: context.tools, systemContext: '', componentCount: 0, tokenCount: 0 }),
  };
}
