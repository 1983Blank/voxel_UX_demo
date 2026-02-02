/**
 * VxModal - Modal Dialog Web Component
 *
 * A modal component with backdrop, animations, and keyboard navigation.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxModal extends VxComponent {
  static get observedAttributes() {
    return ['open', 'title', 'size', 'closeable', 'state-path'];
  }

  getSubscribedPaths() {
    const statePath = this.getAttr('state-path');
    return statePath ? [statePath] : [];
  }

  init() {
    this._handleKeydown = this._handleKeydown.bind(this);
    this._handleBackdropClick = this._handleBackdropClick.bind(this);
  }

  styles() {
    return `
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: var(--z-modal-backdrop);
        opacity: 0;
        visibility: hidden;
        transition: opacity var(--transition-normal), visibility var(--transition-normal);
      }

      .modal-backdrop.open {
        opacity: 1;
        visibility: visible;
      }

      .modal-content {
        background: var(--color-background);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xl);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        transform: scale(0.95) translateY(10px);
        transition: transform var(--transition-normal);
        overflow: hidden;
      }

      .modal-backdrop.open .modal-content {
        transform: scale(1) translateY(0);
      }

      /* Sizes */
      .modal-content.size-sm {
        width: 100%;
        max-width: 400px;
      }

      .modal-content.size-md {
        width: 100%;
        max-width: 560px;
      }

      .modal-content.size-lg {
        width: 100%;
        max-width: 720px;
      }

      .modal-content.size-xl {
        width: 100%;
        max-width: 900px;
      }

      .modal-content.size-full {
        width: calc(100vw - 48px);
        height: calc(100vh - 48px);
        max-width: none;
        max-height: none;
      }

      /* Header */
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--spacing-md) var(--spacing-lg);
        border-bottom: 1px solid var(--color-border);
        flex-shrink: 0;
      }

      .modal-title {
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
        margin: 0;
      }

      .modal-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: var(--radius-sm);
        cursor: pointer;
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);
      }

      .modal-close:hover {
        background: var(--color-surface);
        color: var(--color-text);
      }

      .modal-close:focus {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .modal-close svg {
        width: 20px;
        height: 20px;
      }

      /* Body */
      .modal-body {
        padding: var(--spacing-lg);
        overflow-y: auto;
        flex: 1;
      }

      /* Footer */
      .modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: var(--spacing-sm);
        padding: var(--spacing-md) var(--spacing-lg);
        border-top: 1px solid var(--color-border);
        flex-shrink: 0;
      }

      /* Slot styling */
      ::slotted([slot="footer"]) {
        display: flex;
        gap: var(--spacing-sm);
      }
    `;
  }

  template() {
    // Check if open from attribute or state
    const statePath = this.getAttr('state-path');
    const isOpenFromAttr = this.getBoolAttr('open');
    const isOpenFromState = statePath ? this.getState(statePath) : false;
    const isOpen = isOpenFromAttr || isOpenFromState;

    const title = this.getAttr('title');
    const size = this.getAttr('size', 'md');
    const closeable = this.getBoolAttr('closeable') !== false;

    const hasFooter = this.querySelector('[slot="footer"]') !== null;

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="modal-backdrop ${isOpen ? 'open' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-content size-${size}">
          ${title || closeable ? `
            <div class="modal-header">
              ${title ? `<h2 id="modal-title" class="modal-title">${this.escapeHtml(title)}</h2>` : '<div></div>'}
              ${closeable ? `
                <button class="modal-close" aria-label="Close modal">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              ` : ''}
            </div>
          ` : ''}

          <div class="modal-body">
            <slot></slot>
          </div>

          ${hasFooter ? `
            <div class="modal-footer">
              <slot name="footer"></slot>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  afterRender() {
    const backdrop = this.$('.modal-backdrop');
    const closeBtn = this.$('.modal-close');

    if (backdrop) {
      backdrop.addEventListener('click', this._handleBackdropClick);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Handle keyboard events
    if (this.isOpen()) {
      document.addEventListener('keydown', this._handleKeydown);
      this._trapFocus();
    }
  }

  cleanup() {
    document.removeEventListener('keydown', this._handleKeydown);
  }

  onStoreChange(path, newValue) {
    const statePath = this.getAttr('state-path');
    if (path === statePath) {
      if (newValue) {
        document.addEventListener('keydown', this._handleKeydown);
        this._trapFocus();
      } else {
        document.removeEventListener('keydown', this._handleKeydown);
      }
    }
  }

  _handleKeydown(event) {
    if (event.key === 'Escape' && this.getBoolAttr('closeable') !== false) {
      this.close();
    }

    if (event.key === 'Tab') {
      this._handleTabKey(event);
    }
  }

  _handleBackdropClick(event) {
    if (event.target.classList.contains('modal-backdrop') && this.getBoolAttr('closeable') !== false) {
      this.close();
    }
  }

  _trapFocus() {
    const focusableElements = this._getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }

  _handleTabKey(event) {
    const focusableElements = this._getFocusableElements();
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement || !this.contains(document.activeElement)) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement || !this.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  _getFocusableElements() {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ];

    const shadowFocusable = this.shadowRoot.querySelectorAll(selectors.join(', '));
    const slottedFocusable = this.querySelectorAll(selectors.join(', '));

    return [...shadowFocusable, ...slottedFocusable];
  }

  // Public methods
  isOpen() {
    const statePath = this.getAttr('state-path');
    if (statePath) {
      return !!this.getState(statePath);
    }
    return this.getBoolAttr('open');
  }

  open() {
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, true);
    } else {
      this.setAttribute('open', '');
    }

    this.dispatch('vx-modal-open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, false);
    } else {
      this.removeAttribute('open');
    }

    this.dispatch('vx-modal-close');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', this._handleKeydown);
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }
}

customElements.define('vx-modal', VxModal);

export { VxModal };
export default VxModal;
