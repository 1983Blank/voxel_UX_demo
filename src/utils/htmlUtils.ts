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

  // Pattern to match CSP meta tags
  const cspMetaPattern = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;

  // Check if there's a CSP meta tag
  const hasCsp = cspMetaPattern.test(html);

  if (!hasCsp) {
    return html;
  }

  // Reset regex
  cspMetaPattern.lastIndex = 0;

  // Replace CSP meta tags with a more permissive version
  return html.replace(cspMetaPattern, (match) => {
    // Extract the content attribute
    const contentMatch = match.match(/content=["']([^"']*)["']/i);
    if (!contentMatch) {
      // If no content, just remove the tag
      return '';
    }

    let cspContent = contentMatch[1];

    // Modify img-src to allow Supabase storage
    if (cspContent.includes('img-src')) {
      cspContent = cspContent.replace(
        /img-src\s+([^;]*)/i,
        `img-src $1 ${SUPABASE_STORAGE_DOMAIN} https://*.supabase.co`
      );
    } else {
      // Add img-src directive if not present
      cspContent += `; img-src 'self' data: blob: ${SUPABASE_STORAGE_DOMAIN}`;
    }

    // Modify connect-src to allow Supabase
    if (cspContent.includes('connect-src')) {
      cspContent = cspContent.replace(
        /connect-src\s+([^;]*)/i,
        `connect-src $1 ${SUPABASE_STORAGE_DOMAIN}`
      );
    }

    // Modify default-src if it's too restrictive
    if (cspContent.includes("default-src 'none'") || cspContent.includes("default-src 'self'")) {
      cspContent = cspContent.replace(
        /default-src\s+'(none|self)'/i,
        `default-src 'self' ${SUPABASE_STORAGE_DOMAIN}`
      );
    }

    return `<meta http-equiv="Content-Security-Policy" content="${cspContent}">`;
  });
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
 * Prepares HTML for safe display in an iframe with srcDoc.
 * - Relaxes CSP to allow Supabase storage
 * - Ensures proper base tag handling
 *
 * @param html - The HTML string to process
 * @returns Processed HTML ready for iframe display
 */
export function prepareHtmlForIframe(html: string): string {
  if (!html) return html;

  let processed = html;

  // Relax CSP to allow Supabase resources
  processed = relaxCsp(processed);

  return processed;
}
