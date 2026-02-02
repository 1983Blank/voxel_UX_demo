/**
 * FileTreeView - File browser for prototype file structures
 *
 * Displays a hierarchical view of files in a VirtualFS,
 * allowing selection and viewing of individual files.
 */

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  alpha,
  Tooltip,
} from '@mui/material';
import {
  File,
  Folder,
  FolderOpen,
  CaretDown,
  CaretRight,
  FileJs,
  FileCss,
  FileHtml,
  FileCode,
} from '@phosphor-icons/react';
import type { VirtualFile } from '../../runtime/virtual-fs';

// ============ Types ============

interface FileTreeProps {
  files: VirtualFile[];
  selectedFile?: string;
  onFileSelect?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  showSize?: boolean;
  compact?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  file?: VirtualFile;
}

// ============ Helpers ============

function buildTree(files: VirtualFile[]): TreeNode[] {
  const root: TreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: [],
  };

  // Sort files to ensure directories come before files
  const sortedFiles = [...files].sort((a, b) => {
    const aParts = a.path.split('/').length;
    const bParts = b.path.split('/').length;
    return aParts - bParts;
  });

  for (const file of sortedFiles) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join('/');

      let child = current.children.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path,
          isDirectory: !isLast,
          children: [],
          file: isLast ? file : undefined,
        };
        current.children.push(child);
      }

      if (!isLast) {
        child.isDirectory = true;
      }

      current = child;
    }
  }

  // Sort children: directories first, then alphabetically
  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sortChildren);
  };

  sortChildren(root);

  return root.children;
}

function getFileIcon(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  const iconProps = { size: 16, weight: 'duotone' as const };

  switch (ext) {
    case 'html':
    case 'htm':
      return <FileHtml {...iconProps} color="#e34c26" />;
    case 'js':
    case 'mjs':
      return <FileJs {...iconProps} color="#f7df1e" />;
    case 'css':
      return <FileCss {...iconProps} color="#264de4" />;
    case 'json':
      return <FileCode {...iconProps} color="#5e9c77" />;
    default:
      return <File {...iconProps} />;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============ Tree Node Component ============

interface TreeNodeProps {
  node: TreeNode;
  depth: number;
  selectedFile?: string;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onFileSelect?: (path: string) => void;
  onFileDoubleClick?: (path: string) => void;
  showSize?: boolean;
  compact?: boolean;
}

function TreeNodeItem({
  node,
  depth,
  selectedFile,
  expandedDirs,
  onToggleDir,
  onFileSelect,
  onFileDoubleClick,
  showSize,
  compact,
}: TreeNodeProps) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedFile === node.path;
  const indent = depth * (compact ? 12 : 16);

  const handleClick = () => {
    if (node.isDirectory) {
      onToggleDir(node.path);
    } else {
      onFileSelect?.(node.path);
    }
  };

  const handleDoubleClick = () => {
    if (!node.isDirectory) {
      onFileDoubleClick?.(node.path);
    }
  };

  return (
    <>
      <Box
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: compact ? 0.25 : 0.5,
          pl: `${indent + 8}px`,
          cursor: 'pointer',
          borderRadius: 1,
          userSelect: 'none',
          bgcolor: isSelected ? (theme) => alpha(theme.palette.primary.main, 0.12) : 'transparent',
          '&:hover': {
            bgcolor: isSelected
              ? (theme) => alpha(theme.palette.primary.main, 0.16)
              : (theme) => alpha(theme.palette.action.hover, 0.04),
          },
        }}
      >
        {/* Expand/collapse icon for directories */}
        {node.isDirectory ? (
          <Box sx={{ width: 16, display: 'flex', justifyContent: 'center' }}>
            {isExpanded ? (
              <CaretDown size={14} weight="bold" />
            ) : (
              <CaretRight size={14} weight="bold" />
            )}
          </Box>
        ) : (
          <Box sx={{ width: 16 }} />
        )}

        {/* File/folder icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {node.isDirectory ? (
            isExpanded ? (
              <FolderOpen size={16} weight="duotone" color="#90a4ae" />
            ) : (
              <Folder size={16} weight="duotone" color="#90a4ae" />
            )
          ) : (
            getFileIcon(node.path)
          )}
        </Box>

        {/* Name */}
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontSize: compact ? '0.8125rem' : '0.875rem',
            color: isSelected ? 'primary.main' : 'text.primary',
            fontWeight: isSelected ? 500 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name}
        </Typography>

        {/* File size */}
        {showSize && node.file && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', flexShrink: 0 }}
          >
            {formatSize(node.file.size)}
          </Typography>
        )}
      </Box>

      {/* Children */}
      {node.isDirectory && (
        <Collapse in={isExpanded}>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onFileSelect={onFileSelect}
              onFileDoubleClick={onFileDoubleClick}
              showSize={showSize}
              compact={compact}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

// ============ Main Component ============

export function FileTreeView({
  files,
  selectedFile,
  onFileSelect,
  onFileDoubleClick,
  showSize = false,
  compact = false,
}: FileTreeProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['components', 'state', 'flows', 'styles']));

  const tree = useMemo(() => buildTree(files), [files]);

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allDirs = new Set<string>();
    const collectDirs = (nodes: TreeNode[]) => {
      nodes.forEach((node) => {
        if (node.isDirectory) {
          allDirs.add(node.path);
          collectDirs(node.children);
        }
      });
    };
    collectDirs(tree);
    setExpandedDirs(allDirs);
  };

  const collapseAll = () => {
    setExpandedDirs(new Set());
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Files
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Expand all">
            <IconButton size="small" onClick={expandAll}>
              <FolderOpen size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Collapse all">
            <IconButton size="small" onClick={collapseAll}>
              <Folder size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tree */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {tree.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No files
            </Typography>
          </Box>
        ) : (
          tree.map((node) => (
            <TreeNodeItem
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onToggleDir={handleToggleDir}
              onFileSelect={onFileSelect}
              onFileDoubleClick={onFileDoubleClick}
              showSize={showSize}
              compact={compact}
            />
          ))
        )}
      </Box>

      {/* Footer with stats */}
      <Box
        sx={{
          px: 1.5,
          py: 0.75,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {files.length} file{files.length !== 1 ? 's' : ''} •{' '}
          {formatSize(files.reduce((sum, f) => sum + f.size, 0))}
        </Typography>
      </Box>
    </Box>
  );
}

export default FileTreeView;
