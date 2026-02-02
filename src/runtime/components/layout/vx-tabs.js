/**
 * VxTabs - Tab Navigation Web Component
 *
 * A tabbed interface component with keyboard navigation and state binding.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxTabs extends VxComponent {
  static get observedAttributes() {
    return ['tabs', 'active-tab', 'state-path', 'variant', 'orientation'];
  }

  getSubscribedPaths() {
    const statePath = this.getAttr('state-path');
    return statePath ? [statePath] : [];
  }

  init() {
    this._activeTab = this.getAttr('active-tab') || null;
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  styles() {
    return `
      .tabs-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      .tabs-wrapper.vertical {
        flex-direction: row;
      }

      /* Tab list */
      .tabs-list {
        display: flex;
        border-bottom: 1px solid var(--color-border);
        gap: var(--spacing-xs);
      }

      .tabs-wrapper.vertical .tabs-list {
        flex-direction: column;
        border-bottom: none;
        border-right: 1px solid var(--color-border);
        padding-right: var(--spacing-sm);
        margin-right: var(--spacing-md);
      }

      /* Variants */
      .tabs-list.variant-underline {
        border-bottom: 1px solid var(--color-border);
      }

      .tabs-list.variant-pills {
        border-bottom: none;
        background: var(--color-surface);
        padding: var(--spacing-xs);
        border-radius: var(--radius-md);
      }

      .tabs-list.variant-enclosed {
        border-bottom: none;
        gap: 0;
      }

      /* Tab button */
      .tab-button {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--font-family);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);
        position: relative;
        white-space: nowrap;
      }

      .tab-button:hover {
        color: var(--color-text);
      }

      .tab-button:focus {
        outline: none;
      }

      .tab-button:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: -2px;
      }

      .tab-button.active {
        color: var(--color-primary);
      }

      .tab-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Underline variant */
      .variant-underline .tab-button::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--color-primary);
        transform: scaleX(0);
        transition: transform var(--transition-fast);
      }

      .variant-underline .tab-button.active::after {
        transform: scaleX(1);
      }

      /* Pills variant */
      .variant-pills .tab-button {
        border-radius: var(--radius-sm);
      }

      .variant-pills .tab-button.active {
        background: var(--color-background);
        color: var(--color-text);
        box-shadow: var(--shadow-sm);
      }

      /* Enclosed variant */
      .variant-enclosed .tab-button {
        border: 1px solid transparent;
        border-bottom-color: var(--color-border);
        margin-bottom: -1px;
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
      }

      .variant-enclosed .tab-button.active {
        border-color: var(--color-border);
        border-bottom-color: var(--color-background);
        background: var(--color-background);
      }

      /* Tab icon */
      .tab-icon {
        width: 16px;
        height: 16px;
      }

      .tab-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Tab badge */
      .tab-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 6px;
        background: var(--color-primary);
        color: var(--color-text-inverse);
        border-radius: var(--radius-full);
        font-size: 11px;
        font-weight: var(--font-weight-semibold);
      }

      .tab-button:not(.active) .tab-badge {
        background: var(--color-secondary);
      }

      /* Tab panels */
      .tabs-panels {
        flex: 1;
      }

      .tab-panel {
        display: none;
        padding: var(--spacing-md) 0;
      }

      .tab-panel.active {
        display: block;
        animation: fadeIn var(--transition-fast);
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* Vertical orientation */
      .tabs-wrapper.vertical .tabs-panels {
        padding-left: var(--spacing-md);
      }

      .tabs-wrapper.vertical .tab-panel {
        padding: 0;
      }
    `;
  }

  template() {
    const tabs = this._getTabs();
    const activeTab = this._getActiveTab(tabs);
    const variant = this.getAttr('variant', 'underline');
    const orientation = this.getAttr('orientation', 'horizontal');

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="tabs-wrapper ${orientation === 'vertical' ? 'vertical' : ''}">
        <div class="tabs-list variant-${variant}" role="tablist" aria-orientation="${orientation}">
          ${tabs.map((tab, idx) => `
            <button
              class="tab-button ${tab.id === activeTab ? 'active' : ''}"
              role="tab"
              id="tab-${tab.id}"
              aria-selected="${tab.id === activeTab}"
              aria-controls="panel-${tab.id}"
              tabindex="${tab.id === activeTab ? '0' : '-1'}"
              ${tab.disabled ? 'disabled' : ''}
              data-tab-id="${tab.id}"
            >
              ${tab.icon ? `<span class="tab-icon">${tab.icon}</span>` : ''}
              ${this.escapeHtml(tab.label)}
              ${tab.badge !== undefined ? `<span class="tab-badge">${tab.badge}</span>` : ''}
            </button>
          `).join('')}
        </div>

        <div class="tabs-panels">
          ${tabs.map(tab => `
            <div
              class="tab-panel ${tab.id === activeTab ? 'active' : ''}"
              role="tabpanel"
              id="panel-${tab.id}"
              aria-labelledby="tab-${tab.id}"
              ${tab.id !== activeTab ? 'hidden' : ''}
            >
              <slot name="${tab.id}"></slot>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  afterRender() {
    const tabsList = this.$('.tabs-list');
    if (!tabsList) return;

    tabsList.addEventListener('keydown', this._handleKeydown);

    // Tab button click handlers
    this.shadowRoot.querySelectorAll('.tab-button').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.disabled) {
          this.setActiveTab(btn.dataset.tabId);
        }
      });
    });
  }

  _getTabs() {
    const tabsAttr = this.getAttr('tabs');
    if (tabsAttr) {
      try {
        return JSON.parse(tabsAttr);
      } catch {
        return [];
      }
    }
    return [];
  }

  _getActiveTab(tabs) {
    // Check state path first
    const statePath = this.getAttr('state-path');
    if (statePath) {
      const stateValue = this.getState(statePath);
      if (stateValue) return stateValue;
    }

    // Check attribute
    if (this._activeTab) return this._activeTab;

    // Default to first tab
    return tabs[0]?.id || null;
  }

  _handleKeydown(e) {
    const tabs = this._getTabs().filter(t => !t.disabled);
    const currentIndex = tabs.findIndex(t => t.id === this._getActiveTab(tabs));
    const orientation = this.getAttr('orientation', 'horizontal');

    const isVertical = orientation === 'vertical';
    const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
    const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';

    let newIndex = currentIndex;

    switch (e.key) {
      case nextKey:
        e.preventDefault();
        newIndex = (currentIndex + 1) % tabs.length;
        break;
      case prevKey:
        e.preventDefault();
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    if (newIndex !== currentIndex && tabs[newIndex]) {
      this.setActiveTab(tabs[newIndex].id);
      // Focus the new tab button
      this.$(`[data-tab-id="${tabs[newIndex].id}"]`)?.focus();
    }
  }

  // Public methods
  setActiveTab(tabId) {
    this._activeTab = tabId;

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, tabId);
    }

    this.render();

    this.dispatch('vx-tab-change', {
      tabId,
      tab: this._getTabs().find(t => t.id === tabId),
    });
  }

  getActiveTab() {
    return this._getActiveTab(this._getTabs());
  }
}

customElements.define('vx-tabs', VxTabs);

export { VxTabs };
export default VxTabs;
