/**
 * DOM Operations - Core operations for modifying DOM elements
 *
 * These operations handle the actual DOM manipulation based on
 * tool call instructions from the LLM.
 */

import type { InsertPosition, Modification } from '@/types/toolSchema';

/**
 * Result of a DOM operation
 */
export interface OperationResult {
  success: boolean;
  error?: string;
  elementsAffected?: number;
}

/**
 * DOM interface abstraction (works with browser DOM or linkedom)
 */
export interface DOMInterface {
  querySelector(selector: string): Element | null;
  querySelectorAll(selector: string): NodeListOf<Element>;
  createElement(tag: string): Element;
  createTextNode(text: string): Text;
  head: Element | null;
  body: Element | null;
}

/**
 * Get document interface from element
 */
function getDocument(element: Element): Document {
  return element.ownerDocument || (element as unknown as Document);
}

/**
 * Parse HTML string into elements
 */
function parseHTMLFragment(doc: Document, html: string): DocumentFragment {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

/**
 * Safe querySelector that handles non-standard selector syntax
 * Supports Playwright-style selectors that the LLM might generate:
 * - :has-text("...") - Find element containing text
 * - :text("...") - Find element with exact text
 * - >> (child combinator in Playwright) - Convert to standard >
 */
function querySelectorSafe(doc: Document, selector: string): Element | null {
  // First try the selector as-is
  try {
    return doc.querySelector(selector);
  } catch {
    // Selector is invalid, try to transform it
  }

  // Handle :has-text("...") - find element containing text
  const hasTextMatch = selector.match(/^(.+?):has-text\(["'](.+?)["']\)$/);
  if (hasTextMatch) {
    const [, baseSelector, searchText] = hasTextMatch;
    try {
      const elements = doc.querySelectorAll(baseSelector.trim() || '*');
      for (const el of elements) {
        if (el.textContent?.includes(searchText)) {
          return el;
        }
      }
    } catch {
      // Base selector also invalid, fall through
    }
    return null;
  }

  // Handle :text("...") - find element with text (more exact match)
  const textMatch = selector.match(/^(.+?):text\(["'](.+?)["']\)$/);
  if (textMatch) {
    const [, baseSelector, searchText] = textMatch;
    try {
      const elements = doc.querySelectorAll(baseSelector.trim() || '*');
      for (const el of elements) {
        const text = el.textContent?.trim();
        if (text === searchText || text?.includes(searchText)) {
          return el;
        }
      }
    } catch {
      // Base selector also invalid, fall through
    }
    return null;
  }

  // Handle >> (Playwright child combinator) - convert to >
  if (selector.includes('>>')) {
    const standardSelector = selector.replace(/>>/g, '>').trim();
    try {
      return doc.querySelector(standardSelector);
    } catch {
      // Still invalid
    }
  }

  // Handle :nth-match() - Playwright's nth matcher
  const nthMatch = selector.match(/^(.+?):nth-match\((\d+)\)$/);
  if (nthMatch) {
    const [, baseSelector, indexStr] = nthMatch;
    const index = parseInt(indexStr, 10) - 1; // Playwright uses 1-based indexing
    try {
      const elements = doc.querySelectorAll(baseSelector.trim());
      if (elements[index]) {
        return elements[index];
      }
    } catch {
      // Base selector invalid
    }
    return null;
  }

  // Handle :visible pseudo-class (just remove it, we can't check visibility in DOM)
  if (selector.includes(':visible')) {
    const cleanedSelector = selector.replace(/:visible/g, '').trim();
    try {
      return doc.querySelector(cleanedSelector);
    } catch {
      // Still invalid
    }
  }

  console.warn(`[operations] Could not parse selector: ${selector}`);
  return null;
}

/**
 * Safe querySelectorAll that handles non-standard selector syntax
 */
function querySelectorAllSafe(doc: Document, selector: string): Element[] {
  // First try the selector as-is
  try {
    return Array.from(doc.querySelectorAll(selector));
  } catch {
    // Selector is invalid, try to transform it
  }

  // Handle :has-text("...") for querySelectorAll
  const hasTextMatch = selector.match(/^(.+?):has-text\(["'](.+?)["']\)$/);
  if (hasTextMatch) {
    const [, baseSelector, searchText] = hasTextMatch;
    try {
      const elements = doc.querySelectorAll(baseSelector.trim() || '*');
      return Array.from(elements).filter(el => el.textContent?.includes(searchText));
    } catch {
      // Base selector also invalid
    }
    return [];
  }

  // Handle >> (Playwright child combinator)
  if (selector.includes('>>')) {
    const standardSelector = selector.replace(/>>/g, '>').trim();
    try {
      return Array.from(doc.querySelectorAll(standardSelector));
    } catch {
      // Still invalid
    }
  }

  // Handle :visible pseudo-class
  if (selector.includes(':visible')) {
    const cleanedSelector = selector.replace(/:visible/g, '').trim();
    try {
      return Array.from(doc.querySelectorAll(cleanedSelector));
    } catch {
      // Still invalid
    }
  }

  console.warn(`[operations] Could not parse selector for querySelectorAll: ${selector}`);
  return [];
}

/**
 * Insert HTML at specified position relative to target element
 */
export function insertHTML(
  target: Element,
  position: InsertPosition,
  html: string
): OperationResult {
  try {
    const doc = getDocument(target);
    const fragment = parseHTMLFragment(doc, html);

    switch (position) {
      case 'before':
        target.parentElement?.insertBefore(fragment, target);
        break;
      case 'after':
        target.parentElement?.insertBefore(fragment, target.nextSibling);
        break;
      case 'prepend':
        target.insertBefore(fragment, target.firstChild);
        break;
      case 'append':
        target.appendChild(fragment);
        break;
      case 'replace':
        target.parentElement?.replaceChild(fragment, target);
        break;
      default:
        return { success: false, error: `Unknown position: ${position}` };
    }

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update text content of an element
 */
export function updateText(
  element: Element,
  text: string
): OperationResult {
  try {
    element.textContent = text;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update inner HTML of an element
 */
export function updateHTML(
  element: Element,
  html: string
): OperationResult {
  try {
    element.innerHTML = html;
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update an attribute on an element
 */
export function updateAttribute(
  element: Element,
  attribute: string,
  value: string
): OperationResult {
  try {
    element.setAttribute(attribute, value);
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove an attribute from an element
 */
export function removeAttribute(
  element: Element,
  attribute: string
): OperationResult {
  try {
    element.removeAttribute(attribute);
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Add CSS classes to an element
 */
export function addClass(
  element: Element,
  classes: string
): OperationResult {
  try {
    const classNames = classes.split(/\s+/).filter(Boolean);
    element.classList.add(...classNames);
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove CSS classes from an element
 */
export function removeClass(
  element: Element,
  classes: string
): OperationResult {
  try {
    const classNames = classes.split(/\s+/).filter(Boolean);
    element.classList.remove(...classNames);
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Replace a CSS class with another
 */
export function replaceClass(
  element: Element,
  oldClass: string,
  newClass: string
): OperationResult {
  try {
    element.classList.replace(oldClass, newClass);
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove an element from the DOM
 */
export function removeElement(element: Element): OperationResult {
  try {
    element.remove();
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Wrap an element with a container
 */
export function wrapElement(
  element: Element,
  wrapperHtml: string
): OperationResult {
  try {
    const doc = getDocument(element);
    const fragment = parseHTMLFragment(doc, wrapperHtml);
    const wrapper = fragment.firstElementChild;

    if (!wrapper) {
      return { success: false, error: 'Invalid wrapper HTML' };
    }

    element.parentElement?.insertBefore(wrapper, element);
    wrapper.appendChild(element);

    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Clone an element and insert at a new location
 */
export function cloneElement(
  source: Element,
  target: Element,
  position: Exclude<InsertPosition, 'replace'>
): OperationResult {
  try {
    const clone = source.cloneNode(true) as Element;
    return insertHTML(target, position, clone.outerHTML);
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Hide an element
 */
export function hideElement(element: Element): OperationResult {
  try {
    (element as HTMLElement).style.display = 'none';
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Show an element
 */
export function showElement(
  element: Element,
  display?: string
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;
    if (display) {
      htmlEl.style.display = display;
    } else {
      htmlEl.style.removeProperty('display');
    }
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Set inline styles on an element
 */
export function setStyles(
  element: Element,
  styles: Record<string, string | number>
): OperationResult {
  try {
    const htmlEl = element as HTMLElement;
    for (const [prop, value] of Object.entries(styles)) {
      // Convert camelCase to kebab-case
      const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      htmlEl.style.setProperty(cssProp, String(value));
    }
    return { success: true, elementsAffected: 1 };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Update all elements matching a selector
 */
export function updateAll(
  doc: Document,
  selector: string,
  text: string
): OperationResult {
  try {
    // Use safe selector that handles Playwright-style syntax from LLM
    const elements = querySelectorAllSafe(doc, selector);
    for (const el of elements) {
      el.textContent = text;
    }
    return { success: true, elementsAffected: elements.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Remove all elements matching a selector
 */
export function removeAll(
  doc: Document,
  selector: string
): OperationResult {
  try {
    // Use safe selector that handles Playwright-style syntax from LLM
    const elements = querySelectorAllSafe(doc, selector);
    for (const el of elements) {
      el.remove();
    }
    return { success: true, elementsAffected: elements.length };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Execute a DOM operation based on modification instruction
 */
export function executeOperation(
  doc: Document,
  mod: Modification
): OperationResult {
  const { tool, selector, position, params } = mod;

  // Handle operations that don't need a selector
  if (tool === 'update_all') {
    return updateAll(doc, selector!, params.text as string);
  }
  if (tool === 'remove_all') {
    return removeAll(doc, selector!);
  }

  // Most operations require selecting an element
  if (!selector) {
    return { success: false, error: 'Selector required for this operation' };
  }

  // Use safe selector that handles Playwright-style syntax from LLM
  const element = querySelectorSafe(doc, selector);
  if (!element) {
    return { success: false, error: `Element not found: ${selector}` };
  }

  switch (tool) {
    case 'update_text':
      return updateText(element, params.text as string);

    case 'update_html':
      return updateHTML(element, params.html as string);

    case 'update_attribute':
      return updateAttribute(element, params.attribute as string, params.value as string);

    case 'remove_attribute':
      return removeAttribute(element, params.attribute as string);

    case 'add_class':
      return addClass(element, params.classes as string);

    case 'remove_class':
      return removeClass(element, params.classes as string);

    case 'replace_class':
      return replaceClass(element, params.oldClass as string, params.newClass as string);

    case 'remove_element':
      return removeElement(element);

    case 'add_element':
      return insertHTML(element, position || 'append', params.html as string);

    case 'wrap_element':
      return wrapElement(element, params.wrapperHtml as string);

    case 'clone_element': {
      const targetEl = querySelectorSafe(doc, params.targetSelector as string);
      if (!targetEl) {
        return { success: false, error: `Target not found: ${params.targetSelector}` };
      }
      return cloneElement(element, targetEl, (params.position || 'after') as Exclude<InsertPosition, 'replace'>);
    }

    case 'hide_element':
      return hideElement(element);

    case 'show_element':
      return showElement(element, params.display as string | undefined);

    case 'set_style':
      return setStyles(element, params.styles as Record<string, string | number>);

    default:
      return { success: false, error: `Unknown operation: ${tool}` };
  }
}
