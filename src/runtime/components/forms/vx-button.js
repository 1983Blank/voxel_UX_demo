/**
 * VxButton - Button Web Component
 *
 * A versatile button component with loading states, variants, and icons.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxButton extends VxComponent {
  static get observedAttributes() {
    return ['variant', 'size', 'disabled', 'loading', 'icon', 'icon-position', 'type', 'full-width'];
  }

  init() {
    this._handleClick = this._handleClick.bind(this);
  }

  styles() {
    return `
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--spacing-sm);
        font-family: var(--font-family);
        font-weight: var(--font-weight-medium);
        border: none;
        cursor: pointer;
        transition: all var(--transition-fast);
        text-decoration: none;
        white-space: nowrap;
      }

      button:focus {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Sizes */
      button.size-sm {
        height: 32px;
        padding: 0 var(--spacing-sm);
        font-size: var(--font-size-sm);
        border-radius: var(--radius-sm);
      }

      button.size-md {
        height: 40px;
        padding: 0 var(--spacing-md);
        font-size: var(--font-size-base);
        border-radius: var(--radius-md);
      }

      button.size-lg {
        height: 48px;
        padding: 0 var(--spacing-lg);
        font-size: var(--font-size-lg);
        border-radius: var(--radius-md);
      }

      /* Variants */
      button.variant-primary {
        background: var(--color-primary);
        color: var(--color-text-inverse);
      }

      button.variant-primary:hover:not(:disabled) {
        background: var(--color-primary-hover);
      }

      button.variant-secondary {
        background: var(--color-surface);
        color: var(--color-text);
        border: 1px solid var(--color-border);
      }

      button.variant-secondary:hover:not(:disabled) {
        background: var(--color-border);
      }

      button.variant-ghost {
        background: transparent;
        color: var(--color-text);
      }

      button.variant-ghost:hover:not(:disabled) {
        background: var(--color-surface);
      }

      button.variant-danger {
        background: var(--color-error);
        color: var(--color-text-inverse);
      }

      button.variant-danger:hover:not(:disabled) {
        opacity: 0.9;
      }

      button.variant-success {
        background: var(--color-success);
        color: var(--color-text-inverse);
      }

      button.variant-success:hover:not(:disabled) {
        opacity: 0.9;
      }

      button.variant-link {
        background: transparent;
        color: var(--color-primary);
        padding: 0;
        height: auto;
      }

      button.variant-link:hover:not(:disabled) {
        text-decoration: underline;
      }

      /* Full width */
      button.full-width {
        width: 100%;
      }

      /* Loading state */
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Icon */
      .icon {
        width: 1em;
        height: 1em;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .icon svg {
        width: 100%;
        height: 100%;
      }
    `;
  }

  template() {
    const variant = this.getAttr('variant', 'primary');
    const size = this.getAttr('size', 'md');
    const disabled = this.getBoolAttr('disabled') || this.getBoolAttr('loading');
    const loading = this.getBoolAttr('loading');
    const icon = this.getAttr('icon');
    const iconPosition = this.getAttr('icon-position', 'left');
    const type = this.getAttr('type', 'button');
    const fullWidth = this.getBoolAttr('full-width');

    const classes = [
      `variant-${variant}`,
      `size-${size}`,
      fullWidth ? 'full-width' : '',
    ].filter(Boolean).join(' ');

    const iconHtml = icon ? `<span class="icon">${this._getIcon(icon)}</span>` : '';
    const loadingHtml = loading ? '<span class="spinner"></span>' : '';

    const leftContent = iconPosition === 'left' ? (loading ? loadingHtml : iconHtml) : '';
    const rightContent = iconPosition === 'right' ? (loading ? loadingHtml : iconHtml) : '';

    return `
      <style>${this.getBaseStyles()}</style>
      <button
        type="${type}"
        class="${classes}"
        ${disabled ? 'disabled' : ''}
        data-on-click="_handleClick"
      >
        ${leftContent}
        <slot></slot>
        ${rightContent}
      </button>
    `;
  }

  afterRender() {
    const button = this.$('button');
    if (button) {
      button.addEventListener('click', this._handleClick);
    }
  }

  _handleClick(event) {
    if (this.getBoolAttr('disabled') || this.getBoolAttr('loading')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Check for state action attributes
    const setState = this.getAttr('set-state');
    const setTo = this.getAttr('set-to');
    const toggleState = this.getAttr('toggle-state');
    const triggerFlow = this.getAttr('trigger-flow');

    if (toggleState) {
      this.toggleState(toggleState);
    }

    if (setState && setTo !== '') {
      let value = setTo;
      if (setTo === 'true') value = true;
      else if (setTo === 'false') value = false;
      else if (!isNaN(Number(setTo))) value = Number(setTo);
      this.setState(setState, value);
    }

    if (triggerFlow && window.VxFlowEngine) {
      window.VxFlowEngine.trigger(triggerFlow);
    }

    // Dispatch custom event
    this.dispatch('vx-click', {
      button: this,
      setState,
      setTo,
      toggleState,
      triggerFlow,
    });
  }

  _getIcon(name) {
    // Common icons as inline SVGs
    const icons = {
      'check': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>',
      'x': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'plus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      'minus': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      'arrow-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>',
      'arrow-left': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/></svg>',
      'chevron-down': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6,9 12,15 18,9"/></svg>',
      'chevron-up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18,15 12,9 6,15"/></svg>',
      'edit': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      'trash': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      'search': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      'settings': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      'cart': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      'heart': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      'star': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>',
      'user': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    };

    return icons[name] || '';
  }
}

// Register the custom element
customElements.define('vx-button', VxButton);

export { VxButton };
export default VxButton;
