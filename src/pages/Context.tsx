import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Switch from '@mui/material/Switch';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Divider from '@mui/material/Divider';
import FlagIcon from '@mui/icons-material/Flag';
import ListAltIcon from '@mui/icons-material/ListAlt';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import SlideshowOutlinedIcon from '@mui/icons-material/SlideshowOutlined';
import TextSnippetOutlinedIcon from '@mui/icons-material/TextSnippetOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import AudiotrackOutlinedIcon from '@mui/icons-material/AudiotrackOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { Button, Card, CardContent, Chip } from '@/components/ui';
import { useSnackbar } from '@/components/SnackbarProvider';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useContextStore } from '@/store/contextStore';
import {
  extractGuidelinesFromVideo,
  createGuidelinesSet,
  type ExtractionProgress,
} from '@/services/uxGuidelinesService';
import type { UXGuidelineCategory, UXGuidelinesSet, UXGuideline } from '@/types/models';
import {
  getContextFiles,
  uploadContextFile,
  deleteContextFile,
  getFileDownloadUrl,
  formatFileSize,
  type ContextFile,
  type ContextCategory as ContextCategoryType,
} from '@/services/contextFilesService';

interface CategoryConfig {
  id: ContextCategoryType;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const categoryConfigs: CategoryConfig[] = [
  {
    id: 'goals',
    title: 'Goals & KPIs',
    description: 'Company objectives, key results, and performance metrics',
    icon: <FlagIcon />,
    color: '#764ba2',
  },
  {
    id: 'kpis',
    title: 'UX Principles & Guidelines',
    description: 'Extract UX patterns from product videos',
    icon: <AutoAwesomeIcon />,
    color: '#4ade80',
  },
  {
    id: 'backlog',
    title: 'Backlog / Opportunities',
    description: 'Product backlog and feature ideas',
    icon: <ListAltIcon />,
    color: '#faad14',
  },
  {
    id: 'knowledge',
    title: 'Knowledge Base',
    description: 'Documentation and reference materials',
    icon: <MenuBookIcon />,
    color: '#667eea',
  },
];

// Supported file types for upload
const SUPPORTED_FILE_TYPES = [
  '.pdf', '.doc', '.docx', '.txt', '.rtf', '.md',  // Documents
  '.xls', '.xlsx', '.csv',                          // Spreadsheets
  '.ppt', '.pptx', '.key',                          // Presentations
  '.mp4', '.mov', '.avi', '.webm', '.mkv',          // Video
  '.mp3', '.wav', '.ogg', '.m4a', '.aac',           // Audio
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', // Images
  '.json', '.xml',                                  // Data
].join(',');

function getFileIcon(fileType: string) {
  switch (fileType) {
    case 'image':
      return <ImageOutlinedIcon />;
    case 'video':
      return <VideocamOutlinedIcon />;
    case 'audio':
      return <AudiotrackOutlinedIcon />;
    case 'pdf':
      return <PictureAsPdfOutlinedIcon />;
    case 'document':
      return <DescriptionOutlinedIcon />;
    case 'spreadsheet':
      return <TableChartOutlinedIcon />;
    case 'presentation':
      return <SlideshowOutlinedIcon />;
    case 'text':
      return <TextSnippetOutlinedIcon />;
    default:
      return <InsertDriveFileOutlinedIcon />;
  }
}

interface FilePreviewProps {
  file: ContextFile;
  onDelete: () => void;
  onOpen: () => void;
  color: string;
}

function FilePreview({ file, onDelete, onOpen, color }: FilePreviewProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1,
        borderRadius: 1,
        backgroundColor: 'rgba(0,0,0,0.03)',
        transition: 'all 0.2s ease',
        '&:hover': {
          backgroundColor: 'rgba(0,0,0,0.06)',
          transform: 'translateX(4px)',
        },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          backgroundColor: `${color}15`,
          color: color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {getFileIcon(file.fileType)}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatFileSize(file.fileSize)}
        </Typography>
      </Box>
      <Tooltip title="Open">
        <IconButton
          size="small"
          onClick={onOpen}
          sx={{ transition: 'all 0.2s ease', '&:hover': { transform: 'scale(1.1)' } }}
        >
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete">
        <IconButton
          size="small"
          onClick={onDelete}
          color="error"
          sx={{ transition: 'all 0.2s ease', '&:hover': { transform: 'scale(1.1)' } }}
        >
          <DeleteOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

interface CategoryCardProps {
  config: CategoryConfig;
  files: ContextFile[];
  onUpload: (category: ContextCategoryType, file: File) => void;
  onDeleteFile: (file: ContextFile) => void;
  onOpenFile: (file: ContextFile) => void;
  uploading: boolean;
}

function CategoryCard({ config, files, onUpload, onDeleteFile, onOpenFile, uploading }: CategoryCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onUpload(config.id, droppedFiles[0]);
      }
    },
    [config.id, onUpload]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      onUpload(config.id, selectedFiles[0]);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        border: isDragging ? `2px dashed ${config.color}` : '2px solid transparent',
        backgroundColor: isDragging ? `${config.color}08` : undefined,
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-4px)',
        },
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              backgroundColor: `${config.color}15`,
              color: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '& svg': { fontSize: 24 },
            }}
          >
            {config.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {config.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {config.description}
            </Typography>
          </Box>
          <Chip
            label={`${files.length} files`}
            size="small"
            sx={{
              backgroundColor: `${config.color}15`,
              color: config.color,
              fontWeight: 500,
            }}
          />
        </Box>

        {uploading && <LinearProgress sx={{ mb: 2 }} />}

        {/* File List */}
        <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
          {files.length === 0 ? (
            <Box
              sx={{
                height: '100%',
                minHeight: 140,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
              }}
            >
              <CloudUploadOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" align="center">
                Drop files here or click to upload
              </Typography>
              <Typography variant="caption" color="text.disabled" align="center" sx={{ mt: 0.5 }}>
                PDF, Docs, Sheets, Videos, Audio
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {files.slice(0, 3).map((file) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  color={config.color}
                  onDelete={() => onDeleteFile(file)}
                  onOpen={() => onOpenFile(file)}
                />
              ))}
              {files.length > 3 && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                  +{files.length - 3} more files
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Upload Button */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileSelect}
          accept={SUPPORTED_FILE_TYPES}
        />
        <Button
          variant="outlined"
          startIcon={<AddOutlinedIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          sx={{
            borderColor: config.color,
            color: config.color,
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: config.color,
              backgroundColor: `${config.color}10`,
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${config.color}30`,
            },
          }}
        >
          Upload File
        </Button>
      </CardContent>
    </Card>
  );
}

// UX Guidelines Card - specialized card with extraction functionality
interface UXGuidelinesCardProps {
  config: CategoryConfig;
  files: ContextFile[];
  onUpload: (category: ContextCategoryType, file: File) => void;
  onDeleteFile: (file: ContextFile) => void;
  onOpenFile: (file: ContextFile) => void;
  uploading: boolean;
  // UX Guidelines specific
  uxGuidelinesSet: UXGuidelinesSet | null;
  uxGuidelinesEnabled: boolean;
  onToggleEnabled: () => void;
  onSetGuidelines: (set: UXGuidelinesSet) => void;
  onClearGuidelines: () => void;
  onDeleteGuideline: (id: string) => void;
}

function UXGuidelinesCard({
  config,
  files,
  onUpload,
  onDeleteFile,
  onOpenFile,
  uploading,
  uxGuidelinesSet,
  uxGuidelinesEnabled,
  onToggleEnabled,
  onSetGuidelines,
  onClearGuidelines,
  onDeleteGuideline,
}: UXGuidelinesCardProps) {
  const { showSuccess, showError } = useSnackbar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  // Show guidelines by default if they exist
  const [showGuidelines, setShowGuidelines] = useState(!!uxGuidelinesSet);
  // Modal state for viewing all guidelines
  const [modalOpen, setModalOpen] = useState(false);

  // Update showGuidelines when uxGuidelinesSet changes
  useEffect(() => {
    if (uxGuidelinesSet) {
      setShowGuidelines(true);
    }
  }, [uxGuidelinesSet]);

  // Get video files for extraction
  const videoFiles = files.filter(f => f.fileType === 'video');

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        onUpload(config.id, droppedFiles[0]);
      }
    },
    [config.id, onUpload]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      onUpload(config.id, selectedFiles[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Extract UX guidelines from the first video file
  const handleExtractGuidelines = async () => {
    const videoFile = videoFiles[0];
    if (!videoFile) {
      showError('Please upload a video file first');
      return;
    }

    try {
      setExtracting(true);
      setExtractionProgress({ stage: 'preparing', message: 'Preparing video...', percent: 0 });

      // Get the actual file from the data URL or fetch it
      let fileToAnalyze: File;

      if (videoFile.localDataUrl) {
        // Convert data URL back to File
        const response = await fetch(videoFile.localDataUrl);
        const blob = await response.blob();
        fileToAnalyze = new File([blob], videoFile.fileName, { type: videoFile.mimeType || 'video/mp4' });
      } else {
        // For Supabase files, we need to download first
        const downloadUrl = await getFileDownloadUrl(videoFile.filePath);
        const response = await fetch(downloadUrl);
        const blob = await response.blob();
        fileToAnalyze = new File([blob], videoFile.fileName, { type: videoFile.mimeType || 'video/mp4' });
      }

      // Extract guidelines using vision AI
      const result = await extractGuidelinesFromVideo(
        fileToAnalyze,
        (progress) => setExtractionProgress(progress),
        8, // number of frames to extract
        undefined, // provider (use default)
        undefined  // model (use default)
      );

      // Create and store guidelines set
      const guidelinesSet = createGuidelinesSet(
        videoFile.title || 'Product UX Guidelines',
        result,
        videoFile.id,
        videoFile.fileName
      );

      onSetGuidelines(guidelinesSet);
      setShowGuidelines(true);
      showSuccess(`Extracted ${result.guidelines.length} UX guidelines!`);
    } catch (error) {
      console.error('Failed to extract guidelines:', error);
      showError(error instanceof Error ? error.message : 'Failed to extract guidelines');
    } finally {
      setExtracting(false);
      setExtractionProgress(null);
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        minHeight: 320,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        border: isDragging ? `2px dashed ${config.color}` : '2px solid transparent',
        backgroundColor: isDragging ? `${config.color}08` : undefined,
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-4px)',
        },
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              backgroundColor: `${config.color}15`,
              color: config.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              '& svg': { fontSize: 24 },
            }}
          >
            {config.icon}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {config.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {config.description}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {uxGuidelinesSet && (
              <Tooltip title={uxGuidelinesEnabled ? 'Disable guidelines' : 'Enable guidelines'}>
                <Switch
                  checked={uxGuidelinesEnabled}
                  onChange={onToggleEnabled}
                  color="primary"
                  size="small"
                />
              </Tooltip>
            )}
            <Chip
              label={uxGuidelinesSet ? `${uxGuidelinesSet.guidelines.length} guidelines` : `${files.length} files`}
              size="small"
              onClick={uxGuidelinesSet ? () => setModalOpen(true) : undefined}
              sx={{
                backgroundColor: `${config.color}15`,
                color: config.color,
                fontWeight: 500,
                cursor: uxGuidelinesSet ? 'pointer' : 'default',
                '&:hover': uxGuidelinesSet ? { backgroundColor: `${config.color}25` } : {},
              }}
            />
          </Box>
        </Box>

        {uploading && <LinearProgress sx={{ mb: 2 }} />}

        {/* Extraction Progress */}
        {extracting && extractionProgress && (
          <Box sx={{ mb: 2, p: 2, borderRadius: 1, backgroundColor: 'rgba(0,0,0,0.03)' }}>
            <LinearProgress
              variant="determinate"
              value={extractionProgress.percent}
              sx={{ mb: 1, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary">
              {extractionProgress.message}
            </Typography>
          </Box>
        )}

        {/* Content Area */}
        <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
          {/* Show extracted guidelines if available */}
          {uxGuidelinesSet && showGuidelines ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {uxGuidelinesEnabled ? 'Active in prototyping' : 'Disabled'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setShowGuidelines(false)}
                    sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
                  >
                    Show Files
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="text"
                    onClick={onClearGuidelines}
                    sx={{ fontSize: '0.7rem', minWidth: 'auto', px: 1 }}
                  >
                    Clear
                  </Button>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {uxGuidelinesSet.guidelines.slice(0, 4).map((guideline: UXGuideline) => (
                  <Box
                    key={guideline.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1,
                      p: 1,
                      borderRadius: 1,
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
                    }}
                  >
                    <Chip
                      label={guidelineCategoryLabels[guideline.category]}
                      size="small"
                      sx={{
                        backgroundColor: `${guidelineCategoryColors[guideline.category]}15`,
                        color: guidelineCategoryColors[guideline.category],
                        fontWeight: 500,
                        fontSize: '0.65rem',
                        height: 18,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                        {guideline.title}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {guideline.description}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => onDeleteGuideline(guideline.id)}
                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 }, p: 0.25 }}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
                {uxGuidelinesSet.guidelines.length > 4 && (
                  <Typography
                    variant="caption"
                    color="primary"
                    sx={{
                      pl: 1,
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => setModalOpen(true)}
                  >
                    +{uxGuidelinesSet.guidelines.length - 4} more guidelines · View All
                  </Typography>
                )}
                {uxGuidelinesSet.guidelines.length <= 4 && uxGuidelinesSet.guidelines.length > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => setModalOpen(true)}
                    sx={{ fontSize: '0.7rem', mt: 0.5 }}
                  >
                    View All Guidelines
                  </Button>
                )}
              </Box>
            </Box>
          ) : files.length === 0 ? (
            <Box
              sx={{
                height: '100%',
                minHeight: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
              }}
            >
              <VideocamOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" align="center">
                Upload a product demo video
              </Typography>
              <Typography variant="caption" color="text.disabled" align="center" sx={{ mt: 0.5 }}>
                MP4, MOV, WebM supported
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {files.slice(0, 3).map((file) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  color={config.color}
                  onDelete={() => onDeleteFile(file)}
                  onOpen={() => onOpenFile(file)}
                />
              ))}
              {files.length > 3 && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
                  +{files.length - 3} more files
                </Typography>
              )}
              {uxGuidelinesSet && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowGuidelines(true)}
                  sx={{ alignSelf: 'flex-start', fontSize: '0.75rem' }}
                >
                  View {uxGuidelinesSet.guidelines.length} extracted guidelines
                </Button>
              )}
            </Box>
          )}
        </Box>

        {/* Action Buttons */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileSelect}
          accept=".mp4,.mov,.avi,.webm,.mkv,video/*"
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || extracting}
            sx={{
              flex: 1,
              borderColor: config.color,
              color: config.color,
              '&:hover': {
                borderColor: config.color,
                backgroundColor: `${config.color}10`,
              },
            }}
          >
            Upload Video
          </Button>
          {videoFiles.length > 0 && (
            <Button
              variant="contained"
              size="small"
              startIcon={<PlayArrowIcon />}
              onClick={handleExtractGuidelines}
              disabled={uploading || extracting}
              sx={{
                flex: 1,
                backgroundColor: config.color,
                '&:hover': {
                  backgroundColor: config.color,
                  filter: 'brightness(0.9)',
                },
              }}
            >
              {extracting ? 'Extracting...' : uxGuidelinesSet ? 'Re-extract' : 'Extract'}
            </Button>
          )}
        </Box>
      </CardContent>

      {/* Guidelines Modal */}
      {uxGuidelinesSet && (
        <UXGuidelinesModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          guidelinesSet={uxGuidelinesSet}
          onDeleteGuideline={onDeleteGuideline}
          onClearGuidelines={onClearGuidelines}
        />
      )}
    </Card>
  );
}

// UX Guidelines Full-Screen Modal
interface UXGuidelinesModalProps {
  open: boolean;
  onClose: () => void;
  guidelinesSet: UXGuidelinesSet;
  onDeleteGuideline: (id: string) => void;
  onClearGuidelines: () => void;
}

function UXGuidelinesModal({
  open,
  onClose,
  guidelinesSet,
  onDeleteGuideline,
  onClearGuidelines,
}: UXGuidelinesModalProps) {
  // Group guidelines by category
  const groupedGuidelines = guidelinesSet.guidelines.reduce((acc, guideline) => {
    if (!acc[guideline.category]) {
      acc[guideline.category] = [];
    }
    acc[guideline.category].push(guideline);
    return acc;
  }, {} as Record<UXGuidelineCategory, UXGuideline[]>);

  const categories = Object.keys(groupedGuidelines) as UXGuidelineCategory[];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh',
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              backgroundColor: '#4ade8015',
              color: '#4ade80',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AutoAwesomeIcon />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              UX Principles & Guidelines
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {guidelinesSet.guidelines.length} guidelines extracted from {guidelinesSet.sourceVideoName || 'product video'}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ p: 3 }}>
        {guidelinesSet.guidelines.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">No guidelines extracted yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {categories.map((category) => (
              <Box key={category}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Chip
                    label={guidelineCategoryLabels[category]}
                    size="small"
                    sx={{
                      backgroundColor: `${guidelineCategoryColors[category]}15`,
                      color: guidelineCategoryColors[category],
                      fontWeight: 600,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {groupedGuidelines[category].length} guideline{groupedGuidelines[category].length !== 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {groupedGuidelines[category].map((guideline) => (
                    <Box
                      key={guideline.id}
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        border: '1px solid',
                        borderColor: 'divider',
                        '&:hover': {
                          backgroundColor: 'rgba(0,0,0,0.04)',
                          borderColor: guidelineCategoryColors[category],
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {guideline.title}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => onDeleteGuideline(guideline.id)}
                          sx={{ opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' }, ml: 1 }}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: guideline.examples?.length ? 1.5 : 0 }}>
                        {guideline.description}
                      </Typography>
                      {guideline.examples && guideline.examples.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={500}>
                            Examples:
                          </Typography>
                          <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                            {guideline.examples.map((example, idx) => (
                              <Typography component="li" key={idx} variant="caption" color="text.secondary">
                                {example}
                              </Typography>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        <Button
          color="error"
          variant="text"
          onClick={() => {
            onClearGuidelines();
            onClose();
          }}
        >
          Clear All Guidelines
        </Button>
        <Button variant="contained" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Category labels for UX guidelines
const guidelineCategoryLabels: Record<UXGuidelineCategory, string> = {
  navigation: 'Navigation',
  interaction: 'Interaction',
  feedback: 'Feedback',
  layout: 'Layout',
  content: 'Content',
  accessibility: 'Accessibility',
  flow: 'User Flows',
};

const guidelineCategoryColors: Record<UXGuidelineCategory, string> = {
  navigation: '#1890ff',
  interaction: '#52c41a',
  feedback: '#faad14',
  layout: '#722ed1',
  content: '#13c2c2',
  accessibility: '#eb2f96',
  flow: '#f5222d',
};

export function Context() {
  const { showSuccess, showError } = useSnackbar();
  const [files, setFiles] = useState<Record<ContextCategoryType, ContextFile[]>>({
    goals: [],
    backlog: [],
    knowledge: [],
    kpis: [],
  });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<ContextCategoryType | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<ContextFile | null>(null);

  // UX Guidelines state
  const {
    uxGuidelinesSet,
    uxGuidelinesEnabled,
    setUXGuidelines,
    clearUXGuidelines,
    toggleUXGuidelinesEnabled,
    deleteUXGuideline,
  } = useContextStore();

  // Load files on mount
  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const allFiles = await getContextFiles();

      // Group files by category
      const grouped: Record<ContextCategoryType, ContextFile[]> = {
        goals: [],
        backlog: [],
        knowledge: [],
        kpis: [],
      };

      allFiles.forEach((file) => {
        if (grouped[file.category]) {
          grouped[file.category].push(file);
        }
      });

      setFiles(grouped);
    } catch (error) {
      console.error('Failed to load files:', error);
      showError('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (category: ContextCategoryType, file: File) => {
    try {
      setUploading(category);

      const uploadedFile = await uploadContextFile({
        category,
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for title
        file,
      });

      setFiles((prev) => ({
        ...prev,
        [category]: [uploadedFile, ...prev[category]],
      }));

      showSuccess('File uploaded successfully');
    } catch (error) {
      console.error('Upload failed:', error);
      showError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;

    try {
      await deleteContextFile(fileToDelete.id);

      setFiles((prev) => ({
        ...prev,
        [fileToDelete.category]: prev[fileToDelete.category].filter(
          (f) => f.id !== fileToDelete.id
        ),
      }));

      showSuccess('File deleted');
    } catch (error) {
      console.error('Delete failed:', error);
      showError(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeleteConfirmOpen(false);
      setFileToDelete(null);
    }
  };

  const handleOpenFile = async (file: ContextFile) => {
    try {
      const url = await getFileDownloadUrl(file.filePath);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Failed to get download URL:', error);
      showError('Failed to open file');
    }
  };

  const totalFiles = Object.values(files).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Product Context"
        subtitle={`${totalFiles} files across ${categoryConfigs.length} categories`}
      />

      {/* Info Alert */}
      <Alert severity="info" icon={<LightbulbIcon />} sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>How it works:</strong> Upload product context files to help AI generate better,
          more relevant prototypes. Drag and drop files into any category.
        </Typography>
      </Alert>

      {/* 2x2 Category Grid */}
      {loading ? (
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} md={6} key={i}>
              <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={3}>
          {categoryConfigs.map((config, index) => (
            <Grid
              item
              xs={12}
              md={6}
              key={config.id}
              sx={{
                animation: 'fadeInUp 0.4s ease forwards',
                animationDelay: `${index * 0.1}s`,
                opacity: 0,
                '@keyframes fadeInUp': {
                  from: { opacity: 0, transform: 'translateY(20px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
              }}
            >
              {config.id === 'kpis' ? (
                <UXGuidelinesCard
                  config={config}
                  files={files[config.id]}
                  onUpload={handleUpload}
                  onDeleteFile={(file) => {
                    setFileToDelete(file);
                    setDeleteConfirmOpen(true);
                  }}
                  onOpenFile={handleOpenFile}
                  uploading={uploading === config.id}
                  uxGuidelinesSet={uxGuidelinesSet}
                  uxGuidelinesEnabled={uxGuidelinesEnabled}
                  onToggleEnabled={toggleUXGuidelinesEnabled}
                  onSetGuidelines={setUXGuidelines}
                  onClearGuidelines={clearUXGuidelines}
                  onDeleteGuideline={deleteUXGuideline}
                />
              ) : (
                <CategoryCard
                  config={config}
                  files={files[config.id]}
                  onUpload={handleUpload}
                  onDeleteFile={(file) => {
                    setFileToDelete(file);
                    setDeleteConfirmOpen(true);
                  }}
                  onOpenFile={handleOpenFile}
                  uploading={uploading === config.id}
                />
              )}
            </Grid>
          ))}
        </Grid>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setFileToDelete(null);
        }}
        onConfirm={handleDeleteFile}
        title="Delete File"
        content={`Are you sure you want to delete "${fileToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
}
