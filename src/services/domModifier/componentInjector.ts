/**
 * Component Injector - Injects extracted components into DOM
 *
 * Handles component insertion by:
 * 1. Interpolating prop values into component HTML
 * 2. Applying variant styles
 * 3. Injecting component CSS into document
 */

import type {
  ExtractedComponentForTools,
  ComponentVariant,
  Modification,
} from '@/types/toolSchema';
import { insertHTML, type OperationResult } from './operations';

/**
 * Escape HTML special characters in a string
 */
function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Interpolate props into component HTML template
 */
export function interpolateComponentProps(
  template: string,
  props: Record<string, unknown>
): string {
  let result = template;

  // Replace {{propName}} placeholders
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;

    // Skip internal props
    if (key === 'selector' || key === 'position') continue;

    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const stringValue = typeof value === 'string' ? escapeHtml(value) : String(value);
    result = result.replace(placeholder, stringValue);
  }

  // Remove any remaining placeholders with defaults
  // Format: {{propName|default value}}
  result = result.replace(/\{\{\s*(\w+)\s*\|\s*([^}]*)\s*\}\}/g, '$2');

  // Remove any remaining empty placeholders
  result = result.replace(/\{\{\s*\w+\s*\}\}/g, '');

  return result;
}

/**
 * Apply variant class/styles to component HTML
 */
export function applyComponentVariant(
  html: string,
  variant: ComponentVariant | undefined
): string {
  if (!variant) return html;

  // If variant has styles (like a class), add it to the root element
  if (variant.styles) {
    // Find the first element and add the variant class/styles
    const classMatch = html.match(/^(\s*<\w+)(\s|>)/);
    if (classMatch) {
      const classAttr = ` class="${variant.styles}"`;
      // Check if class already exists
      if (html.includes('class="') || html.includes("class='")) {
        // Append to existing class
        return html.replace(
          /(class=["'])([^"']*)(["'])/,
          `$1$2 ${variant.styles}$3`
        );
      } else {
        // Add class attribute
        return html.replace(classMatch[0], `${classMatch[1]}${classAttr}${classMatch[2]}`);
      }
    }
  }

  return html;
}

/**
 * Inject component CSS into document head
 */
export function injectComponentCSS(
  doc: Document,
  css: string,
  componentId: string
): void {
  // Check if already injected
  const styleId = `component-style-${componentId}`;
  if (doc.getElementById(styleId)) return;

  // Create and inject style element
  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = css;

  const head = doc.head || doc.querySelector('head');
  if (head) {
    head.appendChild(style);
  }
}

/**
 * Get component by ID from map
 */
function getComponent(
  componentMap: Map<string, ExtractedComponentForTools>,
  toolName: string
): ExtractedComponentForTools | undefined {
  // Tool name format: insert_{category}_{name}
  // Try to find by iterating components
  for (const comp of componentMap.values()) {
    const expectedName = `insert_${sanitizeName(comp.category)}_${sanitizeName(comp.name)}`;
    if (expectedName === toolName) {
      return comp;
    }
  }
  return undefined;
}

/**
 * Sanitize name for tool matching
 */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30);
}

/**
 * Find variant by name
 */
function findVariant(
  component: ExtractedComponentForTools,
  variantName: string | undefined
): ComponentVariant | undefined {
  if (!variantName) return undefined;
  return component.variants.find(v =>
    v.name.toLowerCase() === variantName.toLowerCase()
  );
}

/**
 * Inject a component into the DOM
 */
export function injectComponent(
  doc: Document,
  mod: Modification,
  componentMap: Map<string, ExtractedComponentForTools>
): OperationResult {
  const { tool, selector, position, params } = mod;

  // Find the component
  const component = getComponent(componentMap, tool);
  if (!component) {
    return { success: false, error: `Component not found for tool: ${tool}` };
  }

  // Find target element
  if (!selector) {
    return { success: false, error: 'Selector required for component insertion' };
  }

  const target = doc.querySelector(selector);
  if (!target) {
    return { success: false, error: `Target element not found: ${selector}` };
  }

  // Interpolate props into component HTML
  let html = interpolateComponentProps(component.html, params);

  // Apply variant if specified
  const variant = findVariant(component, params.variant as string | undefined);
  html = applyComponentVariant(html, variant);

  // Inject CSS if present
  if (component.css) {
    injectComponentCSS(doc, component.css, component.id);
  }

  // Insert the component HTML
  return insertHTML(target, position || 'append', html);
}

/**
 * Generate HTML for fallback generic components
 */
export function generateGenericComponentHTML(
  toolName: string,
  params: Record<string, unknown>
): string {
  switch (toolName) {
    case 'insert_generic_button': {
      const text = params.text || 'Button';
      const variant = params.variant || 'primary';
      const size = params.size || 'medium';
      return `<button class="btn btn-${variant} btn-${size}">${escapeHtml(String(text))}</button>`;
    }

    case 'insert_generic_input': {
      const type = params.type || 'text';
      const placeholder = params.placeholder || '';
      const label = params.label;
      const input = `<input type="${type}" placeholder="${escapeHtml(String(placeholder))}" class="form-input">`;
      if (label) {
        return `<label class="form-label">${escapeHtml(String(label))}${input}</label>`;
      }
      return input;
    }

    case 'insert_generic_card': {
      const title = params.title ? `<h3 class="card-title">${escapeHtml(String(params.title))}</h3>` : '';
      const content = params.content ? `<div class="card-content">${params.content}</div>` : '';
      const image = params.imageUrl
        ? `<img src="${escapeHtml(String(params.imageUrl))}" class="card-image" alt="">`
        : '';
      return `<div class="card">${image}${title}${content}</div>`;
    }

    case 'insert_generic_link': {
      const text = params.text || 'Link';
      const href = params.href || '#';
      return `<a href="${escapeHtml(String(href))}" class="link">${escapeHtml(String(text))}</a>`;
    }

    case 'insert_generic_image': {
      const src = params.src || '';
      const alt = params.alt || '';
      const width = params.width ? ` width="${params.width}"` : '';
      const height = params.height ? ` height="${params.height}"` : '';
      return `<img src="${escapeHtml(String(src))}" alt="${escapeHtml(String(alt))}"${width}${height} class="image">`;
    }

    case 'insert_generic_list': {
      const items = (params.items as string[]) || [];
      const tag = params.ordered ? 'ol' : 'ul';
      const listItems = items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('');
      return `<${tag} class="list">${listItems}</${tag}>`;
    }

    case 'insert_generic_heading': {
      const level = Math.min(6, Math.max(1, Number(params.level) || 2));
      const text = params.text || 'Heading';
      return `<h${level} class="heading">${escapeHtml(String(text))}</h${level}>`;
    }

    case 'insert_generic_paragraph': {
      const text = params.text || '';
      return `<p class="paragraph">${escapeHtml(String(text))}</p>`;
    }

    case 'insert_generic_divider':
      return '<hr class="divider">';

    case 'insert_generic_container': {
      const className = params.className || '';
      const id = params.id ? ` id="${escapeHtml(String(params.id))}"` : '';
      const content = params.content || '';
      return `<div class="${escapeHtml(String(className))}"${id}>${content}</div>`;
    }

    default:
      return `<!-- Unknown component: ${toolName} -->`;
  }
}

/**
 * Inject a generic component
 */
export function injectGenericComponent(
  doc: Document,
  mod: Modification
): OperationResult {
  const { tool, selector, position, params } = mod;

  if (!selector) {
    return { success: false, error: 'Selector required for component insertion' };
  }

  const target = doc.querySelector(selector);
  if (!target) {
    return { success: false, error: `Target element not found: ${selector}` };
  }

  const html = generateGenericComponentHTML(tool, params);
  return insertHTML(target, position || 'append', html);
}

/**
 * Check if a tool name is for a component insertion
 */
export function isComponentInsertionTool(toolName: string): boolean {
  return toolName.startsWith('insert_');
}

/**
 * Check if a tool name is for a generic component
 */
export function isGenericComponentTool(toolName: string): boolean {
  return toolName.startsWith('insert_generic_');
}
