/**
 * Tool Generator Service
 *
 * Dynamically generates LLM tool schemas from:
 * - Core DOM modification tools (always available)
 * - Extracted components (dynamic per account)
 * - Design tokens (dynamic per account)
 * - Screen/navigation tools (for multi-file prototypes)
 * - Interaction tools (for stateful behaviors)
 */

import type {
  ToolDefinition,
  GeneratedToolSchema,
  ExtractedComponentForTools,
  DesignToken,
  ToolCategory,
} from '@/types/toolSchema';

import { getDOMTools } from './domTools';
import { generateComponentTools, getFallbackComponentTools } from './componentTools';
import { generateStyleTools, getBaseStyleTools } from './styleTools';
import { getScreenTools, getInteractionTools } from './screenTools';

// Re-export individual tool generators
export * from './domTools';
export * from './componentTools';
export * from './styleTools';
export * from './screenTools';

/**
 * Options for tool generation
 */
export interface ToolGeneratorOptions {
  /** Include screen management tools for multi-file prototypes */
  includeScreenTools?: boolean;
  /** Include interaction tools for stateful behaviors */
  includeInteractionTools?: boolean;
  /** Use fallback components if no extracted components provided */
  useFallbackComponents?: boolean;
  /** Filter to only specific categories */
  categories?: ToolCategory[];
  /** Maximum total tools to generate (for context limits) */
  maxTools?: number;
}

const DEFAULT_OPTIONS: ToolGeneratorOptions = {
  includeScreenTools: true,
  includeInteractionTools: true,
  useFallbackComponents: true,
  maxTools: 100,
};

/**
 * Generate complete tool schema for prototype generation
 *
 * @param components - Extracted components for this account
 * @param tokens - Design tokens for this account
 * @param options - Generation options
 * @returns Complete tool schema with system context
 */
export function generateToolSchema(
  components: ExtractedComponentForTools[] = [],
  tokens: DesignToken[] = [],
  options: ToolGeneratorOptions = {}
): GeneratedToolSchema {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allTools: ToolDefinition[] = [];

  // 1. Core DOM tools (always included)
  const domTools = getDOMTools();
  allTools.push(...domTools);

  // 2. Component insertion tools
  let componentTools: ToolDefinition[] = [];
  if (components.length > 0) {
    componentTools = generateComponentTools(components);
  } else if (opts.useFallbackComponents) {
    componentTools = getFallbackComponentTools();
  }
  allTools.push(...componentTools);

  // 3. Style tools based on design tokens
  let styleTools: ToolDefinition[] = [];
  if (tokens.length > 0) {
    styleTools = generateStyleTools(tokens);
  } else {
    styleTools = getBaseStyleTools();
  }
  allTools.push(...styleTools);

  // 4. Screen management tools (optional)
  if (opts.includeScreenTools) {
    const screenTools = getScreenTools();
    allTools.push(...screenTools);
  }

  // 5. Interaction tools (optional)
  if (opts.includeInteractionTools) {
    const interactionTools = getInteractionTools();
    allTools.push(...interactionTools);
  }

  // Filter by category if specified
  let filteredTools = allTools;
  if (opts.categories && opts.categories.length > 0) {
    filteredTools = allTools.filter(t =>
      !t._meta?.category || opts.categories!.includes(t._meta.category)
    );
  }

  // Limit total tools if needed
  if (opts.maxTools && filteredTools.length > opts.maxTools) {
    // Prioritize: DOM > Components > Style > Screen > Interaction
    const priority: ToolCategory[] = ['modification', 'insertion', 'style', 'screen', 'interaction', 'selection'];
    filteredTools = filteredTools
      .sort((a, b) => {
        const aIdx = priority.indexOf(a._meta?.category || 'modification');
        const bIdx = priority.indexOf(b._meta?.category || 'modification');
        return aIdx - bIdx;
      })
      .slice(0, opts.maxTools);
  }

  // Generate system context
  const systemContext = generateSystemContext(components, tokens, filteredTools);

  return {
    tools: filteredTools,
    systemContext,
    componentCount: components.filter(c => c.approved).length,
    tokenCount: tokens.length,
  };
}

/**
 * Generate system context string describing available tools
 */
function generateSystemContext(
  components: ExtractedComponentForTools[],
  tokens: DesignToken[],
  tools: ToolDefinition[]
): string {
  const approvedComponents = components.filter(c => c.approved);

  const lines: string[] = [
    '## Available Tools',
    '',
    `You have ${tools.length} tools available for modifying the source DOM.`,
    '',
  ];

  // Categorize tools
  const categories: Record<string, ToolDefinition[]> = {};
  for (const tool of tools) {
    const cat = tool._meta?.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(tool);
  }

  // DOM modification tools
  if (categories['modification']) {
    lines.push('### DOM Modification');
    lines.push('Core tools for changing the source DOM:');
    for (const t of categories['modification'].slice(0, 8)) {
      lines.push(`- \`${t.function.name}\`: ${t.function.description.split('.')[0]}`);
    }
    if (categories['modification'].length > 8) {
      lines.push(`- ... and ${categories['modification'].length - 8} more`);
    }
    lines.push('');
  }

  // Component insertion tools
  if (categories['insertion']) {
    lines.push('### Component Insertion');
    if (approvedComponents.length > 0) {
      lines.push(`Insert pre-built components from the design system (${approvedComponents.length} available):`);
    } else {
      lines.push('Insert generic UI elements:');
    }
    for (const t of categories['insertion'].slice(0, 6)) {
      lines.push(`- \`${t.function.name}\`: ${t.function.description.split('.')[0]}`);
    }
    if (categories['insertion'].length > 6) {
      lines.push(`- ... and ${categories['insertion'].length - 6} more`);
    }
    lines.push('');
  }

  // Style tools
  if (categories['style']) {
    lines.push('### Styling');
    if (tokens.length > 0) {
      lines.push(`Apply design tokens for consistent styling (${tokens.length} tokens):');`);
    } else {
      lines.push('Apply styles to elements:');
    }
    for (const t of categories['style'].slice(0, 5)) {
      lines.push(`- \`${t.function.name}\`: ${t.function.description.split('.')[0]}`);
    }
    lines.push('');
  }

  // Screen tools
  if (categories['screen']) {
    lines.push('### Multi-Screen');
    lines.push('Create multi-page prototypes with navigation:');
    for (const t of categories['screen'].slice(0, 5)) {
      lines.push(`- \`${t.function.name}\`: ${t.function.description.split('.')[0]}`);
    }
    lines.push('');
  }

  // Interaction tools
  if (categories['interaction']) {
    lines.push('### Interactions');
    lines.push('Add stateful behaviors and UI feedback:');
    for (const t of categories['interaction'].slice(0, 5)) {
      lines.push(`- \`${t.function.name}\`: ${t.function.description.split('.')[0]}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get tool definitions ready for OpenAI/Anthropic API
 * Strips internal metadata
 */
export function getToolsForAPI(schema: GeneratedToolSchema): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}> {
  return schema.tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

/**
 * Find a tool by name
 */
export function findTool(schema: GeneratedToolSchema, name: string): ToolDefinition | undefined {
  return schema.tools.find(t => t.function.name === name);
}

/**
 * Get tools by category
 */
export function getToolsByCategory(
  schema: GeneratedToolSchema,
  category: ToolCategory
): ToolDefinition[] {
  return schema.tools.filter(t => t._meta?.category === category);
}

/**
 * Validate tool call arguments against schema
 */
export function validateToolCall(
  tool: ToolDefinition,
  args: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const params = tool.function.parameters;

  // Check required parameters
  for (const required of params.required) {
    if (!(required in args) || args[required] === undefined) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  // Basic type checking
  for (const [key, value] of Object.entries(args)) {
    const propSchema = params.properties[key];
    if (!propSchema) {
      // Unknown parameter, but not necessarily an error
      continue;
    }

    if (propSchema.enum && !propSchema.enum.includes(value as never)) {
      errors.push(`Invalid value for ${key}: must be one of ${propSchema.enum.join(', ')}`);
    }

    if (propSchema.type && typeof value !== propSchema.type && value !== null) {
      // Allow null for optional params
      if (propSchema.type !== 'object' && propSchema.type !== 'array') {
        errors.push(`Invalid type for ${key}: expected ${propSchema.type}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
