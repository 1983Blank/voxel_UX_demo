/**
 * VxInput - Input Web Component
 *
 * A form input component with validation, labels, and error states.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxInput extends VxComponent {
  static get observedAttributes() {
    return [
      'type', 'name', 'label', 'placeholder', 'value',
      'required', 'disabled', 'readonly', 'pattern',
      'min', 'max', 'minlength', 'maxlength',
      'error', 'hint', 'state-path', 'size'
    ];
  }

  init() {
    this._internalValue = '';
    this._error = '';
    this._touched = false;
  }

  styles() {
    return `
      .input-wrapper {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-xs);
        width: 100%;
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

      .input-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      input {
        width: 100%;
        font-family: var(--font-family);
        background: var(--color-background);
        border: 1px solid var(--color-border);
        color: var(--color-text);
        transition: all var(--transition-fast);
      }

      input:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px var(--color-primary-light);
      }

      input:disabled {
        background: var(--color-surface);
        cursor: not-allowed;
        opacity: 0.7;
      }

      input::placeholder {
        color: var(--color-text-secondary);
      }

      /* Sizes */
      input.size-sm {
        height: 32px;
        padding: 0 var(--spacing-sm);
        font-size: var(--font-size-sm);
        border-radius: var(--radius-sm);
      }

      input.size-md {
        height: 40px;
        padding: 0 var(--spacing-md);
        font-size: var(--font-size-base);
        border-radius: var(--radius-md);
      }

      input.size-lg {
        height: 48px;
        padding: 0 var(--spacing-md);
        font-size: var(--font-size-lg);
        border-radius: var(--radius-md);
      }

      /* Error state */
      input.has-error {
        border-color: var(--color-error);
      }

      input.has-error:focus {
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
      }

      /* Messages */
      .hint {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }

      .error-message {
        font-size: var(--font-size-xs);
        color: var(--color-error);
        display: flex;
        align-items: center;
        gap: var(--spacing-xs);
      }

      .error-message svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      /* Icon slots */
      .prefix, .suffix {
        position: absolute;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
        pointer-events: none;
      }

      .prefix {
        left: var(--spacing-sm);
      }

      .suffix {
        right: var(--spacing-sm);
      }

      input.has-prefix {
        padding-left: calc(var(--spacing-sm) + 24px);
      }

      input.has-suffix {
        padding-right: calc(var(--spacing-sm) + 24px);
      }

      /* Character count */
      .char-count {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        text-align: right;
      }

      .char-count.over-limit {
        color: var(--color-error);
      }
    `;
  }

  template() {
    const type = this.getAttr('type', 'text');
    const name = this.getAttr('name');
    const label = this.getAttr('label');
    const placeholder = this.getAttr('placeholder', '');
    const value = this.getAttr('value', this._internalValue);
    const required = this.getBoolAttr('required');
    const disabled = this.getBoolAttr('disabled');
    const readonly = this.getBoolAttr('readonly');
    const pattern = this.getAttr('pattern');
    const min = this.getAttr('min');
    const max = this.getAttr('max');
    const minlength = this.getAttr('minlength');
    const maxlength = this.getAttr('maxlength');
    const error = this.getAttr('error') || this._error;
    const hint = this.getAttr('hint');
    const size = this.getAttr('size', 'md');

    // Check for prefix/suffix slots
    const hasPrefix = this.querySelector('[slot="prefix"]') !== null;
    const hasSuffix = this.querySelector('[slot="suffix"]') !== null;

    const inputClasses = [
      `size-${size}`,
      error ? 'has-error' : '',
      hasPrefix ? 'has-prefix' : '',
      hasSuffix ? 'has-suffix' : '',
    ].filter(Boolean).join(' ');

    const currentLength = value.length;
    const showCharCount = maxlength && type !== 'number';

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="input-wrapper">
        ${label ? `
          <label for="input-${name}">
            ${this.escapeHtml(label)}
            ${required ? '<span class="required">*</span>' : ''}
          </label>
        ` : ''}

        <div class="input-container">
          ${hasPrefix ? '<span class="prefix"><slot name="prefix"></slot></span>' : ''}

          <input
            id="input-${name}"
            type="${type}"
            name="${name}"
            class="${inputClasses}"
            placeholder="${this.escapeHtml(placeholder)}"
            value="${this.escapeHtml(value)}"
            ${required ? 'required' : ''}
            ${disabled ? 'disabled' : ''}
            ${readonly ? 'readonly' : ''}
            ${pattern ? `pattern="${pattern}"` : ''}
            ${min ? `min="${min}"` : ''}
            ${max ? `max="${max}"` : ''}
            ${minlength ? `minlength="${minlength}"` : ''}
            ${maxlength ? `maxlength="${maxlength}"` : ''}
          />

          ${hasSuffix ? '<span class="suffix"><slot name="suffix"></slot></span>' : ''}
        </div>

        ${showCharCount ? `
          <div class="char-count ${currentLength > parseInt(maxlength) ? 'over-limit' : ''}">
            ${currentLength}/${maxlength}
          </div>
        ` : ''}

        ${error ? `
          <div class="error-message">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            ${this.escapeHtml(error)}
          </div>
        ` : hint ? `<div class="hint">${this.escapeHtml(hint)}</div>` : ''}
      </div>
    `;
  }

  afterRender() {
    const input = this.$('input');
    if (!input) return;

    input.addEventListener('input', this._onInput.bind(this));
    input.addEventListener('blur', this._onBlur.bind(this));
    input.addEventListener('focus', this._onFocus.bind(this));
    input.addEventListener('change', this._onChange.bind(this));
  }

  _onInput(event) {
    const value = event.target.value;
    this._internalValue = value;

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, value);
    }

    // Clear error on input
    if (this._error) {
      this._error = '';
      this.render();
    }

    this.dispatch('vx-input', {
      name: this.getAttr('name'),
      value,
      valid: event.target.validity.valid,
    });
  }

  _onBlur(event) {
    this._touched = true;
    this._validate(event.target);

    this.dispatch('vx-blur', {
      name: this.getAttr('name'),
      value: event.target.value,
      valid: event.target.validity.valid,
    });
  }

  _onFocus(event) {
    this.dispatch('vx-focus', {
      name: this.getAttr('name'),
      value: event.target.value,
    });
  }

  _onChange(event) {
    this.dispatch('vx-change', {
      name: this.getAttr('name'),
      value: event.target.value,
      valid: event.target.validity.valid,
    });
  }

  _validate(input) {
    if (!this._touched) return true;

    const validity = input.validity;

    if (validity.valueMissing) {
      this._error = 'This field is required';
    } else if (validity.typeMismatch) {
      this._error = `Please enter a valid ${this.getAttr('type')}`;
    } else if (validity.patternMismatch) {
      this._error = 'Please match the requested format';
    } else if (validity.tooShort) {
      this._error = `Minimum ${this.getAttr('minlength')} characters required`;
    } else if (validity.tooLong) {
      this._error = `Maximum ${this.getAttr('maxlength')} characters allowed`;
    } else if (validity.rangeUnderflow) {
      this._error = `Minimum value is ${this.getAttr('min')}`;
    } else if (validity.rangeOverflow) {
      this._error = `Maximum value is ${this.getAttr('max')}`;
    } else {
      this._error = '';
    }

    if (this._error) {
      this.render();
      return false;
    }

    return true;
  }

  // Public methods
  getValue() {
    return this.$('input')?.value || this._internalValue;
  }

  setValue(value) {
    const input = this.$('input');
    if (input) {
      input.value = value;
      this._internalValue = value;
    }
  }

  focus() {
    this.$('input')?.focus();
  }

  blur() {
    this.$('input')?.blur();
  }

  validate() {
    this._touched = true;
    return this._validate(this.$('input'));
  }

  reset() {
    this._internalValue = '';
    this._error = '';
    this._touched = false;
    this.render();
  }
}

customElements.define('vx-input', VxInput);

export { VxInput };
export default VxInput;
