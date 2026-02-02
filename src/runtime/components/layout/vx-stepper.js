/**
 * VxStepper - Multi-Step Flow Web Component
 *
 * A stepper component for multi-step forms and wizards.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxStepper extends VxComponent {
  static get observedAttributes() {
    return ['steps', 'current-step', 'state-path', 'variant', 'orientation', 'allow-click'];
  }

  getSubscribedPaths() {
    const statePath = this.getAttr('state-path');
    return statePath ? [statePath] : [];
  }

  init() {
    this._currentStep = parseInt(this.getAttr('current-step')) || 0;
  }

  styles() {
    return `
      .stepper-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
      }

      /* Stepper header */
      .stepper-header {
        display: flex;
        align-items: flex-start;
        margin-bottom: var(--spacing-lg);
      }

      .stepper-wrapper.vertical .stepper-header {
        flex-direction: column;
        margin-bottom: 0;
        margin-right: var(--spacing-lg);
      }

      /* Step item */
      .step-item {
        display: flex;
        align-items: center;
        flex: 1;
        position: relative;
      }

      .stepper-wrapper.vertical .step-item {
        flex-direction: row;
        padding-bottom: var(--spacing-md);
      }

      .step-item:last-child .step-connector {
        display: none;
      }

      /* Step connector */
      .step-connector {
        flex: 1;
        height: 2px;
        background: var(--color-border);
        margin: 0 var(--spacing-sm);
        transition: background var(--transition-fast);
      }

      .step-item.completed .step-connector {
        background: var(--color-primary);
      }

      .stepper-wrapper.vertical .step-connector {
        position: absolute;
        left: 15px;
        top: 32px;
        bottom: 0;
        width: 2px;
        height: auto;
        margin: 0;
      }

      /* Step indicator */
      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--color-surface);
        border: 2px solid var(--color-border);
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        flex-shrink: 0;
        transition: all var(--transition-fast);
        position: relative;
        z-index: 1;
      }

      .step-item.active .step-indicator {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-text-inverse);
      }

      .step-item.completed .step-indicator {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-text-inverse);
      }

      .step-item.error .step-indicator {
        background: var(--color-error);
        border-color: var(--color-error);
        color: var(--color-text-inverse);
      }

      .step-indicator svg {
        width: 16px;
        height: 16px;
      }

      /* Clickable steps */
      .step-item.clickable .step-indicator {
        cursor: pointer;
      }

      .step-item.clickable .step-indicator:hover {
        transform: scale(1.1);
        box-shadow: var(--shadow-md);
      }

      /* Step content */
      .step-content {
        display: flex;
        flex-direction: column;
        margin-left: var(--spacing-sm);
      }

      .stepper-wrapper:not(.vertical) .step-content {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: var(--spacing-xs);
        margin-left: 0;
        width: max-content;
        max-width: 120px;
        text-align: center;
        transform: translateX(calc(-50% + 16px));
      }

      .step-label {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-secondary);
        transition: color var(--transition-fast);
      }

      .step-item.active .step-label,
      .step-item.completed .step-label {
        color: var(--color-text);
      }

      .step-description {
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
        margin-top: 2px;
      }

      /* Step panels */
      .stepper-panels {
        flex: 1;
      }

      .step-panel {
        display: none;
      }

      .step-panel.active {
        display: block;
        animation: fadeIn var(--transition-fast);
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* Navigation */
      .stepper-navigation {
        display: flex;
        justify-content: space-between;
        margin-top: var(--spacing-lg);
        padding-top: var(--spacing-lg);
        border-top: 1px solid var(--color-border);
      }

      .stepper-navigation.hide {
        display: none;
      }

      .nav-button {
        display: inline-flex;
        align-items: center;
        gap: var(--spacing-sm);
        padding: var(--spacing-sm) var(--spacing-md);
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        cursor: pointer;
        font-family: var(--font-family);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text);
        transition: all var(--transition-fast);
      }

      .nav-button:hover:not(:disabled) {
        background: var(--color-surface);
      }

      .nav-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .nav-button.primary {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-text-inverse);
      }

      .nav-button.primary:hover:not(:disabled) {
        opacity: 0.9;
      }

      .nav-button svg {
        width: 16px;
        height: 16px;
      }

      /* Variants */
      .variant-simple .step-content {
        display: none;
      }

      .variant-simple .step-connector {
        margin: 0;
      }
    `;
  }

  template() {
    const steps = this._getSteps();
    const currentStep = this._getCurrentStep();
    const variant = this.getAttr('variant', 'default');
    const orientation = this.getAttr('orientation', 'horizontal');
    const allowClick = this.getBoolAttr('allow-click');
    const hideNav = this.getBoolAttr('hide-navigation');

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="stepper-wrapper variant-${variant} ${orientation}">
        <div class="stepper-header" role="navigation" aria-label="Progress">
          ${steps.map((step, idx) => this._renderStep(step, idx, currentStep, allowClick)).join('')}
        </div>

        <div class="stepper-panels">
          ${steps.map((step, idx) => `
            <div
              class="step-panel ${idx === currentStep ? 'active' : ''}"
              role="tabpanel"
              aria-labelledby="step-${idx}"
              ${idx !== currentStep ? 'hidden' : ''}
            >
              <slot name="step-${idx}"></slot>
            </div>
          `).join('')}
        </div>

        <div class="stepper-navigation ${hideNav ? 'hide' : ''}">
          <button
            class="nav-button"
            ${currentStep === 0 ? 'disabled' : ''}
            data-action="prev"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6"/>
            </svg>
            Back
          </button>

          ${currentStep === steps.length - 1 ? `
            <button class="nav-button primary" data-action="complete">
              Complete
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
            </button>
          ` : `
            <button class="nav-button primary" data-action="next">
              Next
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </button>
          `}
        </div>
      </div>
    `;
  }

  _renderStep(step, index, currentStep, allowClick) {
    const isActive = index === currentStep;
    const isCompleted = index < currentStep || step.completed;
    const isClickable = allowClick && (isCompleted || index <= currentStep);
    const hasError = step.error;

    const statusClass = hasError ? 'error' : isActive ? 'active' : isCompleted ? 'completed' : '';

    return `
      <div class="step-item ${statusClass} ${isClickable ? 'clickable' : ''}" data-step-index="${index}">
        <div
          class="step-indicator"
          role="button"
          tabindex="${isClickable ? '0' : '-1'}"
          aria-current="${isActive ? 'step' : 'false'}"
          ${isClickable ? `data-goto-step="${index}"` : ''}
        >
          ${isCompleted && !hasError ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          ` : hasError ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ` : `${index + 1}`}
        </div>

        <div class="step-content">
          <span class="step-label">${this.escapeHtml(step.label)}</span>
          ${step.description ? `<span class="step-description">${this.escapeHtml(step.description)}</span>` : ''}
        </div>

        <div class="step-connector"></div>
      </div>
    `;
  }

  afterRender() {
    // Navigation button handlers
    this.shadowRoot.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'prev') this.prev();
        else if (action === 'next') this.next();
        else if (action === 'complete') this._complete();
      });
    });

    // Step indicator click handlers
    this.shadowRoot.querySelectorAll('[data-goto-step]').forEach(indicator => {
      indicator.addEventListener('click', () => {
        const stepIndex = parseInt(indicator.dataset.gotoStep);
        this.goToStep(stepIndex);
      });

      indicator.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const stepIndex = parseInt(indicator.dataset.gotoStep);
          this.goToStep(stepIndex);
        }
      });
    });
  }

  _getSteps() {
    const stepsAttr = this.getAttr('steps');
    if (stepsAttr) {
      try {
        return JSON.parse(stepsAttr);
      } catch {
        return [];
      }
    }
    return [];
  }

  _getCurrentStep() {
    // Check state path first
    const statePath = this.getAttr('state-path');
    if (statePath) {
      const stateValue = this.getState(statePath);
      if (stateValue !== undefined) return stateValue;
    }

    return this._currentStep;
  }

  _complete() {
    this.dispatch('vx-stepper-complete', {
      step: this._getCurrentStep(),
      steps: this._getSteps(),
    });
  }

  // Public methods
  next() {
    const steps = this._getSteps();
    const currentStep = this._getCurrentStep();

    if (currentStep < steps.length - 1) {
      this.goToStep(currentStep + 1);
    }
  }

  prev() {
    const currentStep = this._getCurrentStep();

    if (currentStep > 0) {
      this.goToStep(currentStep - 1);
    }
  }

  goToStep(stepIndex) {
    const steps = this._getSteps();
    if (stepIndex < 0 || stepIndex >= steps.length) return;

    const oldStep = this._currentStep;
    this._currentStep = stepIndex;

    // Update state if state-path is set
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, stepIndex);
    }

    this.render();

    this.dispatch('vx-stepper-change', {
      step: stepIndex,
      previousStep: oldStep,
      stepData: steps[stepIndex],
    });
  }

  getCurrentStep() {
    return this._getCurrentStep();
  }

  setStepError(stepIndex, hasError = true) {
    const steps = this._getSteps();
    if (steps[stepIndex]) {
      steps[stepIndex].error = hasError;
      this.setAttribute('steps', JSON.stringify(steps));
    }
  }

  setStepCompleted(stepIndex, completed = true) {
    const steps = this._getSteps();
    if (steps[stepIndex]) {
      steps[stepIndex].completed = completed;
      this.setAttribute('steps', JSON.stringify(steps));
    }
  }
}

customElements.define('vx-stepper', VxStepper);

export { VxStepper };
export default VxStepper;
