/**
 * VirtualFS - Virtual File System for Voxel prototypes
 *
 * Manages an in-memory file system that can generate blob URLs
 * for preview and be uploaded to Supabase Storage for sharing.
 */

export type FileType = 'html' | 'js' | 'css' | 'json' | 'txt' | 'svg' | 'png' | 'jpg';

export interface VirtualFile {
  path: string;
  content: string | ArrayBuffer;
  type: FileType;
  blobUrl?: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
}

export interface VirtualDirectory {
  path: string;
  files: Map<string, VirtualFile>;
  directories: Map<string, VirtualDirectory>;
}

export interface FileSystemSnapshot {
  files: Array<{
    path: string;
    content: string;
    type: FileType;
  }>;
  metadata: {
    createdAt: string;
    variantId?: string;
    sessionId?: string;
  };
}

const MIME_TYPES: Record<FileType, string> = {
  html: 'text/html',
  js: 'application/javascript',
  css: 'text/css',
  json: 'application/json',
  txt: 'text/plain',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
};

export class VirtualFS {
  private files: Map<string, VirtualFile> = new Map();
  private blobUrls: string[] = [];
  private metadata: Record<string, unknown> = {};

  constructor(metadata?: Record<string, unknown>) {
    if (metadata) {
      this.metadata = metadata;
    }
  }

  // ============ File Operations ============

  /**
   * Write a file to the virtual file system
   */
  writeFile(path: string, content: string | ArrayBuffer, type?: FileType): VirtualFile {
    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Infer type from extension if not provided
    const fileType = type || this.inferType(normalizedPath);

    const file: VirtualFile = {
      path: normalizedPath,
      content,
      type: fileType,
      size: typeof content === 'string' ? content.length : content.byteLength,
      createdAt: this.files.get(normalizedPath)?.createdAt || new Date(),
      modifiedAt: new Date(),
    };

    this.files.set(normalizedPath, file);
    return file;
  }

  /**
   * Read a file from the virtual file system
   */
  readFile(path: string): string | ArrayBuffer | null {
    const normalizedPath = this.normalizePath(path);
    return this.files.get(normalizedPath)?.content ?? null;
  }

  /**
   * Read a file as string
   */
  readTextFile(path: string): string | null {
    const content = this.readFile(path);
    if (content === null) return null;
    if (typeof content === 'string') return content;
    return new TextDecoder().decode(content);
  }

  /**
   * Check if a file exists
   */
  exists(path: string): boolean {
    return this.files.has(this.normalizePath(path));
  }

  /**
   * Delete a file
   */
  deleteFile(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const file = this.files.get(normalizedPath);

    if (file?.blobUrl) {
      URL.revokeObjectURL(file.blobUrl);
      this.blobUrls = this.blobUrls.filter(url => url !== file.blobUrl);
    }

    return this.files.delete(normalizedPath);
  }

  /**
   * Rename/move a file
   */
  renameFile(oldPath: string, newPath: string): boolean {
    const file = this.files.get(this.normalizePath(oldPath));
    if (!file) return false;

    this.deleteFile(oldPath);
    file.path = this.normalizePath(newPath);
    file.modifiedAt = new Date();
    this.files.set(file.path, file);
    return true;
  }

  /**
   * Get file info without content
   */
  getFileInfo(path: string): Omit<VirtualFile, 'content'> | null {
    const file = this.files.get(this.normalizePath(path));
    if (!file) return null;

    const { content, ...info } = file;
    return info;
  }

  // ============ Directory Operations ============

  /**
   * List all files in a directory
   */
  listDirectory(dirPath: string = ''): string[] {
    const normalizedDir = this.normalizePath(dirPath);
    const prefix = normalizedDir ? normalizedDir + '/' : '';

    const entries = new Set<string>();

    for (const path of this.files.keys()) {
      if (path.startsWith(prefix)) {
        const relativePath = path.slice(prefix.length);
        const firstPart = relativePath.split('/')[0];
        entries.add(firstPart);
      }
    }

    return Array.from(entries).sort();
  }

  /**
   * List all files recursively
   */
  listAllFiles(): string[] {
    return Array.from(this.files.keys()).sort();
  }

  /**
   * Get directory tree structure
   */
  getDirectoryTree(): VirtualDirectory {
    const root: VirtualDirectory = {
      path: '',
      files: new Map(),
      directories: new Map(),
    };

    for (const [path, file] of this.files) {
      const parts = path.split('/');
      const fileName = parts.pop()!;

      let current = root;

      for (const part of parts) {
        if (!current.directories.has(part)) {
          current.directories.set(part, {
            path: current.path ? `${current.path}/${part}` : part,
            files: new Map(),
            directories: new Map(),
          });
        }
        current = current.directories.get(part)!;
      }

      current.files.set(fileName, file);
    }

    return root;
  }

  // ============ Blob URL Generation ============

  /**
   * Generate blob URL for a single file
   */
  getBlobUrl(path: string): string | null {
    const file = this.files.get(this.normalizePath(path));
    if (!file) return null;

    if (file.blobUrl) return file.blobUrl;

    const mimeType = MIME_TYPES[file.type] || 'application/octet-stream';
    const blob = new Blob(
      [file.content],
      { type: mimeType }
    );

    file.blobUrl = URL.createObjectURL(blob);
    this.blobUrls.push(file.blobUrl);
    return file.blobUrl;
  }

  /**
   * Generate blob URLs for all files
   */
  generateAllBlobUrls(): Map<string, string> {
    const urls = new Map<string, string>();

    for (const path of this.files.keys()) {
      const url = this.getBlobUrl(path);
      if (url) {
        urls.set(path, url);
      }
    }

    return urls;
  }

  /**
   * Build index.html with resolved blob URLs for all dependencies
   */
  buildPreviewHtml(): string {
    const indexFile = this.files.get('index.html');
    if (!indexFile || typeof indexFile.content !== 'string') {
      throw new Error('No index.html found in virtual file system');
    }

    // Generate blob URLs for all files
    this.generateAllBlobUrls();

    let html = indexFile.content;

    // Replace relative paths with blob URLs
    for (const [path, file] of this.files) {
      if (path !== 'index.html' && file.blobUrl) {
        // Handle various path formats
        const patterns = [
          `src="${path}"`,
          `src="./${path}"`,
          `src="/${path}"`,
          `href="${path}"`,
          `href="./${path}"`,
          `href="/${path}"`,
          `from '${path}'`,
          `from './${path}'`,
          `from "/${path}"`,
        ];

        patterns.forEach(pattern => {
          const replacement = pattern
            .replace(path, file.blobUrl!)
            .replace('./', '')
            .replace(/^\//, '');
          html = html.split(pattern).join(replacement);
        });
      }
    }

    return html;
  }

  /**
   * Create a complete blob URL for the preview iframe
   */
  createPreviewUrl(): string {
    const html = this.buildPreviewHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    return url;
  }

  // ============ Serialization ============

  /**
   * Export file system as JSON snapshot
   */
  toSnapshot(): FileSystemSnapshot {
    const files: FileSystemSnapshot['files'] = [];

    for (const [path, file] of this.files) {
      if (typeof file.content === 'string') {
        files.push({
          path,
          content: file.content,
          type: file.type,
        });
      } else {
        // Convert ArrayBuffer to base64
        const base64 = btoa(
          new Uint8Array(file.content).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );
        files.push({
          path,
          content: `data:${MIME_TYPES[file.type]};base64,${base64}`,
          type: file.type,
        });
      }
    }

    return {
      files,
      metadata: {
        createdAt: new Date().toISOString(),
        ...this.metadata as Record<string, string>,
      },
    };
  }

  /**
   * Import file system from JSON snapshot
   */
  fromSnapshot(snapshot: FileSystemSnapshot): void {
    this.clear();

    for (const file of snapshot.files) {
      // Handle base64 encoded binary files
      if (file.content.startsWith('data:')) {
        const base64 = file.content.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        this.writeFile(file.path, bytes.buffer, file.type);
      } else {
        this.writeFile(file.path, file.content, file.type);
      }
    }

    if (snapshot.metadata) {
      this.metadata = { ...snapshot.metadata };
    }
  }

  /**
   * Export as JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.toSnapshot(), null, 2);
  }

  /**
   * Import from JSON string
   */
  fromJSON(json: string): void {
    const snapshot = JSON.parse(json) as FileSystemSnapshot;
    this.fromSnapshot(snapshot);
  }

  // ============ Iteration ============

  /**
   * Iterate over all files
   */
  *entries(): IterableIterator<[string, VirtualFile]> {
    yield* this.files.entries();
  }

  /**
   * Get all files as array
   */
  getAllFiles(): VirtualFile[] {
    return Array.from(this.files.values());
  }

  /**
   * Get total size of all files
   */
  getTotalSize(): number {
    return Array.from(this.files.values()).reduce((sum, file) => sum + file.size, 0);
  }

  /**
   * Get file count
   */
  getFileCount(): number {
    return this.files.size;
  }

  // ============ Cleanup ============

  /**
   * Clear all files and revoke blob URLs
   */
  clear(): void {
    this.dispose();
    this.files.clear();
    this.metadata = {};
  }

  /**
   * Revoke all blob URLs (call when done with preview)
   */
  dispose(): void {
    this.blobUrls.forEach(url => URL.revokeObjectURL(url));
    this.blobUrls = [];

    // Clear blob URLs from files
    for (const file of this.files.values()) {
      file.blobUrl = undefined;
    }
  }

  // ============ Utilities ============

  private normalizePath(path: string): string {
    // Remove leading slash and ./
    return path
      .replace(/^\.?\//, '')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '');
  }

  private inferType(path: string): FileType {
    const ext = path.split('.').pop()?.toLowerCase();

    const extMap: Record<string, FileType> = {
      html: 'html',
      htm: 'html',
      js: 'js',
      mjs: 'js',
      css: 'css',
      json: 'json',
      txt: 'txt',
      svg: 'svg',
      png: 'png',
      jpg: 'jpg',
      jpeg: 'jpg',
    };

    return extMap[ext || ''] || 'txt';
  }

  // ============ Static Factory Methods ============

  /**
   * Create VirtualFS from a JSON snapshot
   */
  static fromSnapshot(snapshot: FileSystemSnapshot): VirtualFS {
    const fs = new VirtualFS();
    fs.fromSnapshot(snapshot);
    return fs;
  }

  /**
   * Create VirtualFS from a JSON string
   */
  static fromJSON(json: string): VirtualFS {
    const fs = new VirtualFS();
    fs.fromJSON(json);
    return fs;
  }

  /**
   * Create VirtualFS with standard prototype structure
   */
  static createPrototypeFS(options: {
    variantId: string;
    sessionId: string;
    designTokensCss?: string;
    initialState?: Record<string, unknown>;
  }): VirtualFS {
    const fs = new VirtualFS({
      variantId: options.variantId,
      sessionId: options.sessionId,
    });

    // Create standard directory structure
    fs.writeFile('components/.gitkeep', '', 'txt');
    fs.writeFile('state/store.json', JSON.stringify(options.initialState || {}, null, 2), 'json');
    fs.writeFile('flows/user-flow.json', JSON.stringify({ flows: [] }, null, 2), 'json');

    if (options.designTokensCss) {
      fs.writeFile('styles/tokens.css', options.designTokensCss, 'css');
    }

    return fs;
  }
}

export default VirtualFS;
