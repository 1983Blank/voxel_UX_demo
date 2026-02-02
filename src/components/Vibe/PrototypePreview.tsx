/**
 * PrototypePreview - Preview iframe for file-based prototypes
 *
 * Renders a VirtualFS-based prototype in an iframe with
 * state synchronization and event forwarding.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  alpha,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  ArrowClockwise,
  DeviceMobile,
  DeviceTablet,
  Desktop,
  ArrowsOut,
  X,
  Link as LinkIcon,
  Play,
} from '@phosphor-icons/react';
import { VirtualFS } from '../../runtime/virtual-fs';

// ============ Types ============

interface PrototypePreviewProps {
  /** Virtual file system containing the prototype */
  virtualFS: VirtualFS | null;
  /** Current state to sync with iframe */
  state?: Record<string, unknown>;
  /** Callback when state changes in iframe */
  onStateChange?: (path: string, value: unknown) => void;
  /** Callback when an analytics event is dispatched */
  onAnalyticsEvent?: (event: string, data: unknown) => void;
  /** Whether to show device selector */
  showDeviceSelector?: boolean;
  /** Default device size */
  defaultDevice?: 'mobile' | 'tablet' | 'desktop' | 'full';
  /** Title for the preview */
  title?: string;
  /** Whether preview is loading */
  loading?: boolean;
}

interface DeviceConfig {
  name: string;
  width: number | '100%';
  height: number | '100%';
  icon: React.ReactNode;
}

// ============ Device Configs ============

const DEVICES: Record<string, DeviceConfig> = {
  mobile: {
    name: 'Mobile',
    width: 375,
    height: 667,
    icon: <DeviceMobile size={18} />,
  },
  tablet: {
    name: 'Tablet',
    width: 768,
    height: 1024,
    icon: <DeviceTablet size={18} />,
  },
  desktop: {
    name: 'Desktop',
    width: 1280,
    height: 800,
    icon: <Desktop size={18} />,
  },
  full: {
    name: 'Full',
    width: '100%',
    height: '100%',
    icon: <ArrowsOut size={18} />,
  },
};

// ============ Main Component ============

export function PrototypePreview({
  virtualFS,
  state,
  onStateChange,
  onAnalyticsEvent,
  showDeviceSelector = true,
  defaultDevice = 'desktop',
  title,
  loading = false,
}: PrototypePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState(defaultDevice);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate preview URL when VirtualFS changes
  useEffect(() => {
    if (!virtualFS) {
      setPreviewUrl(null);
      setIsReady(false);
      return;
    }

    try {
      const url = virtualFS.createPreviewUrl();
      setPreviewUrl(url);
      setError(null);
    } catch (err) {
      console.error('Failed to create preview URL:', err);
      setError(err instanceof Error ? err.message : 'Failed to create preview');
      setPreviewUrl(null);
    }

    // Cleanup blob URL on unmount
    return () => {
      virtualFS.dispose();
    };
  }, [virtualFS]);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (iframeRef.current?.contentWindow !== event.source) return;

      const { type, path, value, eventName, data } = event.data || {};

      if (type === 'vx-state-change' && onStateChange) {
        onStateChange(path, value);
      }

      if (type === 'vx-analytics' && onAnalyticsEvent) {
        onAnalyticsEvent(eventName, data);
      }

      if (type === 'vx-ready') {
        setIsReady(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStateChange, onAnalyticsEvent]);

  // Sync state to iframe
  useEffect(() => {
    if (!isReady || !state || !iframeRef.current?.contentWindow) return;

    iframeRef.current.contentWindow.postMessage(
      { type: 'vx-state-sync', state },
      '*'
    );
  }, [isReady, state]);

  // Refresh preview
  const handleRefresh = useCallback(() => {
    if (iframeRef.current && previewUrl) {
      setIsReady(false);
      iframeRef.current.src = previewUrl;
    }
  }, [previewUrl]);

  // Copy share URL
  const handleCopyUrl = useCallback(() => {
    if (previewUrl) {
      navigator.clipboard.writeText(previewUrl);
      // Would show toast here
    }
  }, [previewUrl]);

  // Device dimensions
  const deviceConfig = DEVICES[device];
  const iframeStyle = useMemo(() => ({
    width: deviceConfig.width === '100%' ? '100%' : `${deviceConfig.width}px`,
    height: deviceConfig.height === '100%' ? '100%' : `${deviceConfig.height}px`,
    maxWidth: '100%',
    maxHeight: '100%',
  }), [deviceConfig]);

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title || 'Preview'}
          </Typography>
          {isReady && (
            <Chip
              label="Ready"
              size="small"
              color="success"
              sx={{ height: 18, fontSize: '0.625rem' }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Device selector */}
          {showDeviceSelector && (
            <ToggleButtonGroup
              value={device}
              exclusive
              onChange={(_, newDevice) => newDevice && setDevice(newDevice)}
              size="small"
              sx={{ height: 28 }}
            >
              {Object.entries(DEVICES).map(([key, config]) => (
                <ToggleButton
                  key={key}
                  value={key}
                  sx={{ px: 1, py: 0.5 }}
                >
                  <Tooltip title={config.name}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>{config.icon}</span>
                  </Tooltip>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          )}

          {/* Actions */}
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleRefresh} disabled={!previewUrl}>
              <ArrowClockwise size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy URL">
            <IconButton size="small" onClick={handleCopyUrl} disabled={!previewUrl}>
              <LinkIcon size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Preview area */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          bgcolor: (theme) =>
            device === 'full'
              ? 'transparent'
              : alpha(theme.palette.text.primary, 0.03),
          p: device === 'full' ? 0 : 2,
        }}
      >
        {loading ? (
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Generating preview...
            </Typography>
          </Box>
        ) : error ? (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <X size={48} color="#ef4444" />
            <Typography variant="body1" color="error" sx={{ mt: 2 }}>
              Preview Error
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {error}
            </Typography>
          </Box>
        ) : !previewUrl ? (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            <Play size={48} style={{ opacity: 0.3 }} />
            <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
              No prototype to preview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Generate a prototype to see it here
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              ...iframeStyle,
              bgcolor: 'background.paper',
              borderRadius: device === 'full' ? 0 : 1,
              boxShadow: device === 'full' ? 'none' : 3,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Device frame for mobile/tablet */}
            {device !== 'full' && device !== 'desktop' && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 60,
                  height: 4,
                  bgcolor: (theme) => alpha(theme.palette.text.primary, 0.1),
                  borderRadius: 2,
                }}
              />
            )}

            <iframe
              ref={iframeRef}
              src={previewUrl}
              title="Prototype Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
              onLoad={() => {
                // Send initial ready check
                if (iframeRef.current?.contentWindow) {
                  iframeRef.current.contentWindow.postMessage(
                    { type: 'vx-ping' },
                    '*'
                  );
                }
              }}
            />

            {/* Loading overlay */}
            {!isReady && previewUrl && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: (theme) => alpha(theme.palette.background.paper, 0.8),
                }}
              >
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Footer with device info */}
      {device !== 'full' && previewUrl && (
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
            {deviceConfig.name} •{' '}
            {typeof deviceConfig.width === 'number' ? `${deviceConfig.width}×${deviceConfig.height}` : 'Full width'}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default PrototypePreview;
