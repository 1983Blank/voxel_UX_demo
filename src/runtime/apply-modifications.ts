/**
 * Apply Modifications to HTML
 *
 * This module applies a ModificationsJson spec to source HTML,
 * adding interactivity attributes without regenerating the entire page.
 *
 * Benefits over full HTML regeneration:
 * - Much smaller LLM output (JSON vs full HTML)
 * - Preserves exact source HTML styling
 * - Faster and more reliable (no 90s timeout)
 * - Easier to debug and validate
 */

import type { ModificationsJson, HtmlModification } from '../types/agentTypes';

/**
 * Apply modifications to source HTML
 *
 * @param sourceHtml - The original captured HTML
 * @param modifications - The modifications spec from LLM
 * @param tokensCss - Optional design tokens CSS to inject
 * @returns Modified HTML with interactivity added
 */
export function applyModificationsToHtml(
  sourceHtml: string,
  modifications: ModificationsJson,
  tokensCss?: string
): string {
  console.log('[applyModificationsToHtml] Source HTML length:', sourceHtml?.length || 0);
  console.log('[applyModificationsToHtml] Source starts with:', sourceHtml?.slice(0, 100));
  console.log('[applyModificationsToHtml] Modifications count:', modifications?.modifications?.length || 0);

  if (!sourceHtml || sourceHtml.length === 0) {
    console.error('[applyModificationsToHtml] ERROR: Empty source HTML!');
    throw new Error('Cannot apply modifications to empty source HTML');
  }

  // Validate that sourceHtml is actually HTML, not JavaScript or other content
  const trimmedHtml = sourceHtml.trim();
  const looksLikeHtml = (
    trimmedHtml.startsWith('<!DOCTYPE') ||
    trimmedHtml.startsWith('<!doctype') ||
    trimmedHtml.startsWith('<html') ||
    trimmedHtml.startsWith('<HTML') ||
    (trimmedHtml.includes('<head') && trimmedHtml.includes('<body')) ||
    (trimmedHtml.includes('<HEAD') && trimmedHtml.includes('<BODY'))
  );

  const looksLikeJavaScript = (
    trimmedHtml.startsWith('(function') ||
    trimmedHtml.startsWith('function') ||
    trimmedHtml.startsWith('const ') ||
    trimmedHtml.startsWith('let ') ||
    trimmedHtml.startsWith('var ') ||
    trimmedHtml.startsWith('class ') ||
    trimmedHtml.startsWith('import ') ||
    trimmedHtml.startsWith('export ') ||
    trimmedHtml.startsWith('"use strict"') ||
    trimmedHtml.startsWith("'use strict'") ||
    /^\/\*[\s\S]*?\*\//.test(trimmedHtml) // Starts with JS block comment
  );

  if (looksLikeJavaScript) {
    console.error('[applyModificationsToHtml] ERROR: Source looks like JavaScript, not HTML!');
    console.error('[applyModificationsToHtml] First 300 chars:', sourceHtml.slice(0, 300));
    throw new Error('Cannot apply modifications: source content is JavaScript, not HTML');
  }

  if (!looksLikeHtml) {
    console.warn('[applyModificationsToHtml] WARNING: Source may not be valid HTML');
    console.warn('[applyModificationsToHtml] First 300 chars:', sourceHtml.slice(0, 300));
  }

  // Parse source HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceHtml, 'text/html');

  // Check if parsing failed
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    console.error('[applyModificationsToHtml] HTML parsing error:', parserError.textContent);
  }

  // Apply each modification
  for (const mod of modifications.modifications) {
    try {
      applyModification(doc, mod);
    } catch (error) {
      console.warn(`[ApplyModifications] Failed to apply modification:`, mod, error);
    }
  }

  // Inject tokens CSS if provided
  if (tokensCss) {
    injectTokensCss(doc, tokensCss);
  }

  // Inject VxRuntime configuration as a data script (NOT the init call)
  // The actual initVxRuntime will be called by preparePrototypeHtml after the runtime bundle is loaded
  injectRuntimeConfig(doc, modifications);

  // Remove any existing building indicator
  const buildingIndicator = doc.querySelector('.vx-building-indicator');
  if (buildingIndicator) {
    buildingIndicator.remove();
  }

  // Serialize back to HTML string with DOCTYPE
  const doctype = '<!DOCTYPE html>\n';
  const result = doctype + doc.documentElement.outerHTML;

  console.log('[applyModificationsToHtml] Output HTML length:', result.length);
  console.log('[applyModificationsToHtml] Output starts with:', result.slice(0, 100));
  console.log('[applyModificationsToHtml] Has <body>:', result.includes('<body'));
  console.log('[applyModificationsToHtml] Has </body>:', result.includes('</body>'));

  return result;
}

/**
 * Apply a single modification to the document
 */
function applyModification(doc: Document, mod: HtmlModification): void {
  const elements = doc.querySelectorAll(mod.selector);

  if (elements.length === 0) {
    console.warn(`[ApplyModifications] No elements found for selector: ${mod.selector}`);
    return;
  }

  elements.forEach(element => {
    switch (mod.type) {
      case 'add_attribute':
        if (mod.attribute && mod.value !== undefined) {
          element.setAttribute(mod.attribute, mod.value);
        }
        break;

      case 'inject_element':
        if (mod.html) {
          const temp = doc.createElement('template');
          temp.innerHTML = mod.html.trim();
          const newElement = temp.content.firstElementChild;

          if (newElement) {
            switch (mod.position) {
              case 'before':
                element.parentNode?.insertBefore(newElement, element);
                break;
              case 'after':
                element.parentNode?.insertBefore(newElement, element.nextSibling);
                break;
              case 'prepend':
                element.insertBefore(newElement, element.firstChild);
                break;
              case 'append':
              default:
                element.appendChild(newElement);
                break;
            }
          }
        }
        break;

      case 'wrap_element':
        if (mod.html) {
          const temp = doc.createElement('template');
          temp.innerHTML = mod.html.trim();
          const wrapper = temp.content.firstElementChild;

          if (wrapper) {
            const parent = element.parentNode;
            if (parent) {
              parent.insertBefore(wrapper, element);
              // Find placeholder or append
              const placeholder = wrapper.querySelector('[data-vx-content]');
              if (placeholder) {
                placeholder.replaceWith(element);
              } else {
                wrapper.appendChild(element);
              }
            }
          }
        }
        break;

      case 'replace_content':
        if (mod.value !== undefined) {
          element.textContent = mod.value;
        }
        break;
    }
  });
}

/**
 * Inject design tokens CSS into the document
 */
function injectTokensCss(doc: Document, tokensCss: string): void {
  // Check if style already exists
  const existingStyle = doc.querySelector('style[data-vx-tokens]');
  if (existingStyle) {
    existingStyle.textContent = tokensCss;
    return;
  }

  // Create new style element
  const style = doc.createElement('style');
  style.setAttribute('data-vx-tokens', 'true');
  style.textContent = tokensCss;

  // Insert at beginning of head
  const head = doc.head || doc.querySelector('head');
  if (head) {
    head.insertBefore(style, head.firstChild);
  }
}

/**
 * Inject VxRuntime configuration as a global variable
 * The actual initialization happens later via preparePrototypeHtml
 */
function injectRuntimeConfig(doc: Document, modifications: ModificationsJson): void {
  // Remove any existing config script
  const existingScript = doc.querySelector('script[data-vx-config]');
  if (existingScript) {
    existingScript.remove();
  }

  // Create config script that stores the config for later use
  const script = doc.createElement('script');
  script.setAttribute('data-vx-config', 'true');

  const initConfig = {
    initialState: modifications.initialState || {},
    flows: modifications.flows || [],
    debug: true,
  };

  // Store config as a global variable that the runtime will pick up
  // Use a safer JSON serialization approach
  const configJson = JSON.stringify(initConfig)
    .replace(/</g, '\\u003c')  // Escape < to prevent script injection
    .replace(/>/g, '\\u003e')  // Escape > to prevent script injection
    .replace(/&/g, '\\u0026'); // Escape & for safety

  script.textContent = `window.__VX_RUNTIME_CONFIG__ = ${configJson};`;

  // Insert in head so it's available before runtime loads
  const head = doc.head || doc.querySelector('head');
  if (head) {
    head.insertBefore(script, head.firstChild);
  }
}

/**
 * Create a preview HTML from source with modifications applied progressively
 * This allows showing partial progress as files are generated
 */
export function createProgressivePreviewHtml(
  sourceHtml: string,
  tokensCss?: string,
  componentsJs?: string[],
  modifications?: ModificationsJson
): string {
  // Start with source HTML
  let html = sourceHtml;

  // Parse and modify
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Inject tokens CSS if available
  if (tokensCss) {
    injectTokensCss(doc, tokensCss);
  }

  // Inject component scripts if available
  if (componentsJs && componentsJs.length > 0) {
    const body = doc.body || doc.querySelector('body');
    if (body) {
      componentsJs.forEach((jsContent, index) => {
        const script = doc.createElement('script');
        script.setAttribute('data-vx-component', `component-${index}`);
        script.textContent = jsContent;
        body.appendChild(script);
      });
    }
  }

  // Apply modifications if available
  if (modifications) {
    for (const mod of modifications.modifications) {
      try {
        applyModification(doc, mod);
      } catch (error) {
        console.warn(`[ProgressivePreview] Failed to apply modification:`, mod, error);
      }
    }
    injectRuntimeConfig(doc, modifications);
  }

  return doc.documentElement.outerHTML;
}

export default applyModificationsToHtml;
