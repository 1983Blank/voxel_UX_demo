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

  window.VxStoreClass = VxStore;
  window.VxComponentClass = VxComponent;
  window.VxFlowEngineClass = VxFlowEngine;

  window.initVxRuntime = function(options = {}) {
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
      el.addEventListener('click', () => {
        const flowName = el.getAttribute('trigger-flow');
        if (flowName && window.VxFlowEngine) {
          window.VxFlowEngine.executeFlow(flowName);
        }
      });
    });

    // Auto-bind set-state attributes
    document.querySelectorAll('[set-state]').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('set-state');
        const value = el.getAttribute('set-to');
        if (path && window.VxStore) {
          let parsedValue = value;
          try { parsedValue = JSON.parse(value); } catch {}
          window.VxStore.set(path, parsedValue);
        }
      });
    });

    // Auto-bind toggle-state attributes
    document.querySelectorAll('[toggle-state]').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.getAttribute('toggle-state');
        if (path && window.VxStore) {
          window.VxStore.toggle(path);
        }
      });
    });

    return { store: window.VxStore, flowEngine: window.VxFlowEngine };
  };

  console.log('[VxRuntime] Bundle loaded successfully');
})();
</script>
`.trim();
}

/**
 * Inject the VxRuntime bundle into generated HTML
 * Replaces script imports with the inline bundle
 */
export function injectVxRuntimeBundle(html: string): string {
  const bundle = generateVxRuntimeBundle();

  // If the HTML already has a VxRuntime bundle, don't inject again
  if (html.includes('VxRuntime Bundle')) {
    return html;
  }

  // Inject bundle after <head> opening tag or before </head>
  if (html.includes('</head>')) {
    return html.replace('</head>', `${bundle}\n</head>`);
  }

  // If no head, inject after doctype or at beginning
  if (html.includes('<!DOCTYPE')) {
    return html.replace(/<!DOCTYPE[^>]*>/i, (match) => `${match}\n<head>${bundle}</head>`);
  }

  // Fallback: prepend to HTML
  return `<head>${bundle}</head>\n${html}`;
}

/**
 * Component script to inject
 */
interface ComponentScript {
  path: string;
  content: string;
}

/**
 * Inject component scripts inline into HTML
 * This is necessary because ES module imports don't work with blob URLs
 */
export function injectComponentScripts(html: string, components: ComponentScript[]): string {
  if (!components || components.length === 0) {
    return html;
  }

  // Build inline script tags for all components
  const componentScripts = components
    .filter(c => c.path.endsWith('.js') && c.content)
    .map(c => {
      // Wrap component code to ensure it doesn't pollute global scope
      // and handles any syntax errors gracefully
      return `
<!-- Component: ${c.path} -->
<script>
(function() {
  try {
${c.content}
  } catch (e) {
    console.error('[VxComponent] Error loading ${c.path}:', e);
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
 * Prepare generated HTML for preview in an iframe with blob URL
 * Injects runtime bundle and component scripts inline
 */
export function preparePrototypeHtml(
  html: string,
  components: ComponentScript[] = []
): string {
  // First inject the runtime bundle
  let processed = injectVxRuntimeBundle(html);

  // Then inject component scripts
  processed = injectComponentScripts(processed, components);

  return processed;
}
