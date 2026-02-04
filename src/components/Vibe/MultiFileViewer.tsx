/**
 * MultiFileViewer - View and navigate multi-file prototypes
 *
 * Displays a file tree sidebar with all screens/files in a prototype,
 * allowing navigation between screens and viewing different file types.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Chip,
  alpha,
  Collapse,
} from '@mui/material';
import {
  File,
  FileHtml,
  FileCss,
  FileJs,
  CaretRight,
  CaretDown,
  House,
  TreeStructure,
  CodeBlock,
  Eye,
} from '@phosphor-icons/react';
import type { StoredPrototypeBundle } from '@/services/prototypeFileService';
import type { ModificationSpec, PrototypeFile } from '@/types/toolSchema';

// ============ Types ============

interface MultiFileViewerProps {
  /** The prototype bundle to display */
  bundle: StoredPrototypeBundle;
  /** Currently selected file */
  currentFile?: string;
  /** Callback when a file is selected */
  onFileSelect: (filename: string) => void;
  /** Whether to show preview or code view */
  viewMode?: 'preview' | 'code';
  /** Callback when view mode changes */
  onViewModeChange?: (mode: 'preview' | 'code') => void;
  /** Callback when spec edit is requested */
  onEditSpec?: (spec: ModificationSpec) => void;
  /** Height of the component */
  height?: number | string;
}

// ============ File Icons ============

function getFileIcon(type: PrototypeFile['type'], isEntry?: boolean) {
  if (isEntry) {
    return <House size={18} weight="fill" />;
  }

  switch (type) {
    case 'html':
      return <FileHtml size={18} />;
    case 'css':
      return <FileCss size={18} />;
    case 'js':
      return <FileJs size={18} />;
    case 'json':
      return <File size={18} />;
    default:
      return <File size={18} />;
  }
}

// ============ File Tree Item ============

interface FileTreeItemProps {
  file: PrototypeFile;
  isActive: boolean;
  isEntry: boolean;
  onClick: () => void;
}

function FileTreeItem({ file, isActive, isEntry, onClick }: FileTreeItemProps) {
  return (
    <ListItemButton
      onClick={onClick}
      selected={isActive}
      sx={{
        py: 0.5,
        pl: 2,
        pr: 1,
        borderRadius: 1,
        '&.Mui-selected': {
          bgcolor: theme => alpha(theme.palette.primary.main, 0.12),
          '&:hover': {
            bgcolor: theme => alpha(theme.palette.primary.main, 0.18),
          },
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>
        {getFileIcon(file.type, isEntry)}
      </ListItemIcon>
      <ListItemText
        primary={file.filename}
        primaryTypographyProps={{
          variant: 'body2',
          fontFamily: 'monospace',
          fontSize: '0.8rem',
          noWrap: true,
        }}
      />
      {isEntry && (
        <Chip
          label="entry"
          size="small"
          sx={{ height: 18, fontSize: '0.65rem', ml: 1 }}
        />
      )}
    </ListItemButton>
  );
}

// ============ Stats Display ============

interface BundleStatsProps {
  bundle: StoredPrototypeBundle;
}

function BundleStats({ bundle }: BundleStatsProps) {
  const stats = useMemo(() => {
    const htmlFiles = bundle.files.filter(f => f.type === 'html');
    const cssFiles = bundle.files.filter(f => f.type === 'css');
    const jsFiles = bundle.files.filter(f => f.type === 'js');
    const totalSize = bundle.files.reduce((acc, f) => acc + f.content.length, 0);

    return {
      screens: htmlFiles.length,
      styles: cssFiles.length,
      scripts: jsFiles.length,
      totalSize: Math.round(totalSize / 1024),
    };
  }, [bundle.files]);

  return (
    <Box sx={{ px: 2, py: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <Chip
        label={`${stats.screens} screen${stats.screens !== 1 ? 's' : ''}`}
        size="small"
        icon={<FileHtml size={14} />}
        sx={{ height: 22 }}
      />
      {stats.styles > 0 && (
        <Chip
          label={`${stats.styles} css`}
          size="small"
          icon={<FileCss size={14} />}
          sx={{ height: 22 }}
        />
      )}
      <Chip
        label={`${stats.totalSize}KB`}
        size="small"
        sx={{ height: 22 }}
      />
    </Box>
  );
}

// ============ Main Component ============

export function MultiFileViewer({
  bundle,
  currentFile,
  onFileSelect,
  viewMode = 'preview',
  onViewModeChange,
  onEditSpec,
  height = '100%',
}: MultiFileViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    screens: true,
    assets: true,
  });

  // Group files by type
  const groupedFiles = useMemo(() => {
    const screens = bundle.files.filter(f => f.type === 'html');
    const styles = bundle.files.filter(f => f.type === 'css');
    const scripts = bundle.files.filter(f => f.type === 'js');

    return { screens, styles, scripts };
  }, [bundle.files]);

  // Current file content
  const currentFileContent = useMemo(() => {
    const file = bundle.files.find(f => f.filename === currentFile);
    return file?.content || '';
  }, [bundle.files, currentFile]);

  const currentFileType = useMemo(() => {
    const file = bundle.files.find(f => f.filename === currentFile);
    return file?.type || 'html';
  }, [bundle.files, currentFile]);

  // Toggle section
  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  // Check if current file is entry
  const isEntryFile = currentFile === bundle.entryPoint;

  return (
    <Box
      sx={{
        display: 'flex',
        height,
        bgcolor: 'background.paper',
        borderRadius: 1,
        overflow: 'hidden',
        border: 1,
        borderColor: 'divider',
      }}
    >
      {/* File Tree Sidebar */}
      <Box
        sx={{
          width: 220,
          minWidth: 220,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: theme => alpha(theme.palette.background.default, 0.5),
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <TreeStructure size={18} />
          <Typography variant="subtitle2" fontWeight={600}>
            Files
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
            {bundle.files.length}
          </Typography>
        </Box>

        {/* Stats */}
        <BundleStats bundle={bundle} />

        <Divider />

        {/* File List */}
        <List sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
          {/* Screens Section */}
          <ListItem
            disablePadding
            sx={{ px: 1 }}
          >
            <ListItemButton
              onClick={() => toggleSection('screens')}
              sx={{ py: 0.5, borderRadius: 1 }}
            >
              {expandedSections.screens ? <CaretDown size={14} /> : <CaretRight size={14} />}
              <Typography variant="caption" fontWeight={600} sx={{ ml: 0.5 }}>
                SCREENS
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {groupedFiles.screens.length}
              </Typography>
            </ListItemButton>
          </ListItem>
          <Collapse in={expandedSections.screens}>
            {groupedFiles.screens.map(file => (
              <FileTreeItem
                key={file.filename}
                file={file}
                isActive={file.filename === currentFile}
                isEntry={file.filename === bundle.entryPoint}
                onClick={() => onFileSelect(file.filename)}
              />
            ))}
          </Collapse>

          {/* Assets Section (CSS/JS) */}
          {(groupedFiles.styles.length > 0 || groupedFiles.scripts.length > 0) && (
            <>
              <ListItem
                disablePadding
                sx={{ px: 1, mt: 1 }}
              >
                <ListItemButton
                  onClick={() => toggleSection('assets')}
                  sx={{ py: 0.5, borderRadius: 1 }}
                >
                  {expandedSections.assets ? <CaretDown size={14} /> : <CaretRight size={14} />}
                  <Typography variant="caption" fontWeight={600} sx={{ ml: 0.5 }}>
                    ASSETS
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {groupedFiles.styles.length + groupedFiles.scripts.length}
                  </Typography>
                </ListItemButton>
              </ListItem>
              <Collapse in={expandedSections.assets}>
                {groupedFiles.styles.map(file => (
                  <FileTreeItem
                    key={file.filename}
                    file={file}
                    isActive={file.filename === currentFile}
                    isEntry={false}
                    onClick={() => onFileSelect(file.filename)}
                  />
                ))}
                {groupedFiles.scripts.map(file => (
                  <FileTreeItem
                    key={file.filename}
                    file={file}
                    isActive={file.filename === currentFile}
                    isEntry={false}
                    onClick={() => onFileSelect(file.filename)}
                  />
                ))}
              </Collapse>
            </>
          )}
        </List>

        {/* Spec Edit Button */}
        {bundle.spec && onEditSpec && (
          <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
            <Tooltip title="Edit modification spec">
              <IconButton
                size="small"
                onClick={() => onEditSpec(bundle.spec!)}
                sx={{ width: '100%' }}
              >
                <CodeBlock size={18} />
                <Typography variant="caption" sx={{ ml: 1 }}>
                  Edit Spec
                </Typography>
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {/* Content Area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Content Header */}
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {currentFile && getFileIcon(currentFileType, isEntryFile)}
          <Typography variant="body2" fontFamily="monospace" fontWeight={500}>
            {currentFile || 'No file selected'}
          </Typography>

          {/* View Mode Toggle */}
          {onViewModeChange && currentFileType === 'html' && (
            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
              <Tooltip title="Preview">
                <IconButton
                  size="small"
                  onClick={() => onViewModeChange('preview')}
                  color={viewMode === 'preview' ? 'primary' : 'default'}
                >
                  <Eye size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title="View Code">
                <IconButton
                  size="small"
                  onClick={() => onViewModeChange('code')}
                  color={viewMode === 'code' ? 'primary' : 'default'}
                >
                  <CodeBlock size={18} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Content View */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {!currentFile ? (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <Typography variant="body2">
                Select a file to view
              </Typography>
            </Box>
          ) : viewMode === 'preview' && currentFileType === 'html' ? (
            /* Preview Mode - iframe */
            <iframe
              srcDoc={currentFileContent}
              title={currentFile}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: 'white',
              }}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          ) : (
            /* Code Mode */
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                overflow: 'auto',
                bgcolor: theme => alpha(theme.palette.common.black, 0.02),
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <code>{currentFileContent}</code>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default MultiFileViewer;
