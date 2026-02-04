/**
 * DOM Summarizer - Creates LLM-friendly representations of source DOM
 *
 * Parses HTML and generates a compact summary that helps the LLM
 * understand the page structure and identify elements to modify.
 */

import type { DOMSummary, KeyElement } from '@/types/toolSchema';

/**
 * Element types we identify as "key" elements
 */
const KEY_ELEMENT_SELECTORS: Record<KeyElement['type'], string[]> = {
  button: ['button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]', '.btn', '.button'],
  link: ['a[href]'],
  input: ['input:not([type="submit"]):not([type="button"]):not([type="hidden"])', 'textarea', 'select'],
  form: ['form'],
  card: ['.card', '[class*="card"]', 'article'],
  header: ['header', '[role="banner"]', '.header', '.navbar', 'nav'],
  footer: ['footer', '[role="contentinfo"]', '.footer'],
  nav: ['nav', '[role="navigation"]', '.nav', '.navigation', '.menu'],
  section: ['section', 'main', '[role="main"]', '.section'],
  image: ['img', 'picture', '[role="img"]', 'svg'],
  text: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'],
  list: ['ul', 'ol', 'dl', '[role="list"]'],
  table: ['table', '[role="table"]', '[role="grid"]'],
  other: [],
};

/**
 * Tags to skip entirely in summary
 */
const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'noscript', 'svg', 'path']);

/**
 * Maximum depth for tree structure
 */
const MAX_DEPTH = 6;

/**
 * Parse HTML using DOMParser (browser) or simple regex (server)
 */
function parseHTML(html: string): Document | null {
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }
  // For server-side, return null and use regex-based approach
  return null;
}

/**
 * Get best selector for an element
 */
function getBestSelector(element: Element): string {
  // Prefer ID
  if (element.id) {
    return `#${element.id}`;
  }

  // Check for unique class
  const classes = Array.from(element.classList);
  const meaningfulClasses = classes.filter(c =>
    !c.startsWith('css-') && // Skip CSS-in-JS
    !c.match(/^[a-z]{6,}$/) && // Skip hash-like classes
    c.length > 1
  );

  if (meaningfulClasses.length > 0) {
    const classSelector = `.${meaningfulClasses[0]}`;
    // Check if unique
    try {
      const matches = element.ownerDocument?.querySelectorAll(classSelector);
      if (matches?.length === 1) {
        return classSelector;
      }
    } catch {
      // Invalid selector, continue
    }
  }

  // Check for data attributes
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-') && attr.name !== 'data-reactroot') {
      return `[${attr.name}="${attr.value}"]`;
    }
  }

  // Fall back to tag with classes
  const tag = element.tagName.toLowerCase();
  if (meaningfulClasses.length > 0) {
    return `${tag}.${meaningfulClasses.join('.')}`;
  }

  // Fall back to tag with nth-child if needed
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      c => c.tagName === element.tagName
    );
    if (siblings.length > 1) {
      const index = siblings.indexOf(element) + 1;
      return `${tag}:nth-child(${index})`;
    }
  }

  return tag;
}

/**
 * Get truncated text content
 */
function getTextPreview(element: Element, maxLength: number = 50): string {
  const text = element.textContent?.trim() || '';
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Extract key elements from DOM
 */
function extractKeyElements(doc: Document): KeyElement[] {
  const elements: KeyElement[] = [];
  const seen = new Set<Element>();

  // Process in priority order
  const typePriority: KeyElement['type'][] = [
    'header', 'nav', 'button', 'form', 'input', 'link', 'card',
    'section', 'image', 'text', 'list', 'table', 'footer', 'other'
  ];

  for (const type of typePriority) {
    const selectors = KEY_ELEMENT_SELECTORS[type];
    if (!selectors || selectors.length === 0) continue;

    for (const selector of selectors) {
      try {
        const matches = doc.querySelectorAll(selector);
        for (const el of matches) {
          if (seen.has(el)) continue;
          seen.add(el);

          const keyEl: KeyElement = {
            selector: getBestSelector(el),
            type,
            text: getTextPreview(el),
          };

          // Count similar elements
          const sameType = Array.from(matches).filter(m => !seen.has(m) || m === el);
          if (sameType.length > 1 && type !== 'section') {
            keyEl.count = sameType.length;
            // Mark all as seen
            sameType.forEach(m => seen.add(m));
          }

          elements.push(keyEl);
        }
      } catch {
        // Invalid selector, skip
      }
    }
  }

  // Limit total elements
  return elements.slice(0, 30);
}

/**
 * Generate simplified structure tree
 */
function generateStructureTree(doc: Document, maxDepth: number = MAX_DEPTH): string {
  const lines: string[] = [];

  function processElement(el: Element, depth: number): void {
    if (depth > maxDepth) return;

    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    // Build element descriptor
    let descriptor = tag;

    // Add ID if present
    if (el.id) {
      descriptor += `#${el.id}`;
    }

    // Add meaningful classes
    const classes = Array.from(el.classList).filter(c =>
      !c.startsWith('css-') &&
      !c.match(/^[a-z]{6,}$/) &&
      c.length > 1
    ).slice(0, 2);
    if (classes.length > 0) {
      descriptor += `.${classes.join('.')}`;
    }

    // Check for repeated children
    const children = Array.from(el.children).filter(
      c => !SKIP_TAGS.has(c.tagName.toLowerCase())
    );

    // Group repeated patterns
    const childTags = children.map(c => c.tagName.toLowerCase());
    const tagCounts = new Map<string, number>();
    for (const t of childTags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }

    // Build line
    const indent = '  '.repeat(depth);
    let line = `${indent}<${descriptor}>`;

    // Add text preview for leaf nodes with text
    if (children.length === 0 && el.textContent?.trim()) {
      const text = getTextPreview(el, 30);
      if (text) {
        line += ` "${text}"`;
      }
    }

    // Add child count notation for repeated elements
    const repeatedTag = Array.from(tagCounts.entries()).find(([_, count]) => count >= 3);
    if (repeatedTag) {
      line += ` (${repeatedTag[1]}× ${repeatedTag[0]})`;
    }

    lines.push(line);

    // Recurse into children (skip if too many repeated)
    if (repeatedTag && repeatedTag[1] >= 5) {
      // Just show first child as example
      const firstChild = children.find(c =>
        c.tagName.toLowerCase() === repeatedTag[0]
      );
      if (firstChild) {
        lines.push(`${indent}  <!-- Example: -->`);
        processElement(firstChild, depth + 1);
        lines.push(`${indent}  <!-- ... -->`);
      }
    } else {
      for (const child of children) {
        processElement(child, depth + 1);
      }
    }
  }

  // Start from body
  const body = doc.body;
  if (body) {
    processElement(body, 0);
  }

  return lines.join('\n');
}

/**
 * Detect main sections in the page
 */
function detectSections(doc: Document): string[] {
  const sections: string[] = [];
  const candidates = doc.querySelectorAll('header, nav, main, section, aside, footer, [role="banner"], [role="main"], [role="contentinfo"]');

  for (const el of candidates) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const id = el.id;
    const classes = Array.from(el.classList).slice(0, 2);

    let name = role || tag;
    if (id) {
      name = id;
    } else if (classes.length > 0) {
      name = classes[0];
    }

    if (!sections.includes(name)) {
      sections.push(name);
    }
  }

  return sections;
}

/**
 * Estimate page complexity
 */
function estimateComplexity(doc: Document): 'simple' | 'moderate' | 'complex' {
  const allElements = doc.querySelectorAll('*').length;
  const interactiveElements = doc.querySelectorAll('button, a, input, select, textarea, [onclick], [role="button"]').length;
  const formElements = doc.querySelectorAll('form').length;

  if (allElements < 50 || interactiveElements < 5) {
    return 'simple';
  }
  if (allElements > 500 || interactiveElements > 30 || formElements > 2) {
    return 'complex';
  }
  return 'moderate';
}

/**
 * Summarize HTML for LLM context
 */
export function summarizeDOM(html: string): DOMSummary {
  const doc = parseHTML(html);

  if (!doc) {
    // Fallback for server-side: use regex-based extraction
    return summarizeDOMWithRegex(html);
  }

  const structure = generateStructureTree(doc);
  const keyElements = extractKeyElements(doc);
  const sections = detectSections(doc);
  const complexity = estimateComplexity(doc);

  return {
    structure,
    keyElements,
    sections,
    complexity,
    originalSize: html.length,
  };
}

/**
 * Regex-based fallback for server-side
 */
function summarizeDOMWithRegex(html: string): DOMSummary {
  const keyElements: KeyElement[] = [];

  // Extract IDs
  const idMatches = html.matchAll(/id=["']([^"']+)["']/g);
  for (const match of idMatches) {
    keyElements.push({
      selector: `#${match[1]}`,
      type: 'other',
    });
  }

  // Extract classes
  const classMatches = html.matchAll(/class=["']([^"']+)["']/g);
  const classSet = new Set<string>();
  for (const match of classMatches) {
    const classes = match[1].split(/\s+/).filter(c =>
      c.length > 2 && !c.startsWith('css-') && !c.match(/^[a-z]{6,}$/)
    );
    for (const c of classes.slice(0, 2)) {
      classSet.add(c);
    }
  }
  for (const c of Array.from(classSet).slice(0, 20)) {
    keyElements.push({
      selector: `.${c}`,
      type: 'other',
    });
  }

  // Detect sections
  const sections: string[] = [];
  if (html.includes('<header')) sections.push('header');
  if (html.includes('<nav')) sections.push('nav');
  if (html.includes('<main')) sections.push('main');
  if (html.includes('<footer')) sections.push('footer');

  // Estimate complexity
  const tagCount = (html.match(/<[a-z]/gi) || []).length;
  const complexity = tagCount < 100 ? 'simple' : tagCount > 1000 ? 'complex' : 'moderate';

  return {
    structure: `<!-- HTML document with ~${tagCount} elements -->`,
    keyElements,
    sections,
    complexity,
    originalSize: html.length,
  };
}

/**
 * Generate selector hints for LLM
 */
export function generateSelectorHints(summary: DOMSummary): string {
  const lines: string[] = ['## Selector Reference', ''];

  // Group by type
  const byType = new Map<string, KeyElement[]>();
  for (const el of summary.keyElements) {
    const list = byType.get(el.type) || [];
    list.push(el);
    byType.set(el.type, list);
  }

  for (const [type, elements] of byType) {
    if (elements.length === 0) continue;
    lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
    for (const el of elements) {
      let line = `- \`${el.selector}\``;
      if (el.text) line += `: "${el.text}"`;
      if (el.count && el.count > 1) line += ` (×${el.count})`;
      lines.push(line);
    }
    lines.push('');
  }

  return lines.join('\n');
}
