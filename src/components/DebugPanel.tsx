/**
 * Debug Panel
 * Displays LLM request/response data for debugging the vibe prototyping pipeline
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
  ArrowRight,
} from '@phosphor-icons/react';
import { useDebugStore, type DebugEntry, type DebugStage } from '@/store/debugStore';

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

const STAGE_COLORS: Record<DebugStage, string> = {
  'understand-request': '#3b82f6',
  'generate-variant-plan': '#8b5cf6',
  'generate-visual-wireframes': '#ec4899',
  'generate-variant-edits-v2': '#f59e0b',
  'generate-variant-code': '#10b981',
  'extract-components': '#06b6d4',
  'iterate-variant': '#6366f1',
  'other': '#64748b',
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
      <IconButton
        size="small"
        onClick={handleCopy}
        sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}
      >
        <Copy size={16} />
      </IconButton>
      {copied && (
        <Typography
          variant="caption"
          sx={{ position: 'absolute', top: 8, right: 36, color: 'success.main' }}
        >
          Copied!
        </Typography>
      )}
      <Box
        component="pre"
        sx={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          maxHeight,
          fontSize: 12,
          lineHeight: 1.4,
          m: 0,
          fontFamily: 'Monaco, Menlo, monospace',
        }}
      >
        {jsonString}
      </Box>
    </Box>
  );
}

function EntryDetail({ entry }: { entry: DebugEntry }) {
  const [tabValue, setTabValue] = useState(0);

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Chip
          label={STAGE_LABELS[entry.stage]}
          size="small"
          sx={{ backgroundColor: STAGE_COLORS[entry.stage], color: 'white' }}
        />
        {entry.status === 'success' && (
          <CheckCircle size={20} color="#10b981" weight="fill" />
        )}
        {entry.status === 'error' && (
          <XCircle size={20} color="#ef4444" weight="fill" />
        )}
        {entry.status === 'pending' && (
          <Clock size={20} color="#f59e0b" weight="fill" />
        )}
        {entry.durationMs && (
          <Typography variant="caption" color="text.secondary">
            {entry.durationMs}ms
          </Typography>
        )}
      </Box>

      {/* Metadata */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {entry.sessionId && (
          <Typography variant="caption" color="text.secondary">
            Session: {entry.sessionId.slice(0, 8)}...
          </Typography>
        )}
        {entry.variantIndex && (
          <Typography variant="caption" color="text.secondary">
            Variant: {entry.variantIndex}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </Typography>
      </Box>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Request" />
        <Tab label="Response" />
        {entry.response?.rawText && <Tab label="Raw Response" />}
      </Tabs>

      {/* Tab Content */}
      {tabValue === 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Endpoint
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontFamily: 'monospace' }}>
            {entry.request.method} {entry.request.endpoint}
          </Typography>

          <Typography variant="subtitle2" gutterBottom>
            Request Body
          </Typography>
          <JsonViewer data={entry.request.body} />
        </Box>
      )}

      {tabValue === 1 && (
        <Box>
          {entry.response ? (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Status: {entry.response.status} ({entry.response.success ? 'Success' : 'Error'})
              </Typography>

              {entry.response.error && (
                <Box
                  sx={{
                    p: 2,
                    mb: 2,
                    backgroundColor: 'error.light',
                    borderRadius: 1,
                    color: 'error.contrastText',
                  }}
                >
                  <Typography variant="body2">{entry.response.error}</Typography>
                </Box>
              )}

              {entry.response.data && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    Response Data
                  </Typography>
                  <JsonViewer data={entry.response.data} />
                </>
              )}
            </>
          ) : (
            <Typography color="text.secondary">No response yet (pending)</Typography>
          )}
        </Box>
      )}

      {tabValue === 2 && entry.response?.rawText && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Raw LLM Response
          </Typography>
          <Box
            component="pre"
            sx={{
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              maxHeight: 400,
              fontSize: 12,
              lineHeight: 1.4,
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
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
        sx: { width: { xs: '100%', sm: 600, md: 800 } },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bug size={24} />
            <Typography variant="h6">LLM Debug Panel</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isEnabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  size="small"
                />
              }
              label="Enabled"
            />
            <Tooltip title="Clear all entries">
              <IconButton onClick={clearEntries} size="small">
                <Trash size={18} />
              </IconButton>
            </Tooltip>
            <IconButton onClick={() => setPanelOpen(false)}>
              <X size={20} />
            </IconButton>
          </Box>
        </Box>

        {/* Filter */}
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Filter by Stage</InputLabel>
            <Select
              value={filterStage}
              label="Filter by Stage"
              onChange={(e) => setFilterStage(e.target.value as DebugStage | 'all')}
            >
              <MenuItem value="all">All Stages</MenuItem>
              <Divider />
              {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                <MenuItem key={stage} value={stage}>
                  {label}
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
              width: 280,
              borderRight: '1px solid',
              borderColor: 'divider',
              overflow: 'auto',
            }}
          >
            {filteredEntries.length === 0 ? (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography color="text.secondary" variant="body2">
                  No debug entries yet.
                  <br />
                  Run an LLM operation to see data here.
                </Typography>
              </Box>
            ) : (
              <List dense disablePadding>
                {filteredEntries.map((entry) => (
                  <ListItem key={entry.id} disablePadding>
                    <ListItemButton
                      selected={entry.id === selectedEntryId}
                      onClick={() => selectEntry(entry.id)}
                    >
                      <Box sx={{ width: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor:
                                entry.status === 'success'
                                  ? '#10b981'
                                  : entry.status === 'error'
                                    ? '#ef4444'
                                    : '#f59e0b',
                            }}
                          />
                          <Typography variant="caption" fontWeight={600}>
                            {STAGE_LABELS[entry.stage]}
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(entry.timestamp).toLocaleTimeString()}
                          {entry.durationMs && ` · ${entry.durationMs}ms`}
                        </Typography>
                      </Box>
                      <ArrowRight size={16} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* Detail View */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {selectedEntry ? (
              <EntryDetail entry={selectedEntry} />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography color="text.secondary">
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
          bottom: 16,
          right: 16,
          backgroundColor: 'background.paper',
          boxShadow: 2,
          '&:hover': { backgroundColor: 'action.hover' },
          zIndex: 1000,
        }}
      >
        <Bug size={24} />
        {(pendingCount > 0 || errorCount > 0) && (
          <Box
            sx={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              borderRadius: '50%',
              backgroundColor: errorCount > 0 ? 'error.main' : 'warning.main',
              color: 'white',
              fontSize: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {errorCount || pendingCount}
          </Box>
        )}
      </IconButton>
    </Tooltip>
  );
}
