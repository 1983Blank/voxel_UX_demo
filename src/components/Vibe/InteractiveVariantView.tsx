/**
 * InteractiveVariantView - File-based prototype viewer with debugging tools
 *
 * Shows the new interactive prototype system with:
 * - File tree browser
 * - Code viewer
 * - State inspector
 * - Flow debugger
 * - Live preview
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { FileTreeView } from './FileTreeView';
import { CodeViewer } from './CodeViewer';
import { PrototypePreview } from './PrototypePreview';
import { usePrototypeStore } from '../../store/prototypeStore';
import { getVibeVariantLabel } from '../../store/vibeStore';
import type { VariantPlan } from '../../services/variantPlanService';
import type { VibeVariant } from '../../services/variantCodeService';

// ============ Types ============

type PanelView = 'preview' | 'code' | 'files';

interface InteractiveVariantViewProps {
  plans: VariantPlan[];
  variants: VibeVariant[];
  selectedVariantIndex: number | null;
  onSelectVariant: (index: number) => void;
  // View state controlled from parent (topbar)
  panelView?: PanelView;
  onPanelViewChange?: (view: PanelView) => void;
}

// ============ Main Component ============

export function InteractiveVariantView({
  plans,
  variants,
  selectedVariantIndex,
  onSelectVariant,
  panelView: externalPanelView,
  onPanelViewChange,
}: InteractiveVariantViewProps) {
  // Find the first complete variant to use as default
  const firstCompleteVariant = variants.find(v => v.status === 'complete');
  const defaultVariantIndex = selectedVariantIndex || firstCompleteVariant?.variant_index || 1;

  // Local state
  const [activeVariantIndex, setActiveVariantIndex] = useState<number>(defaultVariantIndex);
  const [internalMainView, setInternalMainView] = useState<PanelView>('preview');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // Use external view if provided, otherwise use internal state
  const mainView = externalPanelView ?? internalMainView;
  const setMainView = onPanelViewChange ?? setInternalMainView;

  // Sync with parent's selectedVariantIndex (from dropdown)
  useEffect(() => {
    if (selectedVariantIndex && selectedVariantIndex !== activeVariantIndex) {
      setActiveVariantIndex(selectedVariantIndex);
    }
  }, [selectedVariantIndex]);

  // When variants change, update to first complete if current is not complete
  useEffect(() => {
    const currentVariant = variants.find(v => v.variant_index === activeVariantIndex);
    if (!currentVariant || currentVariant.status !== 'complete') {
      const firstComplete = variants.find(v => v.status === 'complete');
      if (firstComplete && firstComplete.variant_index !== activeVariantIndex) {
        setActiveVariantIndex(firstComplete.variant_index);
      }
    }
  }, [variants, activeVariantIndex]);

  // Prototype store state
  const { getVirtualFS } = usePrototypeStore();

  // Build variant map
  const variantMap = useMemo(
    () => new Map(variants.map((v) => [v.variant_index, v])),
    [variants]
  );

  // Get active variant data
  const activeVariant = variantMap.get(activeVariantIndex);
  const activePlan = plans.find((p) => p.variant_index === activeVariantIndex);
  const isComplete = activeVariant?.status === 'complete';

  // Map variant index to approach for looking up in prototypeStore
  const indexToApproach: Record<number, string> = {
    1: 'minimal',
    2: 'feature-rich',
    3: 'gamified',
    4: 'accessible',
  };

  // Get all prototype store variants to find the right one
  const prototypeVariants = usePrototypeStore((state) => state.variants);

  // Find the VirtualFS by matching the approach
  const virtualFS = useMemo(() => {
    const approach = indexToApproach[activeVariantIndex];
    if (!approach) return null;

    // Find variant ID by approach
    const variantId = Object.keys(prototypeVariants).find(
      (id) => prototypeVariants[id].approach === approach
    );

    if (variantId) {
      return getVirtualFS(variantId);
    }
    return null;
  }, [activeVariantIndex, prototypeVariants, getVirtualFS]);

  // Get files from VirtualFS or create mock when in classic mode
  const files = useMemo(() => {
    if (virtualFS) {
      return virtualFS.getAllFiles();
    }
    // In classic mode, we only have html_url, not the actual file content
    // Return empty - the preview will use the iframe with html_url instead
    return [];
  }, [virtualFS]);

  // Get selected file content (as string)
  const selectedFileContent = useMemo((): string | null => {
    if (!selectedFilePath) return null;
    const file = files.find((f) => f.path === selectedFilePath);
    if (!file) return null;
    // Convert ArrayBuffer to string if needed
    if (file.content instanceof ArrayBuffer) {
      return new TextDecoder().decode(file.content);
    }
    return file.content;
  }, [files, selectedFilePath]);

  // Handlers
  const handleFileSelect = useCallback((path: string) => {
    setSelectedFilePath(path);
    setMainView('code');
  }, []);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Variant Info Header - shows current variant title and description */}
      {activePlan && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            px: 2,
            py: 1,
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {activePlan.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activePlan.description}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Main Content Area */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Files (when in files view) or narrow file tree */}
        {(mainView === 'files' || mainView === 'code') && (
          <Box
            sx={{
              width: mainView === 'files' ? 300 : 200,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'hidden',
            }}
          >
            <FileTreeView
              files={files}
              selectedFile={selectedFilePath || undefined}
              onFileSelect={handleFileSelect}
              compact={mainView === 'code'}
            />
          </Box>
        )}

        {/* Center Panel - Preview or Code */}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Content */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {mainView === 'preview' && virtualFS && (
              <PrototypePreview
                virtualFS={virtualFS}
                title={activePlan?.title}
                loading={activeVariant?.status === 'generating'}
              />
            )}
            {mainView === 'preview' && !virtualFS && activeVariant?.html_url && (
              // Fallback: Show classic iframe when no VirtualFS available
              <Box sx={{ height: '100%', position: 'relative' }}>
                <iframe
                  src={activeVariant.html_url}
                  title={`Variant ${activeVariantIndex} preview`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    bgcolor: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1,
                    fontSize: '0.75rem',
                  }}
                >
                  Classic preview (generate with Interactive mode for full features)
                </Box>
              </Box>
            )}
            {mainView === 'preview' && !virtualFS && !activeVariant?.html_url && (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography color="text.secondary">
                  No preview available
                </Typography>
              </Box>
            )}
            {mainView === 'code' && selectedFileContent && selectedFilePath && (
              <CodeViewer
                filePath={selectedFilePath}
                content={selectedFileContent}
                editable={false}
              />
            )}
            {mainView === 'code' && !selectedFileContent && (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography color="text.secondary">
                  Select a file from the tree to view its contents
                </Typography>
              </Box>
            )}
            {mainView === 'files' && (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {files.length} file{files.length !== 1 ? 's' : ''} in this prototype
                </Typography>
                {activePlan && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Variant Details
                    </Typography>
                    <Typography variant="body2">
                      <strong>Approach:</strong> {getVibeVariantLabel(activePlan.variant_index)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Title:</strong> {activePlan.title}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {activePlan.description}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* Footer - Select Winner */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {isComplete ? 'Click variant tabs to compare' : 'Waiting for generation...'}
        </Typography>
        {isComplete && selectedVariantIndex !== activeVariantIndex && (
          <Chip
            label={`Select Variant ${activeVariantIndex} as Winner`}
            onClick={() => onSelectVariant(activeVariantIndex)}
            color="primary"
            size="small"
            sx={{ cursor: 'pointer' }}
          />
        )}
        {selectedVariantIndex === activeVariantIndex && (
          <Chip label="This variant is selected as winner" color="success" size="small" />
        )}
      </Box>
    </Box>
  );
}

export default InteractiveVariantView;
