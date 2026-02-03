/**
 * VxRuntime Bundle Generator
 *
 * Generates a self-contained runtime bundle that can be embedded
 * directly into prototype HTML files without external imports.
 */

/**
 * Generate the bundled VxRuntime code as a string
 * This includes VxStore, VxComponent, and VxFlowEngine
 */
export function generateVxRuntimeBundle(): string {
  return `
<!-- Voxel Runtime Bundle - Auto-generated -->
<script>
(function() {
  'use strict';

  // ============================================================================
  // VxStore - Global state manager
  // ============================================================================

  class VxStore {
    constructor(initialState = {}) {
      this._state = this._deepClone(initialState);
      this._subscribers = new Set();
      this._pathSubscribers = new Map();
      this._history = [];
      this._historyLimit = 50;
    }

    get(path) {
      if (!path) return this._state;
      return path.split('.').reduce((obj, key) => obj?.[key], this._state);
    }

    set(path, value, options = {}) {
      const { silent = false } = options;
      if (!silent) this._pushHistory();

      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((obj, key) => {
        if (obj[key] === undefined || obj[key] === null) obj[key] = {};
        return obj[key];
      }, this._state);

      const oldValue = target[last];
      target[last] = value;

      if (!silent) this._notify(path, oldValue, value);
      return this;
    }

    toggle(path) {
      const current = this.get(path);
      if (typeof current === 'boolean') this.set(path, !current);
      return this;
    }

    subscribe(callback) {
      this._subscribers.add(callback);
      callback(this._state, null, null, null);
      return () => this._subscribers.delete(callback);
    }

    subscribeTo(path, callback) {
      if (!this._pathSubscribers.has(path)) {
        this._pathSubscribers.set(path, new Set());
      }
      this._pathSubscribers.get(path).add(callback);
      callback(this.get(path), undefined, this._state);
      return () => {
        const subs = this._pathSubscribers.get(path);
        if (subs) {
          subs.delete(callback);
          if (subs.size === 0) this._pathSubscribers.delete(path);
        }
      };
    }

    getState() { return this._deepClone(this._state); }

    reset(newState = {}) {
      this._pushHistory();
      this._state = this._deepClone(newState);
      this._notify();
      return this;
    }

    _notify(changedPath = null, oldValue = null, newValue = null) {
      this._subscribers.forEach(cb => {
        try { cb(this._state, changedPath, oldValue, newValue); }
        catch (e) { console.error('[VxStore] Subscriber error:', e); }
      });

      if (changedPath) {
        this._pathSubscribers.forEach((subscribers, path) => {
          if (changedPath === path || changedPath.startsWith(path + '.') || path.startsWith(changedPath + '.')) {
            const currentValue = this.get(path);
            subscribers.forEach(cb => {
              try { cb(currentValue, path === changedPath ? oldValue : undefined, this._state); }
              catch (e) { console.error('[VxStore] Path subscriber error:', e); }
            });
          }
        });
      }
    }

    _pushHistory() {
      this._history.push(this._deepClone(this._state));
      if (this._history.length > this._historyLimit) this._history.shift();
    }

    _deepClone(obj) {
      if (obj === null || typeof obj !== 'object') return obj;
      if (obj instanceof Date) return new Date(obj);
      if (Array.isArray(obj)) return obj.map(item => this._deepClone(item));
      const cloned = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          cloned[key] = this._deepClone(obj[key]);
        }
      }
      return cloned;
    }
  }

  // ============================================================================
  // VxComponent - Base Web Component class
  // ============================================================================

  class VxComponent extends HTMLElement {
    static get observedAttributes() { return []; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._localState = {};
      this._store = null;
      this._unsubscribers = [];
      this._initialized = false;
      this._tokensCss = '';
    }

    connectedCallback() {
      this._store = window.VxStore;
      this._loadDesignTokens();
      this.init();
      this._setupSubscriptions();
      this.render();
      this._initialized = true;
      this.afterRender();
    }

    disconnectedCallback() {
      this._unsubscribers.forEach(unsub => unsub());
      this._unsubscribers = [];
      this.cleanup();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue !== newValue && this._initialized) {
        this.onAttributeChange(name, oldValue, newValue);
        this.render();
      }
    }

    // Override in subclasses
    init() {}
    template() { return ''; }
    styles() { return ''; }
    afterRender() {}
    cleanup() {}
    onAttributeChange(name, oldValue, newValue) {}
    getSubscribedPaths() { return []; }
    onStoreChange(path, newValue, oldValue) {}

    render() {
      this.shadowRoot.innerHTML = this.template();
      this._attachEventListeners();
    }

    // Store methods
    getState(path) { return this._store?.get(path); }
    setState(path, value) { this._store?.set(path, value); }
    toggleState(path) { this._store?.toggle(path); }

    dispatch(eventName, detail = {}) {
      this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true, detail }));
    }

    // Local state
    getLocal(key) { return this._localState[key]; }
    setLocal(key, value) {
      this._localState[key] = value;
      if (this._initialized) this.render();
    }

    // Attribute helpers
    getAttr(name, defaultValue = '') { return this.getAttribute(name) ?? defaultValue; }
    getBoolAttr(name) { return this.hasAttribute(name); }

    // Utility methods
    $(selector) { return this.shadowRoot.querySelector(selector); }
    $$(selector) { return this.shadowRoot.querySelectorAll(selector); }

    getBaseStyles() {
      return this._tokensCss + ':host { display: block; box-sizing: border-box; }' +
        ':host([hidden]) { display: none; }' +
        '*, *::before, *::after { box-sizing: inherit; }' +
        this.styles();
    }

    _setupSubscriptions() {
      const paths = this.getSubscribedPaths();
      const globalUnsub = this._store?.subscribe((state, changedPath, oldValue, newValue) => {
        if (changedPath === null) {
          this.render();
        } else if (paths.length === 0 || paths.some(p =>
          changedPath === p || changedPath.startsWith(p + '.') || p.startsWith(changedPath + '.')
        )) {
          this.onStoreChange(changedPath, newValue, oldValue);
          this.render();
        }
      });
      if (globalUnsub) this._unsubscribers.push(globalUnsub);
    }

    _loadDesignTokens() {
      const tokensStyle = document.querySelector('style[data-vx-tokens]');
      if (tokensStyle) {
        this._tokensCss = tokensStyle.textContent;
        return;
      }
      this._tokensCss = this._getDefaultTokens();
    }

    _getDefaultTokens() {
      return ':host { --color-primary: #6366f1; --color-primary-hover: #4f46e5; --color-secondary: #64748b; --color-success: #22c55e; --color-error: #ef4444; --color-background: #ffffff; --color-surface: #f8fafc; --color-border: #e2e8f0; --color-text: #1e293b; --color-text-secondary: #64748b; --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; --spacing-sm: 0.5rem; --spacing-md: 1rem; --spacing-lg: 1.5rem; --radius-md: 0.375rem; --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1); --transition-normal: 200ms ease; }';
    }

    _attachEventListeners() {
      const elements = this.shadowRoot.querySelectorAll('[data-on-click], [data-on-submit], [data-on-input], [data-on-change]');
      elements.forEach(el => {
        ['click', 'submit', 'input', 'change'].forEach(event => {
          const handlerName = el.dataset['on' + event.charAt(0).toUpperCase() + event.slice(1)];
          if (handlerName && typeof this[handlerName] === 'function') {
            el.addEventListener(event, (e) => this[handlerName](e));
          }
        });
      });
    }
  }

  // ============================================================================
  // VxFlowEngine - Flow execution engine
  // ============================================================================

  class VxFlowEngine {
    constructor(store, flows = [], options = {}) {
      this._store = store;
      this._flows = flows;
      this._options = { debug: false, ...options };
      this._activeFlows = new Map();
      this._setupFlowTriggers();
    }

    loadFlows(flows) {
      this._flows = flows;
      this._setupFlowTriggers();
    }

    async executeFlow(flowName, context = {}) {
      const flow = this._flows.find(f => f.name === flowName);
      if (!flow) {
        console.warn('[VxFlowEngine] Flow not found:', flowName);
        return false;
      }
      if (this._activeFlows.has(flowName)) return false;
      if (flow.when && !this._evaluateCondition(flow.when)) return false;

      const flowContext = { name: flowName, startTime: Date.now(), currentStep: 0, context, aborted: false };
      this._activeFlows.set(flowName, flowContext);

      if (this._options.debug) console.log('[VxFlowEngine] Starting flow:', flowName);

      try {
        for (let i = 0; i < flow.steps.length; i++) {
          if (flowContext.aborted) break;
          flowContext.currentStep = i;
          await this._executeStep(flow.steps[i], flowContext);
        }
        this._activeFlows.delete(flowName);
        return true;
      } catch (error) {
        console.error('[VxFlowEngine] Flow error:', flowName, error);
        this._activeFlows.delete(flowName);
        return false;
      }
    }

    async _executeStep(step, flowContext) {
      if (step.if !== undefined) {
        const condition = this._evaluateCondition(step.if);
        const branch = condition ? step.then : step.else;
        if (branch) {
          for (const s of branch) await this._executeStep(s, flowContext);
        }
        return;
      }

      if (step.delay) {
        await new Promise(resolve => setTimeout(resolve, step.delay));
      }

      if (step.after !== undefined) {
        await new Promise(resolve => setTimeout(resolve, step.after));
      }

      if (step.set !== undefined) {
        this._store.set(step.set, this._processValue(step.to, flowContext));
      }

      if (step.toggle !== undefined) {
        this._store.toggle(step.toggle);
      }

      if (step.flow) {
        await this.executeFlow(step.flow, flowContext.context);
      }
    }

    _evaluateCondition(condition) {
      if (typeof condition === 'string') {
        const value = this._store.get(condition);
        return Boolean(value);
      }
      if (typeof condition === 'object') {
        return Object.entries(condition).every(([path, expected]) => {
          const actual = this._store.get(path);
          return actual === expected;
        });
      }
      return Boolean(condition);
    }

    _processValue(value, flowContext) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const path = value.slice(1);
        if (path.startsWith('context.')) {
          const contextPath = path.slice(8);
          return contextPath.split('.').reduce((obj, key) => obj?.[key], flowContext.context);
        }
        return this._store.get(path);
      }
      return value;
    }

    _setupFlowTriggers() {
      this._flows.forEach(flow => {
        if (flow.trigger) {
          const { event, selector } = flow.trigger;
          if (event && selector) {
            document.addEventListener(event, (e) => {
              if (e.target.matches(selector)) {
                this.executeFlow(flow.name, { event: e, element: e.target });
              }
            });
          }
        }
      });
    }
  }

  // ============================================================================
  // Initialize Runtime
  // ============================================================================

  // Mark the runtime as loaded (for verification)
  window.__VX_RUNTIME_LOADED__ = true;

  window.VxStoreClass = VxStore;
  window.VxComponentClass = VxComponent;
  window.VxFlowEngineClass = VxFlowEngine;

  window.initVxRuntime = function(options = {}) {
    try {
      const { initialState = {}, flows = [], debug = false } = options;

      window.VxStore = new VxStore(initialState);

      if (flows.length > 0) {
        window.VxFlowEngine = new VxFlowEngine(window.VxStore, flows, { debug });
      }

      if (debug) {
        console.log('[VxRuntime] Initialized with state:', initialState);
        console.log('[VxRuntime] Registered flows:', flows.map(f => f.name));
      }

      // Auto-bind trigger-flow attributes
      document.querySelectorAll('[trigger-flow]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const flowName = el.getAttribute('trigger-flow');
          if (flowName && window.VxFlowEngine) {
            console.log('[VxRuntime] Executing flow:', flowName);
            window.VxFlowEngine.executeFlow(flowName);
          }
        });
      });

      // Auto-bind set-state attributes
      document.querySelectorAll('[set-state]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const path = el.getAttribute('set-state');
          const value = el.getAttribute('set-to');
          if (path && window.VxStore) {
            let parsedValue = value;
            try { parsedValue = JSON.parse(value); } catch {}
            console.log('[VxRuntime] Setting state:', path, '=', parsedValue);
            window.VxStore.set(path, parsedValue);
          }
        });
      });

      // Auto-bind toggle-state attributes
      document.querySelectorAll('[toggle-state]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const path = el.getAttribute('toggle-state');
          if (path && window.VxStore) {
            console.log('[VxRuntime] Toggling state:', path);
            window.VxStore.toggle(path);
          }
        });
      });

      // Auto-bind visibility based on state (vx-show attribute)
      function updateVisibility() {
        document.querySelectorAll('[vx-show]').forEach(el => {
          const path = el.getAttribute('vx-show');
          const negate = path.startsWith('!');
          const actualPath = negate ? path.slice(1) : path;
          const value = window.VxStore.get(actualPath);
          const shouldShow = negate ? !value : !!value;
          el.style.display = shouldShow ? '' : 'none';
        });
      }

      // Initial visibility update
      updateVisibility();

      // Subscribe to state changes for visibility
      window.VxStore.subscribe(() => {
        updateVisibility();
      });

      // Intercept all link clicks to prevent navigation away from prototype
      // Only allow links with trigger-flow or set-state attributes to work
      document.addEventListener('click', function(e) {
        const target = e.target;
        const link = target.closest('a');
        if (link) {
          const href = link.getAttribute('href');
          // Allow trigger-flow and set-state links
          if (link.hasAttribute('trigger-flow') || link.hasAttribute('set-state') || link.hasAttribute('toggle-state')) {
            e.preventDefault();
            return;
          }
          // Allow anchor links (#)
          if (href && href.startsWith('#')) {
            return;
          }
          // Prevent all other navigation
          if (href && href !== '#' && !href.startsWith('javascript:')) {
            e.preventDefault();
            console.log('[VxRuntime] Blocked navigation to:', href);
          }
        }
      }, true);

      console.log('[VxRuntime] Initialized successfully');
      return { store: window.VxStore, flowEngine: window.VxFlowEngine };
    } catch (e) {
      console.error('[VxRuntime] Failed to initialize:', e);
      return null;
    }
  };

  // Add global error handler for better debugging
  window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('VxComponent')) {
      console.error('[VxRuntime] Component error:', e.message, e.filename, e.lineno);
    }
  });

  console.log('[VxRuntime] Bundle loaded successfully (VxComponentClass:', typeof VxComponent, ')');

  // Auto-initialize if config is available (from modifications-based assembly)
  if (window.__VX_RUNTIME_CONFIG__) {
    console.log('[VxRuntime] Found pre-configured config, auto-initializing...');
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        window.initVxRuntime(window.__VX_RUNTIME_CONFIG__);
      });
    } else {
      window.initVxRuntime(window.__VX_RUNTIME_CONFIG__);
    }
  }
})();
</script>
`.trim();
}

/**
 * Ensure HTML has proper structure (html, head, body tags)
 * LLM-generated HTML often lacks this structure
 */
function ensureProperHtmlStructure(html: string): string {
  const hasHtmlTag = /<html[^>]*>/i.test(html);
  const hasHeadTag = /<head[^>]*>/i.test(html);
  const hasBodyTag = /<body[^>]*>/i.test(html);
  const hasDoctype = /<!DOCTYPE/i.test(html);

  // If it has all the structure, return as-is
  if (hasHtmlTag && hasHeadTag && hasBodyTag) {
    return html;
  }

  console.log('[VxRuntime] HTML missing structure, wrapping with proper tags');

  // Extract any style and script tags from the content
  const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
  const scriptMatches = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];

  // Remove extracted styles and scripts from content to put in proper places
  let bodyContent = html;
  for (const style of styleMatches) {
    bodyContent = bodyContent.replace(style, '');
  }
  for (const script of scriptMatches) {
    bodyContent = bodyContent.replace(script, '');
  }

  // Build proper HTML structure
  const doctype = hasDoctype ? '' : '<!DOCTYPE html>\n';
  const styles = styleMatches.join('\n');
  const scripts = scriptMatches.join('\n');

  return `${doctype}<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype</title>
  ${styles}
</head>
<body>
${bodyContent.trim()}
${scripts}
</body>
</html>`;
}

/**
 * Inject the VxRuntime bundle into generated HTML
 * Replaces script imports with the inline bundle
 */
export function injectVxRuntimeBundle(html: string): string {
  const bundle = generateVxRuntimeBundle();

  // If the HTML already has a VxRuntime bundle, don't inject again
  if (html.includes('VxRuntime Bundle')) {
    console.log('[VxRuntime] Bundle already present, skipping injection');
    return html;
  }

  // First ensure the HTML has proper structure
  let processed = ensureProperHtmlStructure(html);

  console.log('[VxRuntime] Injecting runtime bundle into HTML...');

  // Now we're guaranteed to have a <head> tag - inject there
  if (processed.includes('</head>')) {
    console.log('[VxRuntime] Injecting bundle in <head>');
    return processed.replace('</head>', `${bundle}\n</head>`);
  }

  // Should never reach here after ensureProperHtmlStructure, but just in case
  console.log('[VxRuntime] Fallback: prepending bundle to HTML');
  return `${bundle}\n${processed}`;
}

/**
 * Component script to inject
 */
interface ComponentScript {
  path: string;
  content: string;
}

/**
 * Sanitize code that may contain LLM-generated characters that break JavaScript
 * Handles smart quotes, fancy characters, and other common LLM output issues
 */
function sanitizeLLMCode(code: string): string {
  let sanitized = code;

  // Replace smart/curly quotes with straight quotes (common LLM issue)
  sanitized = sanitized.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"'); // Various double quotes
  sanitized = sanitized.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // Various single quotes
  sanitized = sanitized.replace(/[\u00AB\u00BB]/g, '"'); // Guillemets

  // Replace fancy dashes with regular hyphens/dashes
  sanitized = sanitized.replace(/[\u2013\u2014\u2015]/g, '-');

  // Replace non-breaking spaces with regular spaces
  sanitized = sanitized.replace(/[\u00A0\u2007\u202F]/g, ' ');

  // Remove zero-width characters that can cause issues
  sanitized = sanitized.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

  // Replace ellipsis character with three dots
  sanitized = sanitized.replace(/\u2026/g, '...');

  return sanitized;
}

/**
 * Clean up component code to remove ES module syntax that doesn't work inline
 */
function cleanComponentCode(code: string): string {
  // First sanitize LLM-generated characters
  let cleaned = sanitizeLLMCode(code);

  // Remove export statements
  cleaned = cleaned.replace(/export\s*\{\s*[^}]*\s*\};?/g, '');
  cleaned = cleaned.replace(/export\s+default\s+/g, '');
  cleaned = cleaned.replace(/export\s+/g, '');

  // Remove import statements
  cleaned = cleaned.replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '');
  cleaned = cleaned.replace(/import\s+['"][^'"]+['"];?\s*/g, '');

  // Replace VxComponent with window.VxComponentClass if needed
  cleaned = cleaned.replace(/extends\s+VxComponent\b/g, 'extends window.VxComponentClass');

  // Ensure window.VxComponentClass is used
  if (!cleaned.includes('window.VxComponentClass') && cleaned.includes('extends')) {
    console.warn('[VxComponent] Component may not extend VxComponentClass properly');
  }

  // CRITICAL: Escape </script> in string literals to prevent breaking HTML
  // This is a common issue when code contains template literals with HTML
  cleaned = cleaned.replace(/<\/script>/gi, '<\\/script>');

  // Also handle the case where it might be in a string
  cleaned = cleaned.replace(/<\/script/gi, () => '<\\/script');

  return cleaned;
}

/**
 * Inject component scripts inline into HTML
 * This is necessary because ES module imports don't work with blob URLs
 */
export function injectComponentScripts(html: string, components: ComponentScript[]): string {
  if (!components || components.length === 0) {
    console.log('[VxRuntime] No components to inject');
    return html;
  }

  console.log(`[VxRuntime] Injecting ${components.length} component scripts...`);

  // Build inline script tags for all components
  const componentScripts = components
    .filter(c => c.path.endsWith('.js') && c.content)
    .map(c => {
      // Clean up the component code to remove ES module syntax
      const cleanedCode = cleanComponentCode(c.content);

      // Escape the path for use in strings
      const safePath = c.path.replace(/'/g, "\\'");

      // Wrap component code to ensure it doesn't pollute global scope
      // and handles any syntax errors gracefully
      // Use a deferred execution to ensure runtime is fully loaded
      return `
<!-- Component: ${safePath} -->
<script>
(function() {
  'use strict';

  function loadComponent() {
    if (typeof window.VxComponentClass === 'undefined') {
      console.error('[VxComponent] VxComponentClass not available for ${safePath}! Retrying...');
      // Retry after a short delay
      setTimeout(loadComponent, 50);
      return;
    }
    try {
${cleanedCode}
      console.log('[VxComponent] Loaded: ${safePath}');
    } catch (e) {
      console.error('[VxComponent] Error loading ${safePath}:', e.message);
      console.error('[VxComponent] Stack:', e.stack);
    }
  }

  // Use DOMContentLoaded or run immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadComponent);
  } else {
    loadComponent();
  }
})();
</script>`;
    })
    .join('\n');

  // Remove any script tags that reference component files
  // These won't work with blob URLs anyway
  let processed = html.replace(/<script[^>]*src=["'][^"']*components\/[^"']*\.js["'][^>]*><\/script>/gi, '');

  // Also remove type="module" script imports for runtime
  processed = processed.replace(/<script[^>]*src=["'][^"']*runtime\/[^"']*\.js["'][^>]*><\/script>/gi, '');

  // Inject components before </body> or at the end
  if (processed.includes('</body>')) {
    return processed.replace('</body>', `${componentScripts}\n</body>`);
  }

  // Fallback: append to end
  return processed + componentScripts;
}

/**
 * Sanitize JavaScript within HTML script tags
 * Finds all script tags and sanitizes their content for LLM artifacts
 */
function sanitizeScriptsInHtml(html: string): string {
  // Find and sanitize all inline script contents
  return html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
    // Don't touch scripts with src attribute (external scripts)
    if (attrs.includes('src=')) {
      return match;
    }
    // Sanitize the script content
    const sanitizedContent = sanitizeLLMCode(content);
    return `<script${attrs}>${sanitizedContent}</script>`;
  });
}

/**
 * Prepare generated HTML for preview in an iframe with blob URL
 * Injects runtime bundle and component scripts inline
 */
export function preparePrototypeHtml(
  html: string,
  components: ComponentScript[] = []
): string {
  // First sanitize any LLM-generated scripts in the HTML
  let processed = sanitizeScriptsInHtml(html);

  // Then inject the runtime bundle
  processed = injectVxRuntimeBundle(processed);

  // Then inject component scripts
  processed = injectComponentScripts(processed, components);

  return processed;
}
