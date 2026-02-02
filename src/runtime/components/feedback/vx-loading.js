/**
 * VxLoading - Loading State Web Component
 *
 * Displays various loading indicators: spinner, skeleton, and progress bar.
 */

import { VxComponent } from '../../base/vx-component.js';

class VxLoading extends VxComponent {
  static get observedAttributes() {
    return ['type', 'size', 'text', 'progress', 'state-path', 'variant'];
  }

  getSubscribedPaths() {
    const statePath = this.getAttr('state-path');
    return statePath ? [statePath] : [];
  }

  styles() {
    return `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .loading-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--spacing-sm);
      }

      /* Spinner */
      .spinner {
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .spinner.size-sm {
        width: 16px;
        height: 16px;
        border-width: 2px;
      }

      .spinner.size-md {
        width: 24px;
        height: 24px;
      }

      .spinner.size-lg {
        width: 40px;
        height: 40px;
        border-width: 4px;
      }

      .spinner.size-xl {
        width: 56px;
        height: 56px;
        border-width: 5px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      /* Dots */
      .dots {
        display: flex;
        gap: var(--spacing-xs);
      }

      .dot {
        background: var(--color-primary);
        border-radius: 50%;
        animation: dotPulse 1.4s ease-in-out infinite;
      }

      .dot:nth-child(2) {
        animation-delay: 0.2s;
      }

      .dot:nth-child(3) {
        animation-delay: 0.4s;
      }

      .dot.size-sm {
        width: 6px;
        height: 6px;
      }

      .dot.size-md {
        width: 8px;
        height: 8px;
      }

      .dot.size-lg {
        width: 12px;
        height: 12px;
      }

      @keyframes dotPulse {
        0%, 80%, 100% {
          transform: scale(0.6);
          opacity: 0.5;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Skeleton */
      .skeleton {
        background: linear-gradient(
          90deg,
          var(--color-surface) 25%,
          var(--color-border) 50%,
          var(--color-surface) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: var(--radius-sm);
      }

      .skeleton.skeleton-text {
        height: 1em;
        width: 100%;
      }

      .skeleton.skeleton-title {
        height: 1.5em;
        width: 60%;
      }

      .skeleton.skeleton-avatar {
        border-radius: 50%;
      }

      .skeleton.skeleton-avatar.size-sm {
        width: 32px;
        height: 32px;
      }

      .skeleton.skeleton-avatar.size-md {
        width: 48px;
        height: 48px;
      }

      .skeleton.skeleton-avatar.size-lg {
        width: 64px;
        height: 64px;
      }

      .skeleton.skeleton-thumbnail {
        aspect-ratio: 16/9;
        width: 100%;
      }

      .skeleton.skeleton-card {
        width: 100%;
        height: 200px;
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* Progress bar */
      .progress-container {
        width: 100%;
      }

      .progress-bar {
        height: 8px;
        background: var(--color-surface);
        border-radius: var(--radius-full);
        overflow: hidden;
      }

      .progress-bar.size-sm {
        height: 4px;
      }

      .progress-bar.size-lg {
        height: 12px;
      }

      .progress-fill {
        height: 100%;
        background: var(--color-primary);
        border-radius: var(--radius-full);
        transition: width var(--transition-normal);
      }

      .progress-fill.indeterminate {
        width: 30%;
        animation: indeterminate 1.5s ease-in-out infinite;
      }

      @keyframes indeterminate {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(400%);
        }
      }

      .progress-label {
        display: flex;
        justify-content: space-between;
        margin-top: var(--spacing-xs);
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }

      /* Overlay */
      .loading-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.8);
        border-radius: inherit;
        z-index: 10;
      }

      /* Loading text */
      .loading-text {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        text-align: center;
      }

      /* Variants */
      .variant-primary .spinner {
        border-top-color: var(--color-primary);
      }

      .variant-secondary .spinner {
        border-top-color: var(--color-secondary);
      }

      .variant-white .spinner {
        border-color: rgba(255, 255, 255, 0.3);
        border-top-color: white;
      }

      .variant-primary .progress-fill,
      .variant-primary .dot {
        background: var(--color-primary);
      }

      .variant-secondary .progress-fill,
      .variant-secondary .dot {
        background: var(--color-secondary);
      }

      .variant-success .progress-fill,
      .variant-success .dot {
        background: var(--color-success);
      }
    `;
  }

  template() {
    const type = this.getAttr('type', 'spinner');
    const size = this.getAttr('size', 'md');
    const text = this.getAttr('text');
    const variant = this.getAttr('variant', 'primary');

    // Check visibility from state
    const statePath = this.getAttr('state-path');
    if (statePath && !this.getState(statePath)) {
      return '';
    }

    const progressAttr = this.getAttr('progress');
    const progress = progressAttr ? parseInt(progressAttr) : null;

    return `
      <style>${this.getBaseStyles()}</style>
      <div class="loading-wrapper variant-${variant}">
        ${this._renderLoader(type, size, progress)}
        ${text ? `<span class="loading-text">${this.escapeHtml(text)}</span>` : ''}
      </div>
    `;
  }

  _renderLoader(type, size, progress) {
    switch (type) {
      case 'spinner':
        return `<div class="spinner size-${size}"></div>`;

      case 'dots':
        return `
          <div class="dots">
            <span class="dot size-${size}"></span>
            <span class="dot size-${size}"></span>
            <span class="dot size-${size}"></span>
          </div>
        `;

      case 'progress':
        return `
          <div class="progress-container">
            <div class="progress-bar size-${size}">
              <div
                class="progress-fill ${progress === null ? 'indeterminate' : ''}"
                style="${progress !== null ? `width: ${Math.min(100, Math.max(0, progress))}%` : ''}"
              ></div>
            </div>
            ${progress !== null ? `
              <div class="progress-label">
                <span>${progress}%</span>
              </div>
            ` : ''}
          </div>
        `;

      case 'skeleton-text':
        return `<div class="skeleton skeleton-text"></div>`;

      case 'skeleton-title':
        return `<div class="skeleton skeleton-title"></div>`;

      case 'skeleton-avatar':
        return `<div class="skeleton skeleton-avatar size-${size}"></div>`;

      case 'skeleton-thumbnail':
        return `<div class="skeleton skeleton-thumbnail"></div>`;

      case 'skeleton-card':
        return `<div class="skeleton skeleton-card"></div>`;

      default:
        return `<div class="spinner size-${size}"></div>`;
    }
  }

  // Public methods
  show() {
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, true);
    } else {
      this.style.display = '';
      this.render();
    }
  }

  hide() {
    const statePath = this.getAttr('state-path');
    if (statePath) {
      this.setState(statePath, false);
    } else {
      this.style.display = 'none';
    }
  }

  setProgress(value) {
    this.setAttribute('progress', String(Math.min(100, Math.max(0, value))));
  }
}

customElements.define('vx-loading', VxLoading);

export { VxLoading };
export default VxLoading;
