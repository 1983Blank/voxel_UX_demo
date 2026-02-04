/**
 * Screen Tools - Multi-file/screen management for complex prototypes
 *
 * These tools enable creating multi-page prototypes with navigation,
 * shared state, and URL routing.
 */

import type { ToolDefinition } from '@/types/toolSchema';

/**
 * Screen management tools for multi-file prototypes
 */
export const SCREEN_TOOLS: ToolDefinition[] = [
  // ==========================================================================
  // Screen Creation & Management
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'create_screen',
      description: 'Create a new screen/page for the prototype. Each screen becomes a separate HTML file that can be navigated to.',
      parameters: {
        type: 'object',
        properties: {
          screenId: {
            type: 'string',
            description: 'Unique identifier for this screen (e.g., "checkout", "profile", "settings"). Use lowercase with hyphens.',
          },
          baseScreenId: {
            type: 'string',
            description: 'Optional: ID of another screen to copy as the starting point. If not provided, starts from the source DOM.',
          },
          title: {
            type: 'string',
            description: 'Page title shown in browser tab and navigation',
          },
        },
        required: ['screenId'],
      },
    },
    _meta: { category: 'screen' },
  },
  {
    type: 'function',
    function: {
      name: 'switch_screen',
      description: 'Switch context to modify a different screen. Subsequent modification tools will apply to this screen.',
      parameters: {
        type: 'object',
        properties: {
          screenId: {
            type: 'string',
            description: 'ID of the screen to switch to',
          },
        },
        required: ['screenId'],
      },
    },
    _meta: { category: 'screen' },
  },
  {
    type: 'function',
    function: {
      name: 'delete_screen',
      description: 'Delete a screen from the prototype.',
      parameters: {
        type: 'object',
        properties: {
          screenId: {
            type: 'string',
            description: 'ID of the screen to delete',
          },
        },
        required: ['screenId'],
      },
    },
    _meta: { category: 'screen' },
  },

  // ==========================================================================
  // Navigation
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_navigation',
      description: 'Make an element navigate to another screen when clicked.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the clickable element (button, link, etc.)',
          },
          targetScreen: {
            type: 'string',
            description: 'Screen ID to navigate to',
          },
          transition: {
            type: 'string',
            enum: ['instant', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'],
            description: 'Transition animation when navigating',
          },
          params: {
            type: 'object',
            description: 'Optional URL parameters to pass (e.g., { "id": "123" })',
          },
        },
        required: ['selector', 'targetScreen'],
      },
    },
    _meta: { category: 'screen' },
  },
  {
    type: 'function',
    function: {
      name: 'add_back_navigation',
      description: 'Make an element navigate back to the previous screen.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the back button/link',
          },
          transition: {
            type: 'string',
            enum: ['instant', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'],
            description: 'Transition animation',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'screen' },
  },

  // ==========================================================================
  // URL Routing
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'define_route',
      description: 'Define a URL route for a screen. Enables direct linking and URL parameters.',
      parameters: {
        type: 'object',
        properties: {
          screenId: {
            type: 'string',
            description: 'Screen ID to associate with this route',
          },
          path: {
            type: 'string',
            description: 'URL path pattern (e.g., "/checkout", "/profile/:id", "/products/:category/:id")',
          },
        },
        required: ['screenId', 'path'],
      },
    },
    _meta: { category: 'screen' },
  },
  {
    type: 'function',
    function: {
      name: 'set_default_screen',
      description: 'Set which screen loads first when the prototype opens.',
      parameters: {
        type: 'object',
        properties: {
          screenId: {
            type: 'string',
            description: 'Screen ID to show by default',
          },
        },
        required: ['screenId'],
      },
    },
    _meta: { category: 'screen' },
  },

  // ==========================================================================
  // Shared Navigation Components
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_nav_menu',
      description: 'Add a navigation menu with links to multiple screens.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for where to insert the nav menu',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert relative to selector',
          },
          items: {
            type: 'array',
            description: 'Navigation items with label and target screen',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                screenId: { type: 'string' },
                icon: { type: 'string' },
              },
            },
          },
          style: {
            type: 'string',
            enum: ['horizontal', 'vertical', 'tabs', 'dropdown'],
            description: 'Navigation menu style',
          },
        },
        required: ['selector', 'position', 'items'],
      },
    },
    _meta: { category: 'screen' },
  },
  {
    type: 'function',
    function: {
      name: 'add_breadcrumb',
      description: 'Add a breadcrumb navigation component.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for where to insert the breadcrumb',
          },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert relative to selector',
          },
          items: {
            type: 'array',
            description: 'Breadcrumb path items',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                screenId: { type: 'string' },
              },
            },
          },
        },
        required: ['selector', 'position', 'items'],
      },
    },
    _meta: { category: 'screen' },
  },
];

/**
 * Interaction and state tools for adding behavior
 */
export const INTERACTION_TOOLS: ToolDefinition[] = [
  // ==========================================================================
  // State Management
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'define_state',
      description: 'Define a shared state variable that can be used across screens.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Variable name (e.g., "cartCount", "isLoggedIn", "selectedTab")',
          },
          type: {
            type: 'string',
            enum: ['string', 'number', 'boolean', 'array', 'object'],
            description: 'Data type',
          },
          defaultValue: {
            description: 'Initial value',
          },
          persistence: {
            type: 'string',
            enum: ['none', 'session', 'local'],
            description: 'Whether to persist: none (reset on refresh), session (per tab), local (permanent)',
          },
        },
        required: ['name', 'type', 'defaultValue'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'bind_state',
      description: 'Bind a state variable to an element, updating it when state changes.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element to bind',
          },
          stateName: {
            type: 'string',
            description: 'Name of the state variable',
          },
          property: {
            type: 'string',
            enum: ['textContent', 'innerHTML', 'value', 'checked', 'disabled', 'hidden', 'class'],
            description: 'Which element property to update',
          },
          transform: {
            type: 'string',
            description: 'Optional: template string to transform value (e.g., "Items: {{value}}")',
          },
        },
        required: ['selector', 'stateName', 'property'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'set_state_on_click',
      description: 'Set state when an element is clicked.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the clickable element',
          },
          stateName: {
            type: 'string',
            description: 'State variable to update',
          },
          value: {
            description: 'New value to set',
          },
          operation: {
            type: 'string',
            enum: ['set', 'toggle', 'increment', 'decrement', 'append', 'remove'],
            description: 'Operation to perform: set value, toggle boolean, increment/decrement number, append/remove from array',
          },
        },
        required: ['selector', 'stateName'],
      },
    },
    _meta: { category: 'interaction' },
  },

  // ==========================================================================
  // Click Handlers
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_click_handler',
      description: 'Add a click handler with multiple actions.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the clickable element',
          },
          actions: {
            type: 'array',
            description: 'Ordered list of actions to perform on click',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['navigate', 'setState', 'toggle', 'addClass', 'removeClass', 'show', 'hide', 'scrollTo', 'log'],
                },
                target: { type: 'string' },
                value: {},
              },
            },
          },
        },
        required: ['selector', 'actions'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'add_toggle',
      description: 'Make an element toggle the visibility or class of another element.',
      parameters: {
        type: 'object',
        properties: {
          triggerSelector: {
            type: 'string',
            description: 'CSS selector for the trigger element',
          },
          targetSelector: {
            type: 'string',
            description: 'CSS selector for the element to toggle',
          },
          toggleType: {
            type: 'string',
            enum: ['visibility', 'class'],
            description: 'Toggle visibility or a class',
          },
          className: {
            type: 'string',
            description: 'Class name to toggle (when toggleType is "class")',
          },
        },
        required: ['triggerSelector', 'targetSelector', 'toggleType'],
      },
    },
    _meta: { category: 'interaction' },
  },

  // ==========================================================================
  // Form Interactions
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_form_submit',
      description: 'Add form submission behavior.',
      parameters: {
        type: 'object',
        properties: {
          formSelector: {
            type: 'string',
            description: 'CSS selector for the form element',
          },
          onSubmit: {
            type: 'object',
            properties: {
              validateFields: { type: 'boolean' },
              showSuccess: { type: 'string' },
              navigateTo: { type: 'string' },
              stateUpdates: { type: 'object' },
            },
            description: 'Actions to perform on valid submission',
          },
        },
        required: ['formSelector', 'onSubmit'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'add_input_validation',
      description: 'Add validation to a form input.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the input element',
          },
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['required', 'email', 'minLength', 'maxLength', 'pattern', 'match'],
                },
                value: {},
                message: { type: 'string' },
              },
            },
            description: 'Validation rules',
          },
          showErrorOn: {
            type: 'string',
            enum: ['blur', 'change', 'submit'],
            description: 'When to show validation errors',
          },
        },
        required: ['selector', 'rules'],
      },
    },
    _meta: { category: 'interaction' },
  },

  // ==========================================================================
  // UI Feedback
  // ==========================================================================
  {
    type: 'function',
    function: {
      name: 'add_hover_effect',
      description: 'Add hover styles to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          hoverStyles: {
            type: 'object',
            description: 'CSS styles to apply on hover',
          },
          transition: {
            type: 'string',
            description: 'Transition duration (e.g., "0.2s", "200ms")',
          },
        },
        required: ['selector', 'hoverStyles'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'add_loading_state',
      description: 'Add loading state behavior to a button or container.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element',
          },
          triggerOn: {
            type: 'string',
            enum: ['click', 'formSubmit', 'stateChange'],
            description: 'What triggers the loading state',
          },
          duration: {
            type: 'number',
            description: 'How long to show loading (in ms). Use 0 for manual control.',
          },
          loadingText: {
            type: 'string',
            description: 'Text to show while loading',
          },
        },
        required: ['selector', 'triggerOn'],
      },
    },
    _meta: { category: 'interaction' },
  },
  {
    type: 'function',
    function: {
      name: 'add_tooltip',
      description: 'Add a tooltip to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the element',
          },
          content: {
            type: 'string',
            description: 'Tooltip text',
          },
          position: {
            type: 'string',
            enum: ['top', 'bottom', 'left', 'right'],
            description: 'Tooltip position',
          },
        },
        required: ['selector', 'content'],
      },
    },
    _meta: { category: 'interaction' },
  },
];

/**
 * Get all screen management tools
 */
export function getScreenTools(): ToolDefinition[] {
  return SCREEN_TOOLS;
}

/**
 * Get all interaction tools
 */
export function getInteractionTools(): ToolDefinition[] {
  return INTERACTION_TOOLS;
}

/**
 * Get screen tools with interaction tools
 */
export function getAllScreenAndInteractionTools(): ToolDefinition[] {
  return [...SCREEN_TOOLS, ...INTERACTION_TOOLS];
}
