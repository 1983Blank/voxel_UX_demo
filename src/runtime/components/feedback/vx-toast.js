/**
 * VxToast - Toast Notification Web Component
 *
 * A toast notification system that manages multiple toasts with animations.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxToast extends VxComponent {
  static get observedAttributes() {
    return ['type', 'message', 'duration', 'position', 'dismissible'];
  }

  init() {
    this._toasts = [];
    this._toastId = 0;

    // Make toast methods available globally
    window.VxToast = {
      show: this.show.bind(this),
      success: (message, options) => this.show({ ...options, message, type: 'success' }),
      error: (message, options) => this.show({ ...options, message, type: 'error' }),
      warning: (message, options) => this.show({ ...options, message, type: 'warning' }),
      info: (message, options) => this.show({ ...options, message, type: 'info' }),
      dismiss: this.dismiss.bind(this),
      dismissAll: this.dismissAll.bind(this),
    };
  }

  styles() {
    return `
      .toast-container {
        position: fixed;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm);
        z-index: var(--z-toast);
        pointer-events: none;
        max-width: 420px;
        width: 100%;
        padding: var(--spacing-md);
      }

      /* Positions */
      .toast-container.top-right {
        top: 0;
        right: 0;
      }

      .toast-container.top-left {
        top: 0;
        left: 0;
      }

      .toast-container.top-center {
        top: 0;
        left: 50%;
        transform: translateX(-50%);
      }

      .toast-container.bottom-right {
        bottom: 0;
        right: 0;
        flex-direction: column-reverse;
      }

      .toast-container.bottom-left {
        bottom: 0;
        left: 0;
        flex-direction: column-reverse;
      }

      .toast-container.bottom-center {
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        flex-direction: column-reverse;
      }

      /* Toast */
      .toast {
        display: flex;
        align-items: flex-start;
        gap: var(--spacing-sm);
        padding: var(--spacing-md);
        background: var(--color-background);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        pointer-events: auto;
        animation: slideIn var(--transition-normal) ease-out;
        border-left: 4px solid;
      }

      .toast.removing {
        animation: slideOut var(--transition-fast) ease-out forwards;
      }

      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }

      /* Types */
      .toast.type-success {
        border-left-color: var(--color-success);
      }

      .toast.type-success .toast-icon {
        color: var(--color-success);
      }

      .toast.type-error {
        border-left-color: var(--color-error);
      }

      .toast.type-error .toast-icon {
        color: var(--color-error);
      }

      .toast.type-warning {
        border-left-color: var(--color-warning);
      }

      .toast.type-warning .toast-icon {
        color: var(--color-warning);
      }

      .toast.type-info {
        border-left-color: var(--color-info);
      }

      .toast.type-info .toast-icon {
        color: var(--color-info);
      }

      /* Icon */
      .toast-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
      }

      .toast-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Content */
      .toast-content {
        flex: 1;
        min-width: 0;
      }

      .toast-title {
        font-weight: var(--font-weight-semibold);
        color: var(--color-text);
        margin: 0 0 var(--spacing-xs) 0;
        font-size: var(--font-size-sm);
      }

      .toast-message {
        color: var(--color-text-secondary);
        margin: 0;
        font-size: var(--font-size-sm);
        line-height: var(--line-height-normal);
        word-wrap: break-word;
      }

      /* Close button */
      .toast-close {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        border-radius: var(--radius-sm);
        cursor: pointer;
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);
        margin: -4px -4px -4px 0;
      }

      .toast-close:hover {
        background: var(--color-surface);
        color: var(--color-text);
      }

      .toast-close svg {
        width: 16px;
        height: 16px;
      }

      /* Progress bar */
      .toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }

      .toast-progress-bar {
        height: 100%;
        background: currentColor;
        opacity: 0.5;
        animation: progress linear forwards;
      }

      @keyframes progress {
        from { width: 100%; }
        to { width: 0%; }
      }

      /* Actions */
      .toast-actions {
        display: flex;
        gap: var(--spacing-sm);
        margin-top: var(--spacing-sm);
      }

      .toast-action {
        padding: var(--spacing-xs) var(--spacing-sm);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
        border: none;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .toast-action.primary {
        background: var(--color-primary);
        color: var(--color-text-inverse);
      }

      .toast-action.secondary {
        background: var(--color-surface);
        color: var(--color-text);
      }
    `;
  }

  template() {
    const position = this.getAttr('position', 'top-right');

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="toast-container ${position}">
        ${this._toasts.map(toast => this._renderToast(toast)).join('')}
      </div>
    `;
  }

  _renderToast(toast) {
    const { id, type, title, message, dismissible, duration, actions, removing } = toast;

    return `
      <div class="toast type-${type} ${removing ? 'removing' : ''}" data-toast-id="${id}">
        <span class="toast-icon">${this._getIcon(type)}</span>
        <div class="toast-content">
          ${title ? `<p class="toast-title">${this.escapeHtml(title)}</p>` : ''}
          <p class="toast-message">${this.escapeHtml(message)}</p>
          ${actions && actions.length > 0 ? `
            <div class="toast-actions">
              ${actions.map((action, idx) => `
                <button
                  class="toast-action ${action.primary ? 'primary' : 'secondary'}"
                  data-toast-action="${id}-${idx}"
                >
                  ${this.escapeHtml(action.label)}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        ${dismissible ? `
          <button class="toast-close" data-toast-close="${id}" aria-label="Dismiss">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ` : ''}
        ${duration > 0 ? `
          <div class="toast-progress">
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div>
          </div>
        ` : ''}
      </div>
    `;
  }

  afterRender() {
    // Attach close button handlers
    this.shadowRoot.querySelectorAll('[data-toast-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.toastClose);
        this.dismiss(id);
      });
    });

    // Attach action button handlers
    this.shadowRoot.querySelectorAll('[data-toast-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [id, idx] = btn.dataset.toastAction.split('-').map(Number);
        const toast = this._toasts.find(t => t.id === id);
        if (toast?.actions?.[idx]?.onClick) {
          toast.actions[idx].onClick();
        }
        if (toast?.actions?.[idx]?.dismissOnClick !== false) {
          this.dismiss(id);
        }
      });
    });
  }

  _getIcon(type) {
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="9,12 12,15 16,10"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    return icons[type] || icons.info;
  }

  // Public API
  show(options) {
    const toast = {
      id: ++this._toastId,
      type: options.type || 'info',
      title: options.title || '',
      message: options.message || '',
      duration: options.duration ?? 5000,
      dismissible: options.dismissible !== false,
      actions: options.actions || [],
      removing: false,
    };

    this._toasts.push(toast);
    this.render();

    // Auto dismiss
    if (toast.duration > 0) {
      setTimeout(() => {
        this.dismiss(toast.id);
      }, toast.duration);
    }

    this.dispatch('vx-toast-show', { toast });
    return toast.id;
  }

  dismiss(id) {
    const toast = this._toasts.find(t => t.id === id);
    if (!toast || toast.removing) return;

    toast.removing = true;
    this.render();

    // Remove after animation
    setTimeout(() => {
      this._toasts = this._toasts.filter(t => t.id !== id);
      this.render();
      this.dispatch('vx-toast-dismiss', { id });
    }, 150);
  }

  dismissAll() {
    this._toasts.forEach(toast => {
      toast.removing = true;
    });
    this.render();

    setTimeout(() => {
      this._toasts = [];
      this.render();
    }, 150);
  }
}

customElements.define('vx-toast', VxToast);

export { VxToast };
export default VxToast;
