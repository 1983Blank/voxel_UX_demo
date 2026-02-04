/**
 * HTML Utility Functions
 *
 * Provides utilities for processing HTML before display in iframes.
 */

// Supabase storage domain to allow in CSP
const SUPABASE_STORAGE_DOMAIN = 'https://*.supabase.co';

/**
 * Relaxes Content Security Policy in HTML to allow Supabase storage resources.
 * This modifies or removes CSP meta tags that would block external images/resources.
 *
 * @param html - The HTML string to process
 * @returns HTML with relaxed CSP
 */
export function relaxCsp(html: string): string {
  if (!html) return html;

  // Permissive CSP that allows inline styles, scripts, and external resources
  const permissiveCsp = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data: blob: ${SUPABASE_STORAGE_DOMAIN}; style-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; font-src * data:;">`;

  // Pattern to match CSP meta tags
  const cspMetaPattern = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;

  // Check if there's a CSP meta tag
  const hasCsp = cspMetaPattern.test(html);

  if (hasCsp) {
    // Reset regex
    cspMetaPattern.lastIndex = 0;
    // Replace existing CSP with permissive one
    return html.replace(cspMetaPattern, permissiveCsp);
  }

  // No existing CSP - add permissive CSP to head
  // This is crucial for srcdoc iframes which have default CSP restrictions
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n${permissiveCsp}`);
  } else if (html.includes('<head ')) {
    return html.replace(/<head\s[^>]*>/, (match) => `${match}\n${permissiveCsp}`);
  } else if (html.includes('<html>') || html.includes('<html ')) {
    // No head tag, add after html
    return html.replace(/<html[^>]*>/, (match) => `${match}\n<head>${permissiveCsp}</head>`);
  } else {
    // No html or head tags, prepend CSP
    return `${permissiveCsp}\n${html}`;
  }
}

/**
 * Completely removes CSP meta tags from HTML.
 * Use this when you want full permissiveness in iframe content.
 *
 * @param html - The HTML string to process
 * @returns HTML without CSP meta tags
 */
export function removeCsp(html: string): string {
  if (!html) return html;

  // Remove CSP meta tags entirely
  return html.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
}

/**
 * Escape </script> patterns inside script tag content.
 * The browser's HTML parser sees ANY </script> and closes the script tag,
 * even if it's inside a JavaScript string literal.
 *
 * CRITICAL: This function must use DOMParser to properly identify script boundaries.
 * Regex-based approaches fail when scripts contain </script> in string literals.
 */
export function escapeScriptClosingTags(html: string): string {
  if (!html) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let escapedCount = 0;
    const scripts = doc.querySelectorAll('script');

    scripts.forEach((script, index) => {
      const content = script.textContent || '';

      // Log script info for debugging
      if (index === 0) {
        console.log('[htmlUtils] First script preview (first 100 chars):', content.slice(0, 100));
      }

      // Check for </script patterns (case insensitive)
      const matches = content.match(/<\/script/gi);
      if (matches && matches.length > 0) {
        // Escape by adding backslash: </script becomes <\/script
        // This is valid JavaScript and prevents HTML parser confusion
        const escapedContent = content.replace(/<\/script/gi, '<\\/script');
        script.textContent = escapedContent;
        escapedCount += matches.length;
        console.log(`[htmlUtils] Escaped ${matches.length} </script pattern(s) in script #${index + 1}`);
      }
    });

    if (escapedCount > 0) {
      console.log(`[htmlUtils] Total: escaped ${escapedCount} </script pattern(s) in script content`);
    }

    // Serialize back to HTML
    const result = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

    // Verify VxRuntime bundle wasn't corrupted
    if (html.includes('VxRuntime Bundle') && !result.includes('VxRuntime Bundle')) {
      console.error('[htmlUtils] CRITICAL: VxRuntime Bundle was corrupted during escaping!');
      console.error('[htmlUtils] Returning original HTML to preserve bundle');
      return html;
    }

    // Verify script count wasn't reduced
    const originalScriptCount = (html.match(/<script/gi) || []).length;
    const resultScriptCount = (result.match(/<script/gi) || []).length;
    if (resultScriptCount < originalScriptCount) {
      console.error(`[htmlUtils] WARNING: Script count reduced from ${originalScriptCount} to ${resultScriptCount}`);
    }

    return result;
  } catch (error) {
    console.warn('[htmlUtils] Failed to escape script tags, returning original:', error);
    return html;
  }
}

/**
 * Validate and diagnose HTML script tag issues.
 * Returns diagnostic info without modifying the HTML.
 */
export function diagnoseHtmlScripts(html: string): {
  scriptCount: number;
  openTags: number;
  closeTags: number;
  balanced: boolean;
  hasVxRuntime: boolean;
  firstScriptPreview: string;
} {
  const openTags = (html.match(/<script[^>]*>/gi) || []).length;
  const closeTags = (html.match(/<\/script>/gi) || []).length;

  // Find first script content for preview
  let firstScriptPreview = '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const firstScript = doc.querySelector('script');
    if (firstScript) {
      const content = firstScript.textContent || '';
      firstScriptPreview = content.slice(0, 200) + (content.length > 200 ? '...' : '');
    }
  } catch {
    firstScriptPreview = 'Failed to parse';
  }

  return {
    scriptCount: openTags,
    openTags,
    closeTags,
    balanced: openTags === closeTags,
    hasVxRuntime: html.includes('VxRuntime Bundle') || html.includes('__VX_RUNTIME'),
    firstScriptPreview,
  };
}

/**
 * Prepares HTML for safe display in an iframe with srcDoc.
 * - Escapes </script> patterns inside script content
 * - Relaxes CSP to allow Supabase storage
 * - Ensures proper base tag handling
 *
 * @param html - The HTML string to process
 * @returns Processed HTML ready for iframe display
 */
export function prepareHtmlForIframe(html: string): string {
  if (!html) return html;

  // Diagnostic logging
  const beforeDiag = diagnoseHtmlScripts(html);
  console.log('[htmlUtils:prepareHtmlForIframe] Input diagnostics:', beforeDiag);

  let processed = html;

  // CRITICAL: Escape any </script> patterns inside script content
  // This prevents the browser from prematurely closing script tags
  processed = escapeScriptClosingTags(processed);

  // Relax CSP to allow Supabase resources
  processed = relaxCsp(processed);

  // Diagnostic logging after processing
  const afterDiag = diagnoseHtmlScripts(processed);
  console.log('[htmlUtils:prepareHtmlForIframe] Output diagnostics:', afterDiag);

  // Warn if there are issues
  if (!afterDiag.balanced) {
    console.error('[htmlUtils:prepareHtmlForIframe] WARNING: Script tags not balanced!', afterDiag);
  }
  if (!afterDiag.hasVxRuntime && html.includes('VxRuntime')) {
    console.error('[htmlUtils:prepareHtmlForIframe] WARNING: VxRuntime may have been corrupted!');
  }

  return processed;
}
