/**
 * Component Catalog - Builds component context for LLM prompts
 *
 * Creates a catalog of available components that the LLM can use
 * for insertion, with descriptions, props, and usage examples.
 */

import type {
  ExtractedComponentForTools,
  ComponentCatalogEntry,
  ComponentProp,
} from '@/types/toolSchema';

/**
 * Sanitize name for tool naming
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30);
}

/**
 * Format props for display
 */
function formatPropsForDisplay(props: ComponentProp[]): string[] {
  return props.map(p => {
    let desc = p.name;
    if (p.type === 'enum' && p.options) {
      desc += ` (${p.options.join('|')})`;
    } else {
      desc += ` (${p.type})`;
    }
    if (p.required) {
      desc += '*';
    }
    return desc;
  });
}

/**
 * Create catalog entry from extracted component
 */
export function createCatalogEntry(component: ExtractedComponentForTools): ComponentCatalogEntry {
  const toolName = `insert_${sanitizeName(component.category)}_${sanitizeName(component.name)}`;

  return {
    toolName,
    displayName: component.name,
    description: component.description,
    category: component.category,
    props: formatPropsForDisplay(component.props),
  };
}

/**
 * Build component catalog from extracted components
 */
export function buildComponentCatalog(
  components: ExtractedComponentForTools[]
): ComponentCatalogEntry[] {
  return components
    .filter(c => c.approved)
    .map(createCatalogEntry)
    .sort((a, b) => {
      // Sort by category, then by name
      const catCompare = a.category.localeCompare(b.category);
      if (catCompare !== 0) return catCompare;
      return a.displayName.localeCompare(b.displayName);
    });
}

/**
 * Group catalog entries by category
 */
export function groupCatalogByCategory(
  catalog: ComponentCatalogEntry[]
): Map<string, ComponentCatalogEntry[]> {
  const groups = new Map<string, ComponentCatalogEntry[]>();

  for (const entry of catalog) {
    const list = groups.get(entry.category) || [];
    list.push(entry);
    groups.set(entry.category, list);
  }

  return groups;
}

/**
 * Generate component catalog section for system prompt
 */
export function generateCatalogPrompt(
  components: ExtractedComponentForTools[]
): string {
  const catalog = buildComponentCatalog(components);

  if (catalog.length === 0) {
    return `## Available Components

No custom components available. Use generic insertion tools like:
- \`insert_generic_button\`
- \`insert_generic_input\`
- \`insert_generic_card\`
- \`insert_generic_link\`
- \`insert_generic_image\`
`;
  }

  const lines: string[] = ['## Available Components', ''];
  const grouped = groupCatalogByCategory(catalog);

  for (const [category, entries] of grouped) {
    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);

    for (const entry of entries) {
      lines.push(`- **${entry.displayName}** (\`${entry.toolName}\`)`);
      lines.push(`  ${entry.description}`);
      if (entry.props.length > 0) {
        lines.push(`  Props: ${entry.props.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate short component reference (for constrained context)
 */
export function generateCompactCatalog(
  components: ExtractedComponentForTools[],
  maxEntries: number = 20
): string {
  const catalog = buildComponentCatalog(components);
  const limited = catalog.slice(0, maxEntries);

  if (limited.length === 0) {
    return 'No custom components. Use insert_generic_* tools.';
  }

  const lines = limited.map(entry => {
    const propsStr = entry.props.length > 0
      ? ` [${entry.props.slice(0, 3).join(', ')}${entry.props.length > 3 ? '...' : ''}]`
      : '';
    return `${entry.toolName}${propsStr}`;
  });

  const result = lines.join('\n');

  if (catalog.length > maxEntries) {
    return result + `\n... and ${catalog.length - maxEntries} more components`;
  }

  return result;
}

/**
 * Find components by category
 */
export function findComponentsByCategory(
  components: ExtractedComponentForTools[],
  category: string
): ExtractedComponentForTools[] {
  return components.filter(c =>
    c.approved && c.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Find component by name (fuzzy match)
 */
export function findComponentByName(
  components: ExtractedComponentForTools[],
  name: string
): ExtractedComponentForTools | undefined {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  return components.find(c => {
    if (!c.approved) return false;
    const compName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return compName === normalized || compName.includes(normalized) || normalized.includes(compName);
  });
}

/**
 * Suggest components based on context
 */
export function suggestComponents(
  components: ExtractedComponentForTools[],
  context: string
): ExtractedComponentForTools[] {
  const keywords = context.toLowerCase().split(/\s+/);
  const scores = new Map<string, number>();

  for (const comp of components) {
    if (!comp.approved) continue;

    let score = 0;
    const compWords = [
      ...comp.name.toLowerCase().split(/\s+/),
      ...comp.description.toLowerCase().split(/\s+/),
      comp.category.toLowerCase(),
    ];

    for (const keyword of keywords) {
      for (const word of compWords) {
        if (word.includes(keyword) || keyword.includes(word)) {
          score += 1;
        }
      }
    }

    if (score > 0) {
      scores.set(comp.id, score);
    }
  }

  return components
    .filter(c => scores.has(c.id))
    .sort((a, b) => (scores.get(b.id) || 0) - (scores.get(a.id) || 0))
    .slice(0, 5);
}

/**
 * Get component categories with counts
 */
export function getComponentCategories(
  components: ExtractedComponentForTools[]
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();

  for (const comp of components) {
    if (!comp.approved) continue;
    const count = counts.get(comp.category) || 0;
    counts.set(comp.category, count + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
