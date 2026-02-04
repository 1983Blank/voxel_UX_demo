/**
 * Component Tools - Dynamically generated from extracted components
 *
 * Creates insertion tools for each approved component in the user's library,
 * allowing the LLM to insert components with proper props and variants.
 */

import type {
  ToolDefinition,
  JSONSchemaProperty,
  ExtractedComponentForTools,
  ComponentProp,
  ComponentVariant,
} from '@/types/toolSchema';

/**
 * Sanitize component name for use in tool name
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30); // Keep tool names reasonable length
}

/**
 * Convert component prop to JSON schema property
 */
function propToSchemaProperty(prop: ComponentProp): JSONSchemaProperty {
  const schema: JSONSchemaProperty = {
    description: prop.description || `${prop.name} property`,
  };

  switch (prop.type) {
    case 'string':
      schema.type = 'string';
      break;
    case 'number':
      schema.type = 'number';
      break;
    case 'boolean':
      schema.type = 'boolean';
      break;
    case 'enum':
      schema.type = 'string';
      if (prop.options && prop.options.length > 0) {
        schema.enum = prop.options;
      }
      break;
    case 'slot':
      schema.type = 'string';
      schema.description = `${prop.description || prop.name} - HTML content slot`;
      break;
    default:
      schema.type = 'string';
  }

  if (prop.defaultValue !== undefined) {
    schema.default = prop.defaultValue;
  }

  return schema;
}

/**
 * Generate props schema from component props and variants
 */
function generatePropsSchema(
  props: ComponentProp[],
  variants: ComponentVariant[]
): Record<string, JSONSchemaProperty> {
  const schema: Record<string, JSONSchemaProperty> = {};

  // Add props from component definition
  for (const prop of props) {
    schema[prop.name] = propToSchemaProperty(prop);
  }

  // Add variant prop if component has variants
  if (variants.length > 0) {
    schema['variant'] = {
      type: 'string',
      enum: variants.map(v => v.name),
      description: `Component variant: ${variants.map(v => `${v.name}${v.description ? ` (${v.description})` : ''}`).join(', ')}`,
    };
  }

  return schema;
}

/**
 * Get required props for a component
 */
function getRequiredProps(props: ComponentProp[]): string[] {
  return props.filter(p => p.required).map(p => p.name);
}

/**
 * Generate a tool definition for inserting a component
 */
export function generateComponentTool(component: ExtractedComponentForTools): ToolDefinition {
  const toolName = `insert_${sanitizeName(component.category)}_${sanitizeName(component.name)}`;
  const propsSchema = generatePropsSchema(component.props, component.variants);
  const requiredProps = getRequiredProps(component.props);

  return {
    type: 'function',
    function: {
      name: toolName,
      description: `Insert ${component.name} component: ${component.description}${component.exampleUsage ? `\n\nExample: ${component.exampleUsage}` : ''}`,
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element to insert into',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert relative to the selector element',
          },
          ...propsSchema,
        },
        required: ['selector', 'position', ...requiredProps],
      },
    },
    _meta: {
      category: 'insertion',
      componentId: component.id,
    },
  };
}

/**
 * Generate tools for all approved components
 */
export function generateComponentTools(components: ExtractedComponentForTools[]): ToolDefinition[] {
  return components
    .filter(c => c.approved)
    .map(generateComponentTool);
}

/**
 * Common component templates that can be used when no extracted components exist
 * These provide basic building blocks for prototype generation
 */
export const FALLBACK_COMPONENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'insert_generic_button',
      description: 'Insert a generic button element. Use when no specific button component is available.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the button',
          },
          text: {
            type: 'string',
            description: 'Button text',
          },
          variant: {
            type: 'string',
            enum: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
            description: 'Button style variant',
          },
          size: {
            type: 'string',
            enum: ['small', 'medium', 'large'],
            description: 'Button size',
          },
        },
        required: ['selector', 'position', 'text'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_input',
      description: 'Insert a generic input field. Use when no specific input component is available.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the input',
          },
          type: {
            type: 'string',
            enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
            description: 'Input type',
          },
          placeholder: {
            type: 'string',
            description: 'Placeholder text',
          },
          label: {
            type: 'string',
            description: 'Label text (optional)',
          },
        },
        required: ['selector', 'position', 'type'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_card',
      description: 'Insert a generic card container. Use when no specific card component is available.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the card',
          },
          title: {
            type: 'string',
            description: 'Card title',
          },
          content: {
            type: 'string',
            description: 'Card body content (can be HTML)',
          },
          imageUrl: {
            type: 'string',
            description: 'Optional header image URL',
          },
        },
        required: ['selector', 'position'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_link',
      description: 'Insert a link element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the link',
          },
          text: {
            type: 'string',
            description: 'Link text',
          },
          href: {
            type: 'string',
            description: 'Link URL (use # for navigation links)',
          },
        },
        required: ['selector', 'position', 'text', 'href'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_image',
      description: 'Insert an image element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the image',
          },
          src: {
            type: 'string',
            description: 'Image source URL',
          },
          alt: {
            type: 'string',
            description: 'Alt text for accessibility',
          },
          width: {
            type: 'string',
            description: 'Width (e.g., "100%", "200px")',
          },
          height: {
            type: 'string',
            description: 'Height (e.g., "auto", "150px")',
          },
        },
        required: ['selector', 'position', 'src', 'alt'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_list',
      description: 'Insert a list (ul/ol) with items.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the list',
          },
          ordered: {
            type: 'boolean',
            description: 'Use ordered list (ol) instead of unordered (ul)',
          },
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of list item text/HTML',
          },
        },
        required: ['selector', 'position', 'items'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_heading',
      description: 'Insert a heading element (h1-h6).',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the heading',
          },
          level: {
            type: 'number',
            minimum: 1,
            maximum: 6,
            description: 'Heading level (1-6)',
          },
          text: {
            type: 'string',
            description: 'Heading text',
          },
        },
        required: ['selector', 'position', 'level', 'text'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_paragraph',
      description: 'Insert a paragraph element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the paragraph',
          },
          text: {
            type: 'string',
            description: 'Paragraph text content',
          },
        },
        required: ['selector', 'position', 'text'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_divider',
      description: 'Insert a horizontal divider/separator.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append'],
            description: 'Where to insert the divider',
          },
        },
        required: ['selector', 'position'],
      },
    },
    _meta: { category: 'insertion' },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_container',
      description: 'Insert a generic div container for grouping elements.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the parent element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert the container',
          },
          className: {
            type: 'string',
            description: 'CSS class(es) for the container',
          },
          id: {
            type: 'string',
            description: 'Optional ID for the container',
          },
          content: {
            type: 'string',
            description: 'Inner HTML content (optional)',
          },
        },
        required: ['selector', 'position'],
      },
    },
    _meta: { category: 'insertion' },
  },
];

/**
 * Get fallback component tools for accounts without extracted components
 */
export function getFallbackComponentTools(): ToolDefinition[] {
  return FALLBACK_COMPONENT_TOOLS;
}
