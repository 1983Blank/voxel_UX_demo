/**
 * DOM Tools - Core DOM modification tools that are always available
 *
 * These tools operate on the existing source DOM structure, allowing
 * targeted modifications without rebuilding the entire page.
 */

import type { ToolDefinition } from '@/types/toolSchema';

/**
 * Core DOM modification tools - always available regardless of account
 */
export const DOM_TOOLS: ToolDefinition[] = [
  // ==========================================================================
  // Text & Content Modification
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'update_text',
      description: 'Update the text content of an element. Replaces all text inside the element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element (e.g., "#hero-title", ".card-title")',
          },
          text: {
            type: 'string',
            description: 'New text content to set',
          },
        },
        required: ['selector', 'text'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'update_html',
      description: 'Update the inner HTML of an element. Use for complex content changes.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          html: {
            type: 'string',
            description: 'New HTML content (will replace all children)',
          },
        },
        required: ['selector', 'html'],
      },
    },
    _meta: { category: 'modification' },
  },

  // ==========================================================================
  // Attribute Modification
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'update_attribute',
      description: 'Update or add an attribute on an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          attribute: {
            type: 'string',
            description: 'Attribute name (e.g., "href", "src", "placeholder")',
          },
          value: {
            type: 'string',
            description: 'New attribute value',
          },
        },
        required: ['selector', 'attribute', 'value'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'remove_attribute',
      description: 'Remove an attribute from an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          attribute: {
            type: 'string',
            description: 'Attribute name to remove',
          },
        },
        required: ['selector', 'attribute'],
      },
    },
    _meta: { category: 'modification' },
  },

  // ==========================================================================
  // Class Manipulation
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_class',
      description: 'Add one or more CSS classes to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          classes: {
            type: 'string',
            description: 'Space-separated class names to add (e.g., "btn-primary active")',
          },
        },
        required: ['selector', 'classes'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'remove_class',
      description: 'Remove one or more CSS classes from an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          classes: {
            type: 'string',
            description: 'Space-separated class names to remove',
          },
        },
        required: ['selector', 'classes'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'replace_class',
      description: 'Replace a CSS class with another on an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          oldClass: {
            type: 'string',
            description: 'Class to remove',
          },
          newClass: {
            type: 'string',
            description: 'Class to add',
          },
        },
        required: ['selector', 'oldClass', 'newClass'],
      },
    },
    _meta: { category: 'modification' },
  },

  // ==========================================================================
  // Element Addition & Removal
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'remove_element',
      description: 'Remove an element from the DOM.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to remove',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'add_element',
      description: 'Add a new HTML element relative to an existing element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the reference element',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert: before/after sibling, prepend/append child, or replace',
          },
          html: {
            type: 'string',
            description: 'HTML to insert',
          },
        },
        required: ['selector', 'position', 'html'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'wrap_element',
      description: 'Wrap an element with a new container element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to wrap',
          },
          wrapperHtml: {
            type: 'string',
            description: 'HTML for the wrapper (element will be inserted where content goes, e.g., "<div class="wrapper"></div>")',
          },
        },
        required: ['selector', 'wrapperHtml'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'clone_element',
      description: 'Clone an element and insert the copy at a specified position.',
      parameters: {
        type: 'object',
        properties: {
          sourceSelector: {
            type: 'string',
            description: 'CSS selector for the element to clone',
          },
          targetSelector: {
            type: 'string',
            description: 'CSS selector for where to insert the clone',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append'],
            description: 'Where to insert the clone relative to target',
          },
        },
        required: ['sourceSelector', 'targetSelector', 'position'],
      },
    },
    _meta: { category: 'modification' },
  },

  // ==========================================================================
  // Visibility & Display
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'hide_element',
      description: 'Hide an element (sets display: none).',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to hide',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'show_element',
      description: 'Show a hidden element (removes display: none).',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to show',
          },
          display: {
            type: 'string',
            description: 'Optional display value (e.g., "block", "flex", "grid"). Defaults to removing inline display style.',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'modification' },
  },

  // ==========================================================================
  // Inline Style Modification
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'set_style',
      description: 'Set inline CSS styles on an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          styles: {
            type: 'object',
            description: 'Object with CSS property names (camelCase) and values',
          },
        },
        required: ['selector', 'styles'],
      },
    },
    _meta: { category: 'style' },
  },

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'update_all',
      description: 'Apply the same text update to all elements matching a selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector matching multiple elements',
          },
          text: {
            type: 'string',
            description: 'Text to set on all matching elements',
          },
        },
        required: ['selector', 'text'],
      },
    },
    _meta: { category: 'modification' },
  },
  {
    type: 'function',
    function: {
      name: 'remove_all',
      description: 'Remove all elements matching a selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector matching elements to remove',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'modification' },
  },
];

/**
 * Get all DOM tools
 */
export function getDOMTools(): ToolDefinition[] {
  return DOM_TOOLS;
}

/**
 * Get a specific DOM tool by name
 */
export function getDOMTool(name: string): ToolDefinition | undefined {
  return DOM_TOOLS.find(t => t.function.name === name);
}
