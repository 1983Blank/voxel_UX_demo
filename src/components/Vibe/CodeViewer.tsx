/**
 * CodeViewer - Syntax-highlighted code viewer
 *
 * Displays file contents with syntax highlighting,
 * line numbers, and optional editing capabilities.
 */

import { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Button,
} from '@mui/material';
import {
  Copy,
  Check,
  Download,
  Pencil,
  X,
  FloppyDisk,
} from '@phosphor-icons/react';

// ============ Types ============

interface CodeViewerProps {
  /** File path for display and syntax detection */
  filePath: string;
  /** Code content to display */
  content: string;
  /** Callback when content is edited */
  onContentChange?: (content: string) => void;
  /** Whether to allow editing */
  editable?: boolean;
  /** Whether to show line numbers */
  showLineNumbers?: boolean;
  /** Maximum height (scrollable) */
  maxHeight?: number | string;
  /** Compact mode */
  compact?: boolean;
}

// ============ Syntax Highlighting ============

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    js: 'javascript',
    mjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    html: 'html',
    htm: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
  };
  return langMap[ext || ''] || 'text';
}

// ============ Main Component ============

export function CodeViewer({
  filePath,
  content,
  onContentChange,
  editable = false,
  showLineNumbers = true,
  maxHeight = 400,
  compact = false,
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const language = useMemo(() => getLanguage(filePath), [filePath]);
  const fileName = useMemo(() => filePath.split('/').pop() || filePath, [filePath]);
  const lines = useMemo(() => content.split('\n'), [content]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, fileName]);

  const handleStartEdit = () => {
    setEditContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onContentChange?.(editContent);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent('');
  };

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: '#1e1e1e',
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
          borderColor: 'rgba(255,255,255,0.1)',
          bgcolor: '#252526',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{
              color: '#cccccc',
              fontFamily: 'monospace',
              fontSize: compact ? '0.75rem' : '0.8125rem',
            }}
          >
            {fileName}
          </Typography>
          <Chip
            label={language}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.625rem',
              bgcolor: 'rgba(255,255,255,0.1)',
              color: '#888',
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {editable && !isEditing && (
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={handleStartEdit}
                sx={{ color: '#888', '&:hover': { color: '#ccc' } }}
              >
                <Pencil size={14} />
              </IconButton>
            </Tooltip>
          )}
          {isEditing ? (
            <>
              <Button
                size="small"
                startIcon={<FloppyDisk size={14} />}
                onClick={handleSaveEdit}
                sx={{ color: '#22c55e', fontSize: '0.75rem' }}
              >
                Save
              </Button>
              <Button
                size="small"
                startIcon={<X size={14} />}
                onClick={handleCancelEdit}
                sx={{ color: '#888', fontSize: '0.75rem' }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  sx={{ color: '#888', '&:hover': { color: '#ccc' } }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
              </Tooltip>
              <Tooltip title="Download">
                <IconButton
                  size="small"
                  onClick={handleDownload}
                  sx={{ color: '#888', '&:hover': { color: '#ccc' } }}
                >
                  <Download size={14} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      {/* Code content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          maxHeight,
        }}
      >
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 200,
              padding: '12px',
              background: '#1e1e1e',
              color: '#d4d4d4',
              border: 'none',
              outline: 'none',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: compact ? '12px' : '13px',
              lineHeight: 1.5,
              resize: 'none',
              tabSize: 2,
            }}
            spellCheck={false}
          />
        ) : (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 0,
              display: 'flex',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: compact ? '12px' : '13px',
              lineHeight: 1.5,
            }}
          >
            {/* Line numbers */}
            {showLineNumbers && (
              <Box
                sx={{
                  flexShrink: 0,
                  textAlign: 'right',
                  pr: 1.5,
                  pl: 1.5,
                  pt: 1.5,
                  pb: 1.5,
                  color: '#5a5a5a',
                  bgcolor: '#1e1e1e',
                  borderRight: '1px solid rgba(255,255,255,0.05)',
                  userSelect: 'none',
                }}
              >
                {lines.map((_, index) => (
                  <Box key={index}>
                    {index + 1}
                  </Box>
                ))}
              </Box>
            )}

            {/* Code */}
            <Box
              component="code"
              sx={{
                flex: 1,
                overflow: 'auto',
                pl: 2,
                pr: 2,
                pt: 1.5,
                pb: 1.5,
                color: '#d4d4d4',
              }}
            >
              {content}
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 1.5,
          py: 0.5,
          borderTop: 1,
          borderColor: 'rgba(255,255,255,0.1)',
          bgcolor: '#252526',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Typography
          variant="caption"
          sx={{ color: '#5a5a5a', fontFamily: 'monospace' }}
        >
          {lines.length} lines • {content.length} chars
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: '#5a5a5a', fontFamily: 'monospace' }}
        >
          {language.toUpperCase()}
        </Typography>
      </Box>
    </Box>
  );
}

export default CodeViewer;
