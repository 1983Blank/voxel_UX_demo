/**
 * Injection Compiler Service
 * Compiles injection configurations into executable JavaScript
 */

// ============================================================================
// Types
// ============================================================================

export type InjectionType =
  | 'click-feedback'      // Show feedback on click (toast, alert, ripple)
  | 'form-submit'         // Handle form submission with success/error states
  | 'form-validation'     // Validate form fields
  | 'navigation'          // Handle navigation links (scroll, show section)
  | 'modal-toggle'        // Open/close modals
  | 'tab-switch'          // Switch between tabs
  | 'dropdown-toggle'     // Toggle dropdown menus
  | 'table-sort'          // Sort table columns
  | 'data-populate'       // Populate elements with mock data
  | 'state-toggle';       // Toggle element states (active, disabled, etc.)

export interface InjectionConfig {
  id: string;
  type: InjectionType;
  selector: string;
  options: InjectionOptions;
}

export interface InjectionOptions {
  // Click feedback
  feedbackType?: 'toast' | 'alert' | 'ripple' | 'highlight';
  feedbackMessage?: string;
  feedbackDuration?: number;

  // Form
  successMessage?: string;
  errorMessage?: string;
  validationRules?: ValidationRule[];
  resetAfterSubmit?: boolean;

  // Navigation
  targetSelector?: string;
  scrollBehavior?: 'smooth' | 'instant';
  showSection?: boolean;

  // Modal
  modalSelector?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;

  // Tabs
  tabPanelSelector?: string;
  activeClass?: string;

  // Dropdown
  menuSelector?: string;
  closeOnSelect?: boolean;

  // Table
  sortableColumns?: number[] | 'all';
  defaultSort?: { column: number; direction: 'asc' | 'desc' };

  // Data
  dataType?: string;
  dataSchema?: Record<string, string>;
  dataCount?: number;

  // State
  toggleClass?: string;
  toggleAttribute?: string;
  toggleStates?: string[];
}

export interface ValidationRule {
  field: string;
  type: 'required' | 'email' | 'phone' | 'minLength' | 'maxLength' | 'pattern';
  value?: string | number;
  message?: string;
}

export interface CompiledInjection {
  id: string;
  code: string;
  dependencies: string[];
}

export interface InjectionBundle {
  runtime: string;      // Core runtime code
  injections: string;   // All compiled injections
  styles: string;       // Required CSS
  fullScript: string;   // Complete bundle ready to inject
}

// ============================================================================
// Code Templates
// ============================================================================

const RUNTIME_CORE = `
// Voxel Prototype Runtime
(function(window) {
  'use strict';

  const VoxelRuntime = {
    initialized: false,
    injections: [],
    state: {},

    init() {
      if (this.initialized) return;
      this.initialized = true;
      this.injectStyles();
      this.setupGlobalHandlers();
      console.log('[VoxelRuntime] Initialized');
    },

    injectStyles() {
      if (document.getElementById('voxel-runtime-styles')) return;
      const style = document.createElement('style');
      style.id = 'voxel-runtime-styles';
      style.textContent = this.getStyles();
      document.head.appendChild(style);
    },

    getStyles() {
      return \`
        .voxel-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 24px;
          background: #333;
          color: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          animation: voxel-slide-in 0.3s ease;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .voxel-toast.success { background: #10b981; }
        .voxel-toast.error { background: #ef4444; }
        .voxel-toast.info { background: #3b82f6; }

        @keyframes voxel-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        .voxel-ripple {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.4);
          transform: scale(0);
          animation: voxel-ripple 0.6s linear;
          pointer-events: none;
        }

        @keyframes voxel-ripple {
          to { transform: scale(4); opacity: 0; }
        }

        .voxel-highlight {
          animation: voxel-highlight 0.5s ease;
        }

        @keyframes voxel-highlight {
          0%, 100% { box-shadow: none; }
          50% { box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5); }
        }

        .voxel-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 9999;
          animation: voxel-fade-in 0.2s ease;
        }

        @keyframes voxel-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .voxel-field-error {
          border-color: #ef4444 !important;
        }

        .voxel-error-message {
          color: #ef4444;
          font-size: 12px;
          margin-top: 4px;
        }

        .voxel-sort-header {
          cursor: pointer;
          user-select: none;
        }
        .voxel-sort-header:hover {
          background: rgba(0,0,0,0.05);
        }
        .voxel-sort-header::after {
          content: '';
          margin-left: 4px;
        }
        .voxel-sort-header.asc::after { content: ' ▲'; }
        .voxel-sort-header.desc::after { content: ' ▼'; }
      \`;
    },

    setupGlobalHandlers() {
      // Close modals on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeAllModals();
        }
      });

      // Close dropdowns on outside click
      document.addEventListener('click', (e) => {
        const openDropdowns = document.querySelectorAll('.voxel-dropdown-open');
        openDropdowns.forEach(dropdown => {
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('voxel-dropdown-open');
          }
        });
      });
    },

    // Utility methods
    showToast(message, type = 'info', duration = 3000) {
      const toast = document.createElement('div');
      toast.className = \`voxel-toast \${type}\`;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), duration);
    },

    addRipple(element, event) {
      const rect = element.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'voxel-ripple';
      ripple.style.left = (event.clientX - rect.left) + 'px';
      ripple.style.top = (event.clientY - rect.top) + 'px';
      element.style.position = 'relative';
      element.style.overflow = 'hidden';
      element.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    },

    closeAllModals() {
      document.querySelectorAll('.voxel-modal-backdrop').forEach(b => b.remove());
      document.querySelectorAll('[data-voxel-modal-open]').forEach(m => {
        m.removeAttribute('data-voxel-modal-open');
        m.style.display = 'none';
      });
    },

    validateField(input, rules) {
      const value = input.value.trim();
      for (const rule of rules) {
        let valid = true;
        let message = rule.message;

        switch (rule.type) {
          case 'required':
            valid = value.length > 0;
            message = message || 'This field is required';
            break;
          case 'email':
            valid = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
            message = message || 'Please enter a valid email';
            break;
          case 'phone':
            valid = /^[\\d\\s\\-\\+\\(\\)]{10,}$/.test(value);
            message = message || 'Please enter a valid phone number';
            break;
          case 'minLength':
            valid = value.length >= rule.value;
            message = message || \`Minimum \${rule.value} characters required\`;
            break;
          case 'maxLength':
            valid = value.length <= rule.value;
            message = message || \`Maximum \${rule.value} characters allowed\`;
            break;
          case 'pattern':
            valid = new RegExp(rule.value).test(value);
            message = message || 'Invalid format';
            break;
        }

        if (!valid) {
          return { valid: false, message };
        }
      }
      return { valid: true };
    },

    register(injection) {
      this.injections.push(injection);
    },

    // Safe selector helper - catches invalid CSS selectors
    safeSelect(selector, parent = document) {
      try {
        return Array.from(parent.querySelectorAll(selector));
      } catch (e) {
        console.warn('[VoxelRuntime] Invalid selector:', selector, e.message);
        return [];
      }
    },

    safeSelectOne(selector, parent = document) {
      try {
        return parent.querySelector(selector);
      } catch (e) {
        console.warn('[VoxelRuntime] Invalid selector:', selector, e.message);
        return null;
      }
    }
  };

  window.VoxelRuntime = VoxelRuntime;

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VoxelRuntime.init());
  } else {
    VoxelRuntime.init();
  }
})(window);
`;

// ============================================================================
// Injection Compilers
// ============================================================================

function compileClickFeedback(config: InjectionConfig): string {
  const { selector, options } = config;
  const feedbackType = options.feedbackType || 'toast';
  const message = options.feedbackMessage || 'Action completed!';
  const duration = options.feedbackDuration || 3000;

  return `
// Click Feedback: ${config.id}
(function() {
  const elements = VoxelRuntime.safeSelect('${selector}');
  elements.forEach(el => {
    el.addEventListener('click', function(e) {
      ${feedbackType === 'ripple' ? 'VoxelRuntime.addRipple(this, e);' : ''}
      ${feedbackType === 'toast' ? `VoxelRuntime.showToast('${message}', 'success', ${duration});` : ''}
      ${feedbackType === 'alert' ? `alert('${message}');` : ''}
      ${feedbackType === 'highlight' ? "this.classList.add('voxel-highlight'); setTimeout(() => this.classList.remove('voxel-highlight'), 500);" : ''}
    });
  });
})();
`;
}

function compileFormSubmit(config: InjectionConfig): string {
  const { selector, options } = config;
  const successMsg = options.successMessage || 'Form submitted successfully!';
  const errorMsg = options.errorMessage || 'Please fix the errors and try again.';
  const resetAfter = options.resetAfterSubmit !== false;

  return `
// Form Submit: ${config.id}
(function() {
  const form = VoxelRuntime.safeSelectOne('${selector}');
  if (!form) return;

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    // Check for validation errors
    const errors = this.querySelectorAll('.voxel-field-error');
    if (errors.length > 0) {
      VoxelRuntime.showToast('${errorMsg}', 'error');
      return;
    }

    // Simulate submission
    const submitBtn = this.querySelector('[type="submit"], button');
    if (submitBtn) {
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        VoxelRuntime.showToast('${successMsg}', 'success');
        ${resetAfter ? 'this.reset();' : ''}
      }, 1000);
    } else {
      VoxelRuntime.showToast('${successMsg}', 'success');
      ${resetAfter ? 'this.reset();' : ''}
    }
  });
})();
`;
}

function compileFormValidation(config: InjectionConfig): string {
  const { selector, options } = config;
  const rules = options.validationRules || [];

  const rulesJson = JSON.stringify(rules);

  return `
// Form Validation: ${config.id}
(function() {
  const form = VoxelRuntime.safeSelectOne('${selector}');
  if (!form) return;

  const rules = ${rulesJson};
  const rulesByField = {};
  rules.forEach(r => {
    if (!rulesByField[r.field]) rulesByField[r.field] = [];
    rulesByField[r.field].push(r);
  });

  Object.keys(rulesByField).forEach(fieldSelector => {
    const input = form.querySelector(fieldSelector);
    if (!input) return;

    input.addEventListener('blur', function() {
      const result = VoxelRuntime.validateField(this, rulesByField[fieldSelector]);
      const existingError = this.parentElement.querySelector('.voxel-error-message');
      if (existingError) existingError.remove();

      if (!result.valid) {
        this.classList.add('voxel-field-error');
        const errorEl = document.createElement('div');
        errorEl.className = 'voxel-error-message';
        errorEl.textContent = result.message;
        this.parentElement.appendChild(errorEl);
      } else {
        this.classList.remove('voxel-field-error');
      }
    });
  });
})();
`;
}

function compileNavigation(config: InjectionConfig): string {
  const { selector, options } = config;
  const targetSelector = options.targetSelector || '';
  const scrollBehavior = options.scrollBehavior || 'smooth';
  const showSection = options.showSection || false;

  return `
// Navigation: ${config.id}
(function() {
  const links = VoxelRuntime.safeSelect('${selector}');
  links.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();

      ${targetSelector ? `
      const target = VoxelRuntime.safeSelectOne('${targetSelector}');
      if (target) {
        ${showSection ? `
        // Show section if hidden
        target.style.display = 'block';
        target.removeAttribute('hidden');
        ` : ''}
        target.scrollIntoView({ behavior: '${scrollBehavior}', block: 'start' });
      }
      ` : `
      // Try to find target from href
      const href = this.getAttribute('href');
      if (href && href.startsWith('#')) {
        const target = VoxelRuntime.safeSelectOne(href);
        if (target) {
          target.scrollIntoView({ behavior: '${scrollBehavior}', block: 'start' });
        }
      }
      `}

      VoxelRuntime.showToast('Navigating...', 'info', 1500);
    });
  });
})();
`;
}

function compileModalToggle(config: InjectionConfig): string {
  const { selector, options } = config;
  const modalSelector = options.modalSelector || selector;
  const closeOnBackdrop = options.closeOnBackdrop !== false;

  return `
// Modal Toggle: ${config.id}
(function() {
  const triggers = VoxelRuntime.safeSelect('${selector}');
  const modal = VoxelRuntime.safeSelectOne('${modalSelector}');

  if (!modal) return;

  function openModal() {
    // Create backdrop
    ${closeOnBackdrop ? `
    const backdrop = document.createElement('div');
    backdrop.className = 'voxel-modal-backdrop';
    backdrop.addEventListener('click', closeModal);
    document.body.appendChild(backdrop);
    ` : ''}

    modal.style.display = 'block';
    modal.setAttribute('data-voxel-modal-open', 'true');
  }

  function closeModal() {
    modal.style.display = 'none';
    modal.removeAttribute('data-voxel-modal-open');
    VoxelRuntime.safeSelect('.voxel-modal-backdrop').forEach(b => b.remove());
  }

  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      if (modal.getAttribute('data-voxel-modal-open')) {
        closeModal();
      } else {
        openModal();
      }
    });
  });

  // Close button inside modal
  const closeButtons = modal.querySelectorAll('[data-dismiss="modal"], .close, [class*="close"]');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
})();
`;
}

function compileTabSwitch(config: InjectionConfig): string {
  const { selector, options } = config;
  const panelSelector = options.tabPanelSelector || '[role="tabpanel"]';
  const activeClass = options.activeClass || 'active';

  return `
// Tab Switch: ${config.id}
(function() {
  const tabList = VoxelRuntime.safeSelectOne('${selector}');
  if (!tabList) return;

  const tabs = tabList.querySelectorAll('[role="tab"], .tab, [class*="tab-item"], li');
  const panels = VoxelRuntime.safeSelect('${panelSelector}');

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', function(e) {
      e.preventDefault();

      // Remove active from all tabs
      tabs.forEach(t => t.classList.remove('${activeClass}'));
      // Add active to clicked tab
      this.classList.add('${activeClass}');

      // Hide all panels
      panels.forEach(p => {
        p.style.display = 'none';
        p.setAttribute('hidden', '');
      });

      // Show corresponding panel
      const panelId = this.getAttribute('aria-controls') || this.getAttribute('data-target');
      const panel = panelId ? document.getElementById(panelId) : panels[index];
      if (panel) {
        panel.style.display = 'block';
        panel.removeAttribute('hidden');
      }
    });
  });
})();
`;
}

function compileDropdownToggle(config: InjectionConfig): string {
  const { selector, options } = config;
  const menuSelector = options.menuSelector || '.dropdown-menu, [role="menu"]';
  const closeOnSelect = options.closeOnSelect !== false;

  return `
// Dropdown Toggle: ${config.id}
(function() {
  const triggers = VoxelRuntime.safeSelect('${selector}');

  triggers.forEach(trigger => {
    const dropdown = trigger.closest('.dropdown') || trigger.parentElement;
    const menu = dropdown.querySelector('${menuSelector}');

    if (!menu) return;

    trigger.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const isOpen = dropdown.classList.contains('voxel-dropdown-open');

      // Close all other dropdowns
      VoxelRuntime.safeSelect('.voxel-dropdown-open').forEach(d => {
        d.classList.remove('voxel-dropdown-open');
      });

      if (!isOpen) {
        dropdown.classList.add('voxel-dropdown-open');
        menu.style.display = 'block';
      } else {
        menu.style.display = 'none';
      }
    });

    ${closeOnSelect ? `
    // Close on item select
    menu.querySelectorAll('a, button, [role="menuitem"]').forEach(item => {
      item.addEventListener('click', () => {
        dropdown.classList.remove('voxel-dropdown-open');
        menu.style.display = 'none';
      });
    });
    ` : ''}
  });
})();
`;
}

function compileTableSort(config: InjectionConfig): string {
  const { selector, options } = config;
  const sortableColumns = options.sortableColumns || 'all';

  return `
// Table Sort: ${config.id}
(function() {
  const table = VoxelRuntime.safeSelectOne('${selector}');
  if (!table) return;

  const headers = table.querySelectorAll('th');
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  headers.forEach((header, colIndex) => {
    const isSortable = ${JSON.stringify(sortableColumns)} === 'all' ||
                       ${JSON.stringify(sortableColumns)}.includes(colIndex);

    if (!isSortable) return;

    header.classList.add('voxel-sort-header');
    header.addEventListener('click', function() {
      const isAsc = this.classList.contains('asc');

      // Reset all headers
      headers.forEach(h => h.classList.remove('asc', 'desc'));

      // Set new direction
      this.classList.add(isAsc ? 'desc' : 'asc');

      // Sort rows
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aVal = a.cells[colIndex]?.textContent?.trim() || '';
        const bVal = b.cells[colIndex]?.textContent?.trim() || '';

        // Try numeric sort
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return isAsc ? bNum - aNum : aNum - bNum;
        }

        // String sort
        return isAsc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      });

      rows.forEach(row => tbody.appendChild(row));
    });
  });
})();
`;
}

function compileDataPopulate(config: InjectionConfig): string {
  const { selector, options } = config;
  const dataType = options.dataType || 'text';
  const schema = options.dataSchema || {};
  const count = options.dataCount || 5;

  return `
// Data Populate: ${config.id}
(function() {
  const elements = VoxelRuntime.safeSelect('${selector}');
  const schema = ${JSON.stringify(schema)};
  const count = ${count};

  // Mock data generators
  const generators = {
    name: () => ['John Smith', 'Jane Doe', 'Bob Johnson', 'Alice Williams', 'Charlie Brown'][Math.floor(Math.random() * 5)],
    email: () => \`user\${Math.floor(Math.random() * 1000)}@example.com\`,
    phone: () => \`+1 (\${Math.floor(Math.random() * 900) + 100}) \${Math.floor(Math.random() * 900) + 100}-\${Math.floor(Math.random() * 9000) + 1000}\`,
    date: () => new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toLocaleDateString(),
    number: () => Math.floor(Math.random() * 10000),
    price: () => '$' + (Math.random() * 1000).toFixed(2),
    status: () => ['Active', 'Pending', 'Completed', 'Cancelled'][Math.floor(Math.random() * 4)],
    company: () => ['Acme Inc', 'TechCorp', 'DataFlow', 'CloudBase', 'NetSoft'][Math.floor(Math.random() * 5)],
    text: () => 'Lorem ipsum dolor sit amet consectetur adipiscing elit.'
  };

  elements.forEach(el => {
    const dataTypeAttr = el.getAttribute('data-voxel-type') || '${dataType}';
    if (generators[dataTypeAttr]) {
      el.textContent = generators[dataTypeAttr]();
    }
  });
})();
`;
}

function compileStateToggle(config: InjectionConfig): string {
  const { selector, options } = config;
  const toggleClass = options.toggleClass || 'active';
  const toggleAttribute = options.toggleAttribute || '';
  const toggleStates = options.toggleStates || [];

  return `
// State Toggle: ${config.id}
(function() {
  const elements = VoxelRuntime.safeSelect('${selector}');

  elements.forEach(el => {
    el.addEventListener('click', function() {
      ${toggleClass ? `this.classList.toggle('${toggleClass}');` : ''}
      ${toggleAttribute ? `
      const current = this.getAttribute('${toggleAttribute}');
      this.setAttribute('${toggleAttribute}', current === 'true' ? 'false' : 'true');
      ` : ''}
      ${toggleStates.length > 0 ? `
      const states = ${JSON.stringify(toggleStates)};
      const currentState = this.getAttribute('data-state') || states[0];
      const nextIndex = (states.indexOf(currentState) + 1) % states.length;
      this.setAttribute('data-state', states[nextIndex]);
      this.textContent = states[nextIndex];
      ` : ''}
    });
  });
})();
`;
}

// ============================================================================
// Main Compiler
// ============================================================================

const compilers: Record<InjectionType, (config: InjectionConfig) => string> = {
  'click-feedback': compileClickFeedback,
  'form-submit': compileFormSubmit,
  'form-validation': compileFormValidation,
  'navigation': compileNavigation,
  'modal-toggle': compileModalToggle,
  'tab-switch': compileTabSwitch,
  'dropdown-toggle': compileDropdownToggle,
  'table-sort': compileTableSort,
  'data-populate': compileDataPopulate,
  'state-toggle': compileStateToggle
};

/**
 * Compile a single injection config
 */
export function compileInjection(config: InjectionConfig): CompiledInjection {
  const compiler = compilers[config.type];
  if (!compiler) {
    console.warn(`[InjectionCompiler] Unknown injection type: ${config.type}`);
    return {
      id: config.id,
      code: `// Unknown injection type: ${config.type}`,
      dependencies: []
    };
  }

  return {
    id: config.id,
    code: compiler(config),
    dependencies: []
  };
}

/**
 * Compile multiple injections into a bundle
 */
export function compileInjections(configs: InjectionConfig[]): InjectionBundle {
  const compiledInjections = configs.map(compileInjection);

  const injectionsCode = compiledInjections
    .map(ci => ci.code)
    .join('\n\n');

  const fullScript = `
${RUNTIME_CORE}

// ============================================================================
// Compiled Injections
// ============================================================================

${injectionsCode}

console.log('[VoxelRuntime] ${configs.length} injections loaded');
`;

  return {
    runtime: RUNTIME_CORE,
    injections: injectionsCode,
    styles: '', // Styles are included in runtime
    fullScript
  };
}

/**
 * Get the runtime core code only (for separate injection)
 */
export function getRuntimeCore(): string {
  return RUNTIME_CORE;
}

/**
 * Available injection types for UI
 */
export const INJECTION_TYPES: { type: InjectionType; label: string; description: string }[] = [
  { type: 'click-feedback', label: 'Click Feedback', description: 'Show visual feedback on click' },
  { type: 'form-submit', label: 'Form Submit', description: 'Handle form submission with feedback' },
  { type: 'form-validation', label: 'Form Validation', description: 'Validate form fields' },
  { type: 'navigation', label: 'Navigation', description: 'Handle navigation and scrolling' },
  { type: 'modal-toggle', label: 'Modal Toggle', description: 'Open/close modals' },
  { type: 'tab-switch', label: 'Tab Switch', description: 'Switch between tabs' },
  { type: 'dropdown-toggle', label: 'Dropdown Toggle', description: 'Toggle dropdown menus' },
  { type: 'table-sort', label: 'Table Sort', description: 'Sort table columns' },
  { type: 'data-populate', label: 'Data Populate', description: 'Fill with mock data' },
  { type: 'state-toggle', label: 'State Toggle', description: 'Toggle element states' }
];
