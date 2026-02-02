/**
 * VxAccordion - Accordion Web Component
 *
 * An expandable/collapsible section component with animation support.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxAccordion extends VxComponent {
  static get observedAttributes() {
    return ['items', 'allow-multiple', 'default-open', 'state-path', 'variant'];
  }

  init() {
    this._openItems = new Set();

    // Initialize default open items
    const defaultOpen = this.getAttr('default-open');
    if (defaultOpen) {
      defaultOpen.split(',').forEach(id => this._openItems.add(id.trim()));
    }
  }

  styles() {
    return `
      .accordion {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      /* Variants */
      .accordion.variant-default {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .accordion.variant-separated {
        gap: var(--spacing-sm);
      }

      .accordion.variant-minimal {
        gap: 0;
      }

      /* Accordion item */
      .accordion-item {
        background: var(--color-background);
      }

      .variant-default .accordion-item {
        border-bottom: 1px solid var(--color-border);
      }

      .variant-default .accordion-item:last-child {
        border-bottom: none;
      }

      .variant-separated .accordion-item {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
      }

      .variant-minimal .accordion-item {
        border-bottom: 1px solid var(--color-border);
      }

      /* Accordion header */
      .accordion-header {
        display: flex;
        width: 100%;
      }

      .accordion-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--spacing-md);
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--font-family);
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
        text-align: left;
        transition: all var(--transition-fast);
      }

      .accordion-trigger:hover {
        background: var(--color-surface);
      }

      .accordion-trigger:focus {
        outline: none;
      }

      .accordion-trigger:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: -2px;
      }

      .accordion-trigger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .accordion-trigger:disabled:hover {
        background: transparent;
      }

      .accordion-trigger-content {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        flex: 1;
        min-width: 0;
      }

      .accordion-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--color-text-secondary);
      }

      .accordion-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .accordion-subtitle {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-normal);
        color: var(--color-text-secondary);
      }

      .accordion-chevron {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--color-text-secondary);
        transition: transform var(--transition-fast);
      }

      .accordion-item.is-open .accordion-chevron {
        transform: rotate(180deg);
      }

      /* Accordion content */
      .accordion-content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows var(--transition-normal);
      }

      .accordion-item.is-open .accordion-content {
        grid-template-rows: 1fr;
      }

      .accordion-content-inner {
        overflow: hidden;
      }

      .accordion-body {
        padding: 0 var(--spacing-md) var(--spacing-md);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        line-height: var(--line-height-relaxed);
      }

      /* Badge */
      .accordion-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 8px;
        background: var(--color-primary-light);
        color: var(--color-primary);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-medium);
      }
    `;
  }

  template() {
    const items = this._getItems();
    const variant = this.getAttr('variant', 'default');

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="accordion variant-${variant}">
        ${items.map((item, idx) => this._renderItem(item, idx)).join('')}
      </div>
    `;
  }

  _renderItem(item, index) {
    const isOpen = this._isItemOpen(item.id);

    return `
      <div class="accordion-item ${isOpen ? 'is-open' : ''}" data-item-id="${item.id}">
        <h3 class="accordion-header">
          <button
            class="accordion-trigger"
            type="button"
            aria-expanded="${isOpen}"
            aria-controls="content-${item.id}"
            ${item.disabled ? 'disabled' : ''}
            data-trigger-id="${item.id}"
          >
            <span class="accordion-trigger-content">
              ${item.icon ? `<span class="accordion-icon">${item.icon}</span>` : ''}
              <span class="accordion-title">
                ${this.escapeHtml(item.title)}
                ${item.subtitle ? `<span class="accordion-subtitle">${this.escapeHtml(item.subtitle)}</span>` : ''}
              </span>
              ${item.badge ? `<span class="accordion-badge">${this.escapeHtml(item.badge)}</span>` : ''}
            </span>
            <svg class="accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6,9 12,15 18,9"/>
            </svg>
          </button>
        </h3>
        <div class="accordion-content" id="content-${item.id}" role="region" aria-labelledby="trigger-${item.id}">
          <div class="accordion-content-inner">
            <div class="accordion-body">
              ${item.content ? this.escapeHtml(item.content) : ''}
              <slot name="${item.id}"></slot>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  afterRender() {
    this.shadowRoot.querySelectorAll('.accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        if (!trigger.disabled) {
          this.toggle(trigger.dataset.triggerId);
        }
      });

      // Keyboard support
      trigger.addEventListener('keydown', (e) => {
        const items = this._getItems().filter(i => !i.disabled);
        const currentIndex = items.findIndex(i => i.id === trigger.dataset.triggerId);

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            this._focusTrigger(items[(currentIndex + 1) % items.length]?.id);
            break;
          case 'ArrowUp':
            e.preventDefault();
            this._focusTrigger(items[(currentIndex - 1 + items.length) % items.length]?.id);
            break;
          case 'Home':
            e.preventDefault();
            this._focusTrigger(items[0]?.id);
            break;
          case 'End':
            e.preventDefault();
            this._focusTrigger(items[items.length - 1]?.id);
            break;
        }
      });
    });
  }

  _getItems() {
    const itemsAttr = this.getAttr('items');
    if (itemsAttr) {
      try {
        return JSON.parse(itemsAttr);
      } catch {
        return [];
      }
    }
    return [];
  }

  _isItemOpen(itemId) {
    // Check state path first
    const statePath = this.getAttr('state-path');
    if (statePath) {
      const stateValue = this.getState(`${statePath}.${itemId}`);
      if (stateValue !== undefined) return stateValue;
    }

    return this._openItems.has(itemId);
  }

  _focusTrigger(itemId) {
    if (itemId) {
      this.$(`[data-trigger-id="${itemId}"]`)?.focus();
    }
  }

  // Public methods
  toggle(itemId) {
    const allowMultiple = this.getBoolAttr('allow-multiple');
    const isOpen = this._isItemOpen(itemId);

    if (isOpen) {
      this._openItems.delete(itemId);
    } else {
      if (!allowMultiple) {
        this._openItems.clear();
      }
      this._openItems.add(itemId);
    }

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(`${statePath}.${itemId}`, !isOpen);
    }

    this.render();

    this.dispatch('vx-accordion-change', {
      itemId,
      isOpen: !isOpen,
      openItems: Array.from(this._openItems),
    });
  }

  open(itemId) {
    if (!this._isItemOpen(itemId)) {
      this.toggle(itemId);
    }
  }

  close(itemId) {
    if (this._isItemOpen(itemId)) {
      this.toggle(itemId);
    }
  }

  openAll() {
    const items = this._getItems().filter(i => !i.disabled);
    items.forEach(item => {
      this._openItems.add(item.id);
    });
    this.render();
  }

  closeAll() {
    this._openItems.clear();
    this.render();
  }

  getOpenItems() {
    return Array.from(this._openItems);
  }
}

customElements.define('vx-accordion', VxAccordion);

export { VxAccordion };
export default VxAccordion;
