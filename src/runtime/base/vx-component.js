/**
 * VxComponent - Base Web Component class for Voxel prototypes
 *
 * Provides automatic connection to VxStore, reactive rendering,
 * and common utilities for building interactive prototypes.
 */

import { VxStore } from '../vx-store.js';

class VxComponent extends HTMLElement {
  // Override in subclasses to define observed attributes
  static get observedAttributes() {
    return [];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Component-local state (not in global store)
    this._localState = {};

    // Reference to global store
    this._store = null;

    // Subscription cleanup functions
    this._unsubscribers = [];

    // Bound methods for event handlers
    this._boundHandlers = new Map();

    // Whether component has been initialized
    this._initialized = false;

    // Design tokens CSS (injected from parent)
    this._tokensCss = '';
  }

  /**
   * Called when element is added to DOM
   */
  connectedCallback() {
    // Connect to global store
    this._store = window.VxStore || new VxStore();

    // Check for design tokens in document
    this._loadDesignTokens();

    // Initialize component (override in subclass)
    this.init();

    // Set up store subscriptions
    this._setupSubscriptions();

    // Initial render
    this.render();

    this._initialized = true;

    // Post-render initialization
    this.afterRender();
  }

  /**
   * Called when element is removed from DOM
   */
  disconnectedCallback() {
    // Clean up subscriptions
    this._unsubscribers.forEach(unsub => unsub());
    this._unsubscribers = [];

    // Clean up event handlers
    this._boundHandlers.clear();

    // Component cleanup (override in subclass)
    this.cleanup();
  }

  /**
   * Called when observed attribute changes
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this._initialized) {
      this.onAttributeChange(name, oldValue, newValue);
      this.render();
    }
  }

  // ============ Override in Subclasses ============

  /**
   * Initialize component - called once when connected
   */
  init() {}

  /**
   * Render the component - called on state/attribute changes
   */
  render() {
    this.shadowRoot.innerHTML = this.template();
    this._attachEventListeners();
  }

  /**
   * Return the HTML template string
   */
  template() {
    return '';
  }

  /**
   * Return CSS styles string
   */
  styles() {
    return '';
  }

  /**
   * Called after render completes
   */
  afterRender() {}

  /**
   * Called when component is disconnected
   */
  cleanup() {}

  /**
   * Called when an observed attribute changes
   */
  onAttributeChange(name, oldValue, newValue) {}

  /**
   * Define which store paths this component subscribes to
   * @returns {string[]} Array of paths to subscribe to
   */
  getSubscribedPaths() {
    return [];
  }

  /**
   * Called when a subscribed store path changes
   */
  onStoreChange(path, newValue, oldValue) {}

  // ============ Store Methods ============

  /**
   * Get value from global store
   */
  getState(path) {
    return this._store?.get(path);
  }

  /**
   * Set value in global store
   */
  setState(path, value) {
    this._store?.set(path, value);
  }

  /**
   * Toggle boolean in global store
   */
  toggleState(path) {
    this._store?.toggle(path);
  }

  /**
   * Dispatch a custom event that other components can listen to
   */
  dispatch(eventName, detail = {}) {
    const event = new CustomEvent(eventName, {
      bubbles: true,
      composed: true, // Cross shadow DOM boundaries
      detail
    });
    this.dispatchEvent(event);
  }

  // ============ Local State Methods ============

  /**
   * Get local state value
   */
  getLocal(key) {
    return this._localState[key];
  }

  /**
   * Set local state value (triggers re-render)
   */
  setLocal(key, value) {
    this._localState[key] = value;
    if (this._initialized) {
      this.render();
    }
  }

  // ============ Attribute Helpers ============

  /**
   * Get attribute as string
   */
  getAttr(name, defaultValue = '') {
    return this.getAttribute(name) ?? defaultValue;
  }

  /**
   * Get attribute as boolean
   */
  getBoolAttr(name) {
    return this.hasAttribute(name);
  }

  /**
   * Get attribute as number
   */
  getNumAttr(name, defaultValue = 0) {
    const value = this.getAttribute(name);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get attribute as JSON
   */
  getJsonAttr(name, defaultValue = null) {
    const value = this.getAttribute(name);
    if (!value) return defaultValue;
    try {
      return JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }

  // ============ Utility Methods ============

  /**
   * Query element in shadow DOM
   */
  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  /**
   * Query all elements in shadow DOM
   */
  $$(selector) {
    return this.shadowRoot.querySelectorAll(selector);
  }

  /**
   * Add event listener with automatic cleanup
   */
  on(selector, event, handler) {
    const element = typeof selector === 'string' ? this.$(selector) : selector;
    if (!element) return;

    // Create bound handler for cleanup
    const boundHandler = handler.bind(this);
    this._boundHandlers.set(`${selector}-${event}`, { element, event, handler: boundHandler });

    element.addEventListener(event, boundHandler);
  }

  /**
   * Remove event listener
   */
  off(selector, event) {
    const key = `${selector}-${event}`;
    const binding = this._boundHandlers.get(key);
    if (binding) {
      binding.element.removeEventListener(binding.event, binding.handler);
      this._boundHandlers.delete(key);
    }
  }

  /**
   * Create HTML from template literal
   */
  html(strings, ...values) {
    return strings.reduce((result, str, i) => {
      const value = values[i];
      if (value === undefined || value === null) {
        return result + str;
      }
      if (Array.isArray(value)) {
        return result + str + value.join('');
      }
      return result + str + value;
    }, '');
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Generate unique ID
   */
  uid(prefix = 'vx') {
    return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get base styles with design tokens
   */
  getBaseStyles() {
    return `
      ${this._tokensCss}

      :host {
        display: block;
        box-sizing: border-box;
      }

      :host([hidden]) {
        display: none;
      }

      *,
      *::before,
      *::after {
        box-sizing: inherit;
      }

      ${this.styles()}
    `;
  }

  // ============ Private Methods ============

  _setupSubscriptions() {
    const paths = this.getSubscribedPaths();

    // Subscribe to global store changes
    const globalUnsub = this._store?.subscribe((state, changedPath, oldValue, newValue) => {
      if (changedPath === null) {
        // Full state change (reset/fromJSON)
        this.render();
      } else if (paths.length === 0 || paths.some(p =>
        changedPath === p ||
        changedPath.startsWith(p + '.') ||
        p.startsWith(changedPath + '.')
      )) {
        this.onStoreChange(changedPath, newValue, oldValue);
        this.render();
      }
    });

    if (globalUnsub) {
      this._unsubscribers.push(globalUnsub);
    }
  }

  _loadDesignTokens() {
    // Look for design tokens in various locations
    const tokensStyle = document.querySelector('style[data-vx-tokens]');
    if (tokensStyle) {
      this._tokensCss = tokensStyle.textContent;
      return;
    }

    // Check for tokens.css link
    const tokensLink = document.querySelector('link[href*="tokens.css"]');
    if (tokensLink) {
      // Will be loaded via @import in component styles
      this._tokensCss = `@import url("${tokensLink.href}");`;
      return;
    }

    // Default tokens if none found
    this._tokensCss = this._getDefaultTokens();
  }

  _getDefaultTokens() {
    return `
      :host {
        /* Default color tokens */
        --color-primary: #6366f1;
        --color-primary-hover: #4f46e5;
        --color-primary-light: #e0e7ff;
        --color-secondary: #64748b;
        --color-success: #22c55e;
        --color-warning: #f59e0b;
        --color-error: #ef4444;
        --color-info: #3b82f6;

        --color-background: #ffffff;
        --color-surface: #f8fafc;
        --color-border: #e2e8f0;

        --color-text: #1e293b;
        --color-text-secondary: #64748b;
        --color-text-inverse: #ffffff;

        /* Typography tokens */
        --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-size-xs: 0.75rem;
        --font-size-sm: 0.875rem;
        --font-size-base: 1rem;
        --font-size-lg: 1.125rem;
        --font-size-xl: 1.25rem;
        --font-size-2xl: 1.5rem;

        --font-weight-normal: 400;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
        --font-weight-bold: 700;

        --line-height-tight: 1.25;
        --line-height-normal: 1.5;
        --line-height-relaxed: 1.75;

        /* Spacing tokens */
        --spacing-xs: 0.25rem;
        --spacing-sm: 0.5rem;
        --spacing-md: 1rem;
        --spacing-lg: 1.5rem;
        --spacing-xl: 2rem;
        --spacing-2xl: 3rem;

        /* Border radius tokens */
        --radius-sm: 0.25rem;
        --radius-md: 0.375rem;
        --radius-lg: 0.5rem;
        --radius-xl: 0.75rem;
        --radius-full: 9999px;

        /* Shadow tokens */
        --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);

        /* Transition tokens */
        --transition-fast: 150ms ease;
        --transition-normal: 200ms ease;
        --transition-slow: 300ms ease;

        /* Z-index tokens */
        --z-dropdown: 1000;
        --z-sticky: 1100;
        --z-fixed: 1200;
        --z-modal-backdrop: 1300;
        --z-modal: 1400;
        --z-popover: 1500;
        --z-tooltip: 1600;
        --z-toast: 1700;
      }
    `;
  }

  _attachEventListeners() {
    // Find elements with data-on-* attributes and attach handlers
    const elements = this.shadowRoot.querySelectorAll('[data-on-click], [data-on-submit], [data-on-input], [data-on-change]');

    elements.forEach(el => {
      const events = ['click', 'submit', 'input', 'change'];
      events.forEach(event => {
        const handlerName = el.dataset[`on${event.charAt(0).toUpperCase() + event.slice(1)}`];
        if (handlerName && typeof this[handlerName] === 'function') {
          el.addEventListener(event, (e) => this[handlerName](e));
        }
      });
    });
  }
}

// Export for both ES modules and browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VxComponent };
}

if (typeof window !== 'undefined') {
  window.VxComponent = VxComponent;
}

export { VxComponent };
export default VxComponent;
