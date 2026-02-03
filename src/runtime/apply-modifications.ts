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
  // Parse source HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceHtml, 'text/html');

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

  // Inject VxRuntime initialization script
  injectRuntimeInit(doc, modifications);

  // Remove any existing building indicator
  const buildingIndicator = doc.querySelector('.vx-building-indicator');
  if (buildingIndicator) {
    buildingIndicator.remove();
  }

  // Serialize back to HTML string
  return doc.documentElement.outerHTML;
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
 * Inject VxRuntime initialization script
 */
function injectRuntimeInit(doc: Document, modifications: ModificationsJson): void {
  // Remove any existing runtime script
  const existingScript = doc.querySelector('script[data-vx-runtime]');
  if (existingScript) {
    existingScript.remove();
  }

  // Create initialization script
  const script = doc.createElement('script');
  script.setAttribute('data-vx-runtime', 'true');

  const initConfig = {
    initialState: modifications.initialState,
    flows: modifications.flows,
    debug: true,
  };

  script.textContent = `
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof window.initVxRuntime === 'function') {
        window.initVxRuntime(${JSON.stringify(initConfig, null, 2)});
        console.log('[VxRuntime] Initialized with modifications-based config');
      } else {
        console.warn('[VxRuntime] initVxRuntime not found, runtime may not be loaded');
      }
    });
  `;

  // Append to body
  const body = doc.body || doc.querySelector('body');
  if (body) {
    body.appendChild(script);
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
    injectRuntimeInit(doc, modifications);
  }

  return doc.documentElement.outerHTML;
}

export default applyModificationsToHtml;
