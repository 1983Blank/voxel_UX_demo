/**
 * Debug Panel
 * Displays LLM request/response data for debugging the vibe prototyping pipeline
 * Styled to match the app's modern gradient theme
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Tooltip from '@mui/material/Tooltip';
import {
  X,
  Bug,
  Trash,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  CaretRight,
  Terminal,
} from '@phosphor-icons/react';
import { useDebugStore, type DebugEntry, type DebugStage } from '@/store/debugStore';
import { modernColors } from '@/theme/modernGradientTheme';

// Theme colors for the debug panel
const panelColors = {
  bg: '#1E1B4B', // Deep indigo (void)
  bgLight: '#312E81', // Indigo 900
  surface: 'rgba(79, 70, 229, 0.15)', // Subtle indigo surface
  surfaceHover: 'rgba(79, 70, 229, 0.25)',
  border: 'rgba(99, 102, 241, 0.3)', // Indigo border
  text: '#E0E7FF', // Indigo 100
  textSecondary: '#A5B4FC', // Indigo 300
  textMuted: '#818CF8', // Indigo 400
  success: '#34D399', // Mint
  error: '#F87171', // Red 400
  warning: '#FBBF24', // Amber 400
  codeBlock: '#0f0e1a', // Near black with indigo tint
};

const STAGE_LABELS: Record<DebugStage, string> = {
  'understand-request': 'Understanding',
  'generate-variant-plan': 'Plan Generation',
  'generate-visual-wireframes': 'Wireframes',
  'generate-variant-edits-v2': 'Edit Operations',
  'generate-variant-code': 'Code Generation',
  'extract-components': 'Component Extraction',
  'iterate-variant': 'Iteration',
  'other': 'Other',
};

const STAGE_COLORS: Record<DebugStage, { bg: string; text: string }> = {
  'understand-request': { bg: 'rgba(99, 102, 241, 0.3)', text: '#A5B4FC' }, // Indigo
  'generate-variant-plan': { bg: 'rgba(139, 92, 246, 0.3)', text: '#C4B5FD' }, // Violet
  'generate-visual-wireframes': { bg: 'rgba(236, 72, 153, 0.3)', text: '#F9A8D4' }, // Pink
  'generate-variant-edits-v2': { bg: 'rgba(245, 158, 11, 0.3)', text: '#FCD34D' }, // Amber
  'generate-variant-code': { bg: 'rgba(52, 211, 153, 0.3)', text: '#6EE7B7' }, // Mint
  'extract-components': { bg: 'rgba(6, 182, 212, 0.3)', text: '#67E8F9' }, // Cyan
  'iterate-variant': { bg: 'rgba(79, 70, 229, 0.3)', text: '#818CF8' }, // Indigo bright
  'other': { bg: 'rgba(100, 116, 139, 0.3)', text: '#94A3B8' }, // Slate
};

function JsonViewer({ data, maxHeight = 400 }: { data: unknown; maxHeight?: number }) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            color: panelColors.textMuted,
            backgroundColor: 'rgba(79, 70, 229, 0.2)',
            '&:hover': {
              backgroundColor: 'rgba(79, 70, 229, 0.4)',
              color: panelColors.text,
            },
          }}
        >
          <Copy size={14} weight={copied ? 'fill' : 'regular'} />
        </IconButton>
      </Tooltip>
      <Box
        component="pre"
        sx={{
          backgroundColor: panelColors.codeBlock,
          color: panelColors.textSecondary,
          p: 2,
          pt: 2.5,
          borderRadius: 2,
          border: `1px solid ${panelColors.border}`,
          overflow: 'auto',
          maxHeight,
          fontSize: 11,
          lineHeight: 1.5,
          m: 0,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          '&::-webkit-scrollbar': {
            width: 6,
            height: 6,
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: panelColors.border,
            borderRadius: 3,
          },
        }}
      >
        {jsonString}
      </Box>
    </Box>
  );
}

function EntryDetail({ entry }: { entry: DebugEntry }) {
  const [tabValue, setTabValue] = useState(0);
  const stageColor = STAGE_COLORS[entry.stage];

  return (
    <Box sx={{ p: 2.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Chip
          label={STAGE_LABELS[entry.stage]}
          size="small"
          sx={{
            backgroundColor: stageColor.bg,
            color: stageColor.text,
            fontWeight: 600,
            fontSize: 11,
            height: 24,
            border: `1px solid ${stageColor.text}30`,
          }}
        />
        {entry.status === 'success' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircle size={18} color={panelColors.success} weight="fill" />
            <Typography variant="caption" sx={{ color: panelColors.success, fontWeight: 500 }}>
              Success
            </Typography>
          </Box>
        )}
        {entry.status === 'error' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <XCircle size={18} color={panelColors.error} weight="fill" />
            <Typography variant="caption" sx={{ color: panelColors.error, fontWeight: 500 }}>
              Error
            </Typography>
          </Box>
        )}
        {entry.status === 'pending' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Clock size={18} color={panelColors.warning} weight="fill" />
            <Typography variant="caption" sx={{ color: panelColors.warning, fontWeight: 500 }}>
              Pending
            </Typography>
          </Box>
        )}
        {entry.durationMs && (
          <Chip
            label={`${entry.durationMs}ms`}
            size="small"
            sx={{
              backgroundColor: 'rgba(52, 211, 153, 0.15)',
              color: panelColors.success,
              fontSize: 10,
              fontWeight: 600,
              height: 20,
              ml: 'auto',
            }}
          />
        )}
      </Box>

      {/* Metadata */}
      <Box
        sx={{
          mb: 2.5,
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          p: 1.5,
          backgroundColor: panelColors.surface,
          borderRadius: 1.5,
          border: `1px solid ${panelColors.border}`,
        }}
      >
        {entry.sessionId && (
          <Box>
            <Typography variant="caption" sx={{ color: panelColors.textMuted, display: 'block', fontSize: 10 }}>
              Session
            </Typography>
            <Typography variant="caption" sx={{ color: panelColors.text, fontFamily: 'monospace', fontSize: 11 }}>
              {entry.sessionId.slice(0, 8)}...
            </Typography>
          </Box>
        )}
        {entry.variantIndex !== undefined && (
          <Box>
            <Typography variant="caption" sx={{ color: panelColors.textMuted, display: 'block', fontSize: 10 }}>
              Variant
            </Typography>
            <Typography variant="caption" sx={{ color: panelColors.text, fontSize: 11 }}>
              #{entry.variantIndex}
            </Typography>
          </Box>
        )}
        <Box>
          <Typography variant="caption" sx={{ color: panelColors.textMuted, display: 'block', fontSize: 10 }}>
            Timestamp
          </Typography>
          <Typography variant="caption" sx={{ color: panelColors.text, fontSize: 11 }}>
            {new Date(entry.timestamp).toLocaleTimeString()}
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={(_, v) => setTabValue(v)}
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTabs-indicator': {
            backgroundColor: modernColors.primary,
            height: 2,
          },
          '& .MuiTab-root': {
            color: panelColors.textMuted,
            fontSize: 12,
            fontWeight: 500,
            minHeight: 36,
            textTransform: 'none',
            '&.Mui-selected': {
              color: panelColors.text,
            },
          },
        }}
      >
        <Tab label="Request" />
        <Tab label="Response" />
        {entry.response?.rawText && <Tab label="Raw" />}
      </Tabs>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: panelColors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
              display: 'block',
              mb: 1,
            }}
          >
            Endpoint
          </Typography>
          <Box
            sx={{
              mb: 2.5,
              p: 1.5,
              backgroundColor: panelColors.codeBlock,
              borderRadius: 1.5,
              border: `1px solid ${panelColors.border}`,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: panelColors.textSecondary,
            }}
          >
            <Box component="span" sx={{ color: panelColors.success, fontWeight: 600 }}>
              {entry.request.method}
            </Box>{' '}
            {entry.request.endpoint}
          </Box>

          <Typography
            variant="caption"
            sx={{
              color: panelColors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
              display: 'block',
              mb: 1,
            }}
          >
            Request Body
          </Typography>
          <JsonViewer data={entry.request.body} />
        </Box>
      )}

      {tabValue === 1 && (
        <Box>
          {entry.response ? (
            <>
              <Box
                sx={{
                  mb: 2,
                  p: 1.5,
                  backgroundColor: entry.response.success
                    ? 'rgba(52, 211, 153, 0.1)'
                    : 'rgba(248, 113, 113, 0.1)',
                  borderRadius: 1.5,
                  border: `1px solid ${entry.response.success ? panelColors.success : panelColors.error}40`,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    color: entry.response.success ? panelColors.success : panelColors.error,
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Status: {entry.response.status} ({entry.response.success ? 'Success' : 'Error'})
                </Typography>
              </Box>

              {entry.response.error && (
                <Box
                  sx={{
                    p: 2,
                    mb: 2,
                    backgroundColor: 'rgba(248, 113, 113, 0.15)',
                    borderRadius: 1.5,
                    border: `1px solid ${panelColors.error}40`,
                  }}
                >
                  <Typography variant="body2" sx={{ color: panelColors.error, fontSize: 12 }}>
                    {entry.response.error}
                  </Typography>
                </Box>
              )}

              {entry.response.data && (
                <>
                  <Typography
                    variant="caption"
                    sx={{
                      color: panelColors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      fontWeight: 600,
                      display: 'block',
                      mb: 1,
                    }}
                  >
                    Response Data
                  </Typography>
                  <JsonViewer data={entry.response.data} />
                </>
              )}
            </>
          ) : (
            <Box
              sx={{
                p: 3,
                textAlign: 'center',
                backgroundColor: panelColors.surface,
                borderRadius: 2,
                border: `1px dashed ${panelColors.border}`,
              }}
            >
              <Clock size={32} color={panelColors.warning} weight="duotone" />
              <Typography sx={{ color: panelColors.textMuted, mt: 1, fontSize: 13 }}>
                Waiting for response...
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {tabValue === 2 && entry.response?.rawText && (
        <Box>
          <Typography
            variant="caption"
            sx={{
              color: panelColors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
              display: 'block',
              mb: 1,
            }}
          >
            Raw LLM Response
          </Typography>
          <Box
            component="pre"
            sx={{
              backgroundColor: panelColors.codeBlock,
              color: panelColors.textSecondary,
              p: 2,
              borderRadius: 2,
              border: `1px solid ${panelColors.border}`,
              overflow: 'auto',
              maxHeight: 400,
              fontSize: 11,
              lineHeight: 1.5,
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: "'JetBrains Mono', monospace",
              '&::-webkit-scrollbar': {
                width: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: panelColors.border,
                borderRadius: 3,
              },
            }}
          >
            {entry.response.rawText}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function LLMDebugPanel() {
  const {
    entries,
    isEnabled,
    isPanelOpen,
    selectedEntryId,
    filterStage,
    setEnabled,
    setPanelOpen,
    selectEntry,
    setFilterStage,
    clearEntries,
  } = useDebugStore();

  const filteredEntries =
    filterStage === 'all' ? entries : entries.filter((e) => e.stage === filterStage);

  const selectedEntry = entries.find((e) => e.id === selectedEntryId);

  return (
    <Drawer
      anchor="right"
      open={isPanelOpen}
      onClose={() => setPanelOpen(false)}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 600, md: 800 },
          backgroundColor: panelColors.bg,
          backgroundImage: 'none',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: `1px solid ${panelColors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: `linear-gradient(180deg, ${panelColors.bgLight} 0%, ${panelColors.bg} 100%)`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                backgroundColor: 'rgba(79, 70, 229, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Terminal size={20} color={panelColors.textSecondary} weight="duotone" />
            </Box>
            <Box>
              <Typography
                variant="subtitle1"
                sx={{ color: panelColors.text, fontWeight: 600, lineHeight: 1.2 }}
              >
                LLM Debug Panel
              </Typography>
              <Typography variant="caption" sx={{ color: panelColors.textMuted, fontSize: 11 }}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isEnabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  size="small"
                  sx={{
                    '& .MuiSwitch-track': {
                      backgroundColor: panelColors.border,
                    },
                    '& .MuiSwitch-thumb': {
                      backgroundColor: isEnabled ? modernColors.primary : panelColors.textMuted,
                    },
                    '& .Mui-checked + .MuiSwitch-track': {
                      backgroundColor: `${modernColors.primary}60 !important`,
                    },
                  }}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: panelColors.textSecondary, fontSize: 11 }}>
                  Recording
                </Typography>
              }
              sx={{ mr: 1 }}
            />
            <Tooltip title="Clear all entries">
              <IconButton
                onClick={clearEntries}
                size="small"
                sx={{
                  color: panelColors.textMuted,
                  '&:hover': { backgroundColor: 'rgba(248, 113, 113, 0.2)', color: panelColors.error },
                }}
              >
                <Trash size={18} />
              </IconButton>
            </Tooltip>
            <IconButton
              onClick={() => setPanelOpen(false)}
              sx={{
                color: panelColors.textMuted,
                '&:hover': { backgroundColor: panelColors.surface, color: panelColors.text },
              }}
            >
              <X size={20} />
            </IconButton>
          </Box>
        </Box>

        {/* Filter */}
        <Box sx={{ p: 2, borderBottom: `1px solid ${panelColors.border}` }}>
          <FormControl
            size="small"
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: panelColors.surface,
                color: panelColors.text,
                '& fieldset': {
                  borderColor: panelColors.border,
                },
                '&:hover fieldset': {
                  borderColor: modernColors.primary,
                },
                '&.Mui-focused fieldset': {
                  borderColor: modernColors.primary,
                },
              },
              '& .MuiInputLabel-root': {
                color: panelColors.textMuted,
                '&.Mui-focused': {
                  color: modernColors.primaryBright,
                },
              },
              '& .MuiSelect-icon': {
                color: panelColors.textMuted,
              },
            }}
          >
            <InputLabel>Filter by Stage</InputLabel>
            <Select
              value={filterStage}
              label="Filter by Stage"
              onChange={(e) => setFilterStage(e.target.value as DebugStage | 'all')}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: panelColors.bgLight,
                    border: `1px solid ${panelColors.border}`,
                    '& .MuiMenuItem-root': {
                      color: panelColors.text,
                      '&:hover': {
                        backgroundColor: panelColors.surface,
                      },
                      '&.Mui-selected': {
                        backgroundColor: 'rgba(79, 70, 229, 0.3)',
                        '&:hover': {
                          backgroundColor: 'rgba(79, 70, 229, 0.4)',
                        },
                      },
                    },
                  },
                },
              }}
            >
              <MenuItem value="all">All Stages</MenuItem>
              <Divider sx={{ borderColor: panelColors.border }} />
              {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                <MenuItem key={stage} value={stage}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: STAGE_COLORS[stage as DebugStage].text,
                      }}
                    />
                    {label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Entry List */}
          <Box
            sx={{
              width: 260,
              borderRight: `1px solid ${panelColors.border}`,
              overflow: 'auto',
              backgroundColor: 'rgba(0, 0, 0, 0.15)',
              '&::-webkit-scrollbar': {
                width: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: panelColors.border,
                borderRadius: 3,
              },
            }}
          >
            {filteredEntries.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Bug size={40} color={panelColors.textMuted} weight="duotone" />
                <Typography sx={{ color: panelColors.textMuted, mt: 1.5, fontSize: 13 }}>
                  No debug entries yet
                </Typography>
                <Typography sx={{ color: panelColors.textMuted, fontSize: 11, mt: 0.5, opacity: 0.7 }}>
                  Run an LLM operation to see data here
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {filteredEntries.map((entry) => {
                  const stageColor = STAGE_COLORS[entry.stage];
                  return (
                    <ListItem key={entry.id} disablePadding>
                      <ListItemButton
                        selected={entry.id === selectedEntryId}
                        onClick={() => selectEntry(entry.id)}
                        sx={{
                          py: 1.5,
                          px: 2,
                          borderBottom: `1px solid ${panelColors.border}`,
                          '&:hover': {
                            backgroundColor: panelColors.surface,
                          },
                          '&.Mui-selected': {
                            backgroundColor: 'rgba(79, 70, 229, 0.2)',
                            borderLeft: `3px solid ${modernColors.primary}`,
                            '&:hover': {
                              backgroundColor: 'rgba(79, 70, 229, 0.25)',
                            },
                          },
                        }}
                      >
                        <Box sx={{ width: '100%' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor:
                                  entry.status === 'success'
                                    ? panelColors.success
                                    : entry.status === 'error'
                                      ? panelColors.error
                                      : panelColors.warning,
                                boxShadow:
                                  entry.status === 'pending'
                                    ? `0 0 6px ${panelColors.warning}`
                                    : 'none',
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                color: stageColor.text,
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              {STAGE_LABELS[entry.stage]}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography
                              variant="caption"
                              sx={{ color: panelColors.textMuted, fontSize: 10 }}
                            >
                              {new Date(entry.timestamp).toLocaleTimeString()}
                              {entry.durationMs && (
                                <Box
                                  component="span"
                                  sx={{ color: panelColors.success, ml: 0.5 }}
                                >
                                  {entry.durationMs}ms
                                </Box>
                              )}
                            </Typography>
                            <CaretRight size={14} color={panelColors.textMuted} />
                          </Box>
                        </Box>
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            )}
          </Box>

          {/* Detail View */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              '&::-webkit-scrollbar': {
                width: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                backgroundColor: panelColors.border,
                borderRadius: 3,
              },
            }}
          >
            {selectedEntry ? (
              <EntryDetail entry={selectedEntry} />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 3,
                }}
              >
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 3,
                    backgroundColor: panelColors.surface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 2,
                  }}
                >
                  <CaretRight size={28} color={panelColors.textMuted} weight="duotone" />
                </Box>
                <Typography sx={{ color: panelColors.textMuted, fontSize: 14 }}>
                  Select an entry to view details
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Drawer>
  );
}

// Floating debug button to open the panel
export function LLMDebugButton() {
  const { togglePanel, entries, isEnabled } = useDebugStore();

  const pendingCount = entries.filter((e) => e.status === 'pending').length;
  const errorCount = entries.filter((e) => e.status === 'error').length;

  if (!isEnabled) return null;

  return (
    <Tooltip title="Open LLM Debug Panel">
      <IconButton
        onClick={togglePanel}
        sx={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          backgroundColor: panelColors.bg,
          border: `1px solid ${panelColors.border}`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          '&:hover': {
            backgroundColor: panelColors.bgLight,
            boxShadow: `0 4px 20px rgba(79, 70, 229, 0.4)`,
          },
          zIndex: 1000,
        }}
      >
        <Terminal size={22} color={panelColors.textSecondary} weight="duotone" />
        {(pendingCount > 0 || errorCount > 0) && (
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              px: 0.5,
              backgroundColor: errorCount > 0 ? panelColors.error : panelColors.warning,
              color: '#1E1B4B',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 2px 8px ${errorCount > 0 ? panelColors.error : panelColors.warning}60`,
            }}
          >
            {errorCount || pendingCount}
          </Box>
        )}
      </IconButton>
    </Tooltip>
  );
}
