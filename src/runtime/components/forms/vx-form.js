/**
 * VxForm - Form Web Component
 *
 * A form wrapper that handles validation, submission, and state management.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxForm extends VxComponent {
  static get observedAttributes() {
    return ['state-path', 'validate-on-submit', 'prevent-default'];
  }

  init() {
    this._formData = {};
    this._isValid = false;
    this._isSubmitting = false;
  }

  styles() {
    return `
      form {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-md);
      }

      .form-error {
        padding: var(--spacing-sm) var(--spacing-md);
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid var(--color-error);
        border-radius: var(--radius-md);
        color: var(--color-error);
        font-size: var(--font-size-sm);
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .form-error svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      .form-success {
        padding: var(--spacing-sm) var(--spacing-md);
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid var(--color-success);
        border-radius: var(--radius-md);
        color: var(--color-success);
        font-size: var(--font-size-sm);
        display: flex;
        align-items: center;
        gap: var(--spacing-sm);
      }

      .form-success svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      ::slotted(vx-button[type="submit"]) {
        margin-top: var(--spacing-sm);
      }
    `;
  }

  template() {
    const formError = this.getLocal('formError');
    const formSuccess = this.getLocal('formSuccess');

    return `
      <style>${this.getBaseStyles()}</style>
      <form novalidate>
        ${formError ? `
          <div class="form-error">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            ${this.escapeHtml(formError)}
          </div>
        ` : ''}

        ${formSuccess ? `
          <div class="form-success">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            ${this.escapeHtml(formSuccess)}
          </div>
        ` : ''}

        <slot></slot>
      </form>
    `;
  }

  afterRender() {
    const form = this.$('form');
    if (!form) return;

    form.addEventListener('submit', this._onSubmit.bind(this));

    // Listen to input events from child inputs
    form.addEventListener('vx-input', this._onInputChange.bind(this));
    form.addEventListener('vx-change', this._onInputChange.bind(this));
  }

  _onSubmit(event) {
    if (this.getBoolAttr('prevent-default') !== false) {
      event.preventDefault();
    }

    const validateOnSubmit = this.getBoolAttr('validate-on-submit') !== false;

    if (validateOnSubmit && !this.validate()) {
      this.dispatch('vx-form-invalid', {
        data: this._formData,
        errors: this._getErrors(),
      });
      return;
    }

    // Gather form data
    this._collectFormData();

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      Object.entries(this._formData).forEach(([key, value]) => {
        this.setState(`${statePath}.${key}`, value);
      });
    }

    // Check for trigger-flow attribute
    const triggerFlow = this.getAttr('trigger-flow');
    if (triggerFlow && window.VxFlowEngine) {
      window.VxFlowEngine.executeFlow(triggerFlow, { formData: this._formData });
    }

    this.dispatch('vx-form-submit', {
      data: { ...this._formData },
      valid: this._isValid,
    });
  }

  _onInputChange(event) {
    const { name, value, valid } = event.detail;
    if (name) {
      this._formData[name] = value;
    }
  }

  _collectFormData() {
    this._formData = {};

    // Collect from vx-input elements
    const vxInputs = this.querySelectorAll('vx-input');
    vxInputs.forEach(input => {
      const name = input.getAttribute('name');
      if (name) {
        this._formData[name] = input.getValue?.() || '';
      }
    });

    // Collect from vx-dropdown elements
    const vxDropdowns = this.querySelectorAll('vx-dropdown');
    vxDropdowns.forEach(dropdown => {
      const name = dropdown.getAttribute('name');
      if (name) {
        this._formData[name] = dropdown.getValue?.() || '';
      }
    });

    // Collect from native inputs as fallback
    const nativeInputs = this.querySelectorAll('input, select, textarea');
    nativeInputs.forEach(input => {
      const name = input.getAttribute('name');
      if (name && !this._formData[name]) {
        if (input.type === 'checkbox') {
          this._formData[name] = input.checked;
        } else if (input.type === 'radio') {
          if (input.checked) {
            this._formData[name] = input.value;
          }
        } else {
          this._formData[name] = input.value;
        }
      }
    });
  }

  validate() {
    this._isValid = true;
    const errors = [];

    // Validate vx-input elements
    const vxInputs = this.querySelectorAll('vx-input');
    vxInputs.forEach(input => {
      if (typeof input.validate === 'function') {
        if (!input.validate()) {
          this._isValid = false;
          errors.push({
            name: input.getAttribute('name'),
            element: input,
          });
        }
      }
    });

    // Validate vx-dropdown elements
    const vxDropdowns = this.querySelectorAll('vx-dropdown');
    vxDropdowns.forEach(dropdown => {
      if (typeof dropdown.validate === 'function') {
        if (!dropdown.validate()) {
          this._isValid = false;
          errors.push({
            name: dropdown.getAttribute('name'),
            element: dropdown,
          });
        }
      }
    });

    // Validate native inputs
    const nativeInputs = this.querySelectorAll('input, select, textarea');
    nativeInputs.forEach(input => {
      if (!input.checkValidity()) {
        this._isValid = false;
        errors.push({
          name: input.getAttribute('name'),
          element: input,
          message: input.validationMessage,
        });
      }
    });

    return this._isValid;
  }

  _getErrors() {
    const errors = {};

    const vxInputs = this.querySelectorAll('vx-input');
    vxInputs.forEach(input => {
      const error = input.getAttribute('error') || input._error;
      if (error) {
        errors[input.getAttribute('name')] = error;
      }
    });

    return errors;
  }

  // Public methods
  getData() {
    this._collectFormData();
    return { ...this._formData };
  }

  setData(data) {
    Object.entries(data).forEach(([name, value]) => {
      // Set on vx-input
      const vxInput = this.querySelector(`vx-input[name="${name}"]`);
      if (vxInput && typeof vxInput.setValue === 'function') {
        vxInput.setValue(value);
      }

      // Set on vx-dropdown
      const vxDropdown = this.querySelector(`vx-dropdown[name="${name}"]`);
      if (vxDropdown && typeof vxDropdown.setValue === 'function') {
        vxDropdown.setValue(value);
      }

      // Set on native input
      const nativeInput = this.querySelector(`input[name="${name}"], select[name="${name}"], textarea[name="${name}"]`);
      if (nativeInput) {
        if (nativeInput.type === 'checkbox') {
          nativeInput.checked = Boolean(value);
        } else {
          nativeInput.value = value;
        }
      }
    });

    this._formData = { ...data };
  }

  reset() {
    this._formData = {};
    this._isValid = false;
    this.setLocal('formError', '');
    this.setLocal('formSuccess', '');

    // Reset vx-inputs
    const vxInputs = this.querySelectorAll('vx-input');
    vxInputs.forEach(input => {
      if (typeof input.reset === 'function') {
        input.reset();
      }
    });

    // Reset vx-dropdowns
    const vxDropdowns = this.querySelectorAll('vx-dropdown');
    vxDropdowns.forEach(dropdown => {
      if (typeof dropdown.reset === 'function') {
        dropdown.reset();
      }
    });

    // Reset native form
    this.$('form')?.reset();
  }

  setError(message) {
    this.setLocal('formError', message);
    this.setLocal('formSuccess', '');
  }

  setSuccess(message) {
    this.setLocal('formSuccess', message);
    this.setLocal('formError', '');
  }

  clearMessages() {
    this.setLocal('formError', '');
    this.setLocal('formSuccess', '');
  }

  setSubmitting(isSubmitting) {
    this._isSubmitting = isSubmitting;

    // Update submit button loading state
    const submitButton = this.querySelector('vx-button[type="submit"]');
    if (submitButton) {
      if (isSubmitting) {
        submitButton.setAttribute('loading', '');
      } else {
        submitButton.removeAttribute('loading');
      }
    }
  }
}

customElements.define('vx-form', VxForm);

export { VxForm };
export default VxForm;
