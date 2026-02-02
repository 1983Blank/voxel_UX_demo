/**
 * VxDropdown - Dropdown/Select Web Component
 *
 * A customizable dropdown select component with search and multi-select support.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxDropdown extends VxComponent {
  static get observedAttributes() {
    return [
      'name', 'label', 'placeholder', 'options', 'value',
      'required', 'disabled', 'searchable', 'multiple',
      'error', 'state-path', 'size'
    ];
  }

  init() {
    this._isOpen = false;
    this._searchTerm = '';
    this._selectedValues = [];
    this._highlightedIndex = -1;

    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  styles() {
    return `
      .dropdown-wrapper {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
        width: 100%;
        position: relative;
      }

      label {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
      }

      label .required {
        color: var(--color-error);
        margin-left: 2px;
      }

      .dropdown-trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-sm);
        width: 100%;
        background: var(--color-background);
        border: 1px solid var(--color-border);
        color: var(--color-text);
        cursor: pointer;
        transition: all var(--transition-fast);
        text-align: left;
        font-family: var(--font-family);
      }

      .dropdown-trigger:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-light);
      }

      .dropdown-trigger:disabled {
        background: var(--color-surface);
        cursor: not-allowed;
        opacity: 0.7;
      }

      .dropdown-trigger.has-error {
        border-color: var(--color-error);
      }

      .dropdown-trigger.is-open {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-light);
      }

      /* Sizes */
      .dropdown-trigger.size-sm {
        height: 32px;
        padding: 0 var(--spacing-sm);
        font-size: var(--font-size-sm);
        border-radius: var(--radius-sm);
      }

      .dropdown-trigger.size-md {
        height: 40px;
        padding: 0 var(--spacing-md);
        font-size: var(--font-size-base);
        border-radius: var(--radius-md);
      }

      .dropdown-trigger.size-lg {
        height: 48px;
        padding: 0 var(--spacing-md);
        font-size: var(--font-size-lg);
        border-radius: var(--radius-md);
      }

      .dropdown-value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dropdown-value.placeholder {
        color: var(--color-text-secondary);
      }

      .dropdown-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: var(--color-text-secondary);
        transition: transform var(--transition-fast);
      }

      .dropdown-icon.is-open {
        transform: rotate(180deg);
      }

      /* Multi-select tags */
      .selected-tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-xs);
        flex: 1;
      }

      .selected-tag {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: var(--color-primary-light);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-xs);
        color: var(--color-primary);
      }

      .tag-remove {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 0;
        color: inherit;
        opacity: 0.7;
      }

      .tag-remove:hover {
        opacity: 1;
      }

      /* Dropdown menu */
      .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        margin-top: var(--spacing-xs);
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: var(--z-dropdown);
        max-height: 300px;
        overflow-y: auto;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-8px);
        transition: all var(--transition-fast);
      }

      .dropdown-menu.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      /* Search */
      .dropdown-search {
        padding: var(--spacing-sm);
        border-bottom: 1px solid var(--color-border);
      }

      .dropdown-search input {
        width: 100%;
        padding: var(--spacing-xs) var(--spacing-sm);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        font-size: var(--font-size-sm);
        font-family: var(--font-family);
      }

      .dropdown-search input:focus {
        outline: none;
        border-color: var(--color-primary);
      }

      /* Options */
      .dropdown-options {
        padding: var(--spacing-xs) 0;
      }

      .dropdown-option {
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        cursor: pointer;
        transition: background var(--transition-fast);
        font-size: var(--font-size-sm);
      }

      .dropdown-option:hover,
      .dropdown-option.highlighted {
        background: var(--color-surface);
      }

      .dropdown-option.selected {
        color: var(--color-primary);
        font-weight: var(--font-weight-medium);
      }

      .dropdown-option.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .option-check {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0;
      }

      .dropdown-option.selected .option-check {
        opacity: 1;
        color: var(--color-primary);
      }

      .no-options {
        padding: var(--spacing-md);
        text-align: center;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
      }

      /* Error message */
      .error-message {
        font-size: var(--font-size-xs);
        color: var(--color-error);
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
      }
    `;
  }

  template() {
    const name = this.getAttr('name');
    const label = this.getAttr('label');
    const placeholder = this.getAttr('placeholder', 'Select...');
    const required = this.getBoolAttr('required');
    const disabled = this.getBoolAttr('disabled');
    const searchable = this.getBoolAttr('searchable');
    const multiple = this.getBoolAttr('multiple');
    const error = this.getAttr('error');
    const size = this.getAttr('size', 'md');

    const options = this._getOptions();
    const filteredOptions = this._filterOptions(options);
    const displayValue = this._getDisplayValue(options);

    const triggerClasses = [
      `size-${size}`,
      error ? 'has-error' : '',
      this._isOpen ? 'is-open' : '',
    ].filter(Boolean).join(' ');

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="dropdown-wrapper">
        ${label ? `
          <label>
            ${this.escapeHtml(label)}
            ${required ? '<span class="required">*</span>' : ''}
          </label>
        ` : ''}

        <button
          type="button"
          class="dropdown-trigger ${triggerClasses}"
          ${disabled ? 'disabled' : ''}
          aria-haspopup="listbox"
          aria-expanded="${this._isOpen}"
        >
          ${multiple && this._selectedValues.length > 0 ? `
            <div class="selected-tags">
              ${this._selectedValues.map(val => {
                const opt = options.find(o => o.value === val);
                return `
                  <span class="selected-tag">
                    ${this.escapeHtml(opt?.label || val)}
                    <button type="button" class="tag-remove" data-value="${val}">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </span>
                `;
              }).join('')}
            </div>
          ` : `
            <span class="dropdown-value ${!displayValue ? 'placeholder' : ''}">
              ${displayValue || this.escapeHtml(placeholder)}
            </span>
          `}
          <svg class="dropdown-icon ${this._isOpen ? 'is-open' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6,9 12,15 18,9"/>
          </svg>
        </button>

        <div class="dropdown-menu ${this._isOpen ? 'is-open' : ''}" role="listbox">
          ${searchable ? `
            <div class="dropdown-search">
              <input
                type="text"
                placeholder="Search..."
                value="${this.escapeHtml(this._searchTerm)}"
              />
            </div>
          ` : ''}

          <div class="dropdown-options">
            ${filteredOptions.length > 0 ? filteredOptions.map((opt, idx) => `
              <div
                class="dropdown-option ${this._isSelected(opt.value) ? 'selected' : ''} ${idx === this._highlightedIndex ? 'highlighted' : ''} ${opt.disabled ? 'disabled' : ''}"
                data-value="${opt.value}"
                role="option"
                aria-selected="${this._isSelected(opt.value)}"
              >
                <svg class="option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                ${this.escapeHtml(opt.label)}
              </div>
            `).join('') : `
              <div class="no-options">No options found</div>
            `}
          </div>
        </div>

        ${error ? `
          <div class="error-message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            ${this.escapeHtml(error)}
          </div>
        ` : ''}
      </div>
    `;
  }

  afterRender() {
    const trigger = this.$('.dropdown-trigger');
    const searchInput = this.$('.dropdown-search input');

    if (trigger) {
      trigger.addEventListener('click', () => this._toggleOpen());
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchTerm = e.target.value;
        this._highlightedIndex = 0;
        this.render();
        // Refocus search input
        this.$('.dropdown-search input')?.focus();
      });
    }

    // Option click handlers
    this.shadowRoot.querySelectorAll('.dropdown-option:not(.disabled)').forEach(opt => {
      opt.addEventListener('click', () => {
        this._selectOption(opt.dataset.value);
      });
    });

    // Tag remove handlers
    this.shadowRoot.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeValue(btn.dataset.value);
      });
    });

    // Document click to close
    if (this._isOpen) {
      document.addEventListener('click', this._handleDocumentClick);
      document.addEventListener('keydown', this._handleKeydown);
    }
  }

  cleanup() {
    document.removeEventListener('click', this._handleDocumentClick);
    document.removeEventListener('keydown', this._handleKeydown);
  }

  _getOptions() {
    const optionsAttr = this.getAttr('options');
    if (optionsAttr) {
      try {
        const parsed = JSON.parse(optionsAttr);
        return parsed.map(opt =>
          typeof opt === 'string' ? { value: opt, label: opt } : opt
        );
      } catch {
        return [];
      }
    }
    return [];
  }

  _filterOptions(options) {
    if (!this._searchTerm) return options;
    const term = this._searchTerm.toLowerCase();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(term) ||
      opt.value.toLowerCase().includes(term)
    );
  }

  _getDisplayValue(options) {
    const multiple = this.getBoolAttr('multiple');

    if (multiple) {
      return ''; // Handled by tags
    }

    const valueAttr = this.getAttr('value');
    const value = valueAttr || (this._selectedValues.length > 0 ? this._selectedValues[0] : '');

    if (!value) return '';

    const opt = options.find(o => o.value === value);
    return opt?.label || value;
  }

  _isSelected(value) {
    if (this._selectedValues.includes(value)) return true;
    const valueAttr = this.getAttr('value');
    return valueAttr === value;
  }

  _toggleOpen() {
    if (this.getBoolAttr('disabled')) return;
    this._isOpen = !this._isOpen;
    this._highlightedIndex = -1;
    this._searchTerm = '';
    this.render();

    if (this._isOpen) {
      // Focus search input if searchable
      setTimeout(() => {
        this.$('.dropdown-search input')?.focus();
      }, 0);
    }
  }

  _selectOption(value) {
    const multiple = this.getBoolAttr('multiple');

    if (multiple) {
      if (this._selectedValues.includes(value)) {
        this._selectedValues = this._selectedValues.filter(v => v !== value);
      } else {
        this._selectedValues = [...this._selectedValues, value];
      }
    } else {
      this._selectedValues = [value];
      this._isOpen = false;
    }

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      const stateValue = multiple ? this._selectedValues : this._selectedValues[0] || '';
      this.setState(statePath, stateValue);
    }

    this.render();

    this.dispatch('vx-change', {
      name: this.getAttr('name'),
      value: multiple ? this._selectedValues : this._selectedValues[0] || '',
    });
  }

  _removeValue(value) {
    this._selectedValues = this._selectedValues.filter(v => v !== value);
    this.render();

    this.dispatch('vx-change', {
      name: this.getAttr('name'),
      value: this._selectedValues,
    });
  }

  _handleDocumentClick(e) {
    if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
      this._isOpen = false;
      this.render();
    }
  }

  _handleKeydown(e) {
    const options = this._filterOptions(this._getOptions()).filter(o => !o.disabled);

    switch (e.key) {
      case 'Escape':
        this._isOpen = false;
        this.render();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this._highlightedIndex = Math.min(this._highlightedIndex + 1, options.length - 1);
        this.render();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._highlightedIndex = Math.max(this._highlightedIndex - 1, 0);
        this.render();
        break;
      case 'Enter':
        if (this._highlightedIndex >= 0 && options[this._highlightedIndex]) {
          this._selectOption(options[this._highlightedIndex].value);
        }
        break;
    }
  }

  // Public methods
  getValue() {
    const multiple = this.getBoolAttr('multiple');
    return multiple ? this._selectedValues : (this._selectedValues[0] || '');
  }

  setValue(value) {
    if (Array.isArray(value)) {
      this._selectedValues = value;
    } else {
      this._selectedValues = value ? [value] : [];
    }
    this.render();
  }

  reset() {
    this._selectedValues = [];
    this._searchTerm = '';
    this._isOpen = false;
    this.render();
  }

  validate() {
    const required = this.getBoolAttr('required');
    if (required && this._selectedValues.length === 0) {
      this.setAttribute('error', 'This field is required');
      return false;
    }
    this.removeAttribute('error');
    return true;
  }
}

customElements.define('vx-dropdown', VxDropdown);

export { VxDropdown };
export default VxDropdown;
