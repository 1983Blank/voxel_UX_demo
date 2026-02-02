import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Checkbox from '@mui/material/Checkbox';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Fade from '@mui/material/Fade';
import {
  MagnifyingGlass,
  UploadSimple,
  GridFour,
  List,
  Trash,
  Copy,
  Sparkle,
  PencilSimple,
  DotsThreeVertical,
} from '@phosphor-icons/react';
import {
  Button,
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@/components/ui';
import { EmptyState, ThumbnailCard, BatchSelectionBar } from '@/components';
import { PageHeader } from '@/components/PageHeader';
import { FileUpload } from '@/components/FileUpload';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSnackbar } from '@/components/SnackbarProvider';
import { useScreensStore } from '@/store/screensStore';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import type { CapturedScreen } from '@/types';

export function Screens() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { config, mode } = useThemeStore();
  const { showSuccess, showError, showWarning } = useSnackbar();
  const {
    screens,
    removeScreen,
    removeScreens,
    duplicateScreen,
    uploadScreen,
    updateScreen,
    initializeScreens,
    fetchFromSupabase,
    isLoading,
    selectedIds,
    toggleSelectScreen,
    selectAllScreens,
    clearSelection,
  } = useScreensStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [tags, setTags] = useState('');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuScreen, setMenuScreen] = useState<CapturedScreen | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [screenToDelete, setScreenToDelete] = useState<CapturedScreen | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [screenToRename, setScreenToRename] = useState<CapturedScreen | null>(null);
  const [newScreenName, setNewScreenName] = useState('');

  useEffect(() => {
    initializeScreens();
  }, [initializeScreens]);

  useEffect(() => {
    if (user?.id) {
      fetchFromSupabase();
    }
  }, [user?.id, fetchFromSupabase]);

  const filteredScreens = screens.filter(
    (screen) =>
      screen.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      screen.tags?.some((tag) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, screen: CapturedScreen) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuScreen(screen);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuScreen(null);
  };

  const handleDeleteClick = (screen: CapturedScreen) => {
    setScreenToDelete(screen);
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  const handleDeleteConfirm = async () => {
    if (screenToDelete) {
      await removeScreen(screenToDelete.id);
      showSuccess('Screen deleted');
    }
    setDeleteConfirmOpen(false);
    setScreenToDelete(null);
  };

  const handleRenameClick = (screen: CapturedScreen) => {
    setScreenToRename(screen);
    setNewScreenName(screen.name);
    setRenameDialogOpen(true);
    handleMenuClose();
  };

  const handleRenameConfirm = async () => {
    if (screenToRename && newScreenName.trim()) {
      try {
        await updateScreen(screenToRename.id, { name: newScreenName.trim() });
        showSuccess('Screen renamed');
      } catch (error) {
        console.error('Rename failed:', error);
        showError('Failed to rename screen');
      }
    }
    setRenameDialogOpen(false);
    setScreenToRename(null);
    setNewScreenName('');
  };

  const handleFilesSelected = (files: FileList) => {
    const htmlFiles = Array.from(files).filter((f) => f.name.match(/\.html?$/i));
    if (htmlFiles.length !== files.length) {
      showWarning('Only HTML files are accepted');
    }
    setUploadingFiles((prev) => [...prev, ...htmlFiles]);
  };

  const handleUpload = async () => {
    if (uploadingFiles.length === 0) {
      showWarning('Please select at least one HTML file');
      return;
    }

    setIsUploading(true);
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);

    try {
      for (const file of uploadingFiles) {
        await uploadScreen(file, undefined, tagList);
      }
      showSuccess(`Successfully uploaded ${uploadingFiles.length} screen(s)`);
      setIsUploadModalOpen(false);
      setUploadingFiles([]);
      setTags('');
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showError(`Upload failed: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    await removeScreens(selectedIds);
    showSuccess(`Deleted ${count} screen(s)`);
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredScreens.length) {
      clearSelection();
    } else {
      selectAllScreens();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Skeleton loading component
  const SkeletonCard = () => (
    <Box sx={{ height: '100%' }}>
      <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1, mb: 1 }} />
      <Skeleton variant="text" width="70%" height={24} />
      <Skeleton variant="text" width="50%" height={20} />
      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
        <Skeleton variant="rounded" width={60} height={20} />
        <Skeleton variant="rounded" width={80} height={20} />
      </Box>
    </Box>
  );

  if (isLoading) {
    return (
      <Box>
        {/* Header skeleton */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Skeleton variant="text" width={200} height={40} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant="rounded" width={250} height={36} />
            <Skeleton variant="rounded" width={100} height={36} />
          </Box>
        </Box>
        {/* Grid skeleton */}
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
              <SkeletonCard />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Captured Screens"
        actions={
          <>
            <TextField
              placeholder="Search screens..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{
                width: 250,
                '& .MuiOutlinedInput-root': {
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  },
                  '&.Mui-focused': {
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                  },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MagnifyingGlass size={18} color={config.colors.textSecondary} />
                  </InputAdornment>
                ),
              }}
            />
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  transition: 'all 0.2s ease',
                },
              }}
            >
              <ToggleButton value="grid">
                <GridFour size={18} />
              </ToggleButton>
              <ToggleButton value="list">
                <List size={18} />
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="contained"
              startIcon={<UploadSimple size={18} />}
              onClick={() => setIsUploadModalOpen(true)}
              sx={{
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              Import Screen
            </Button>
          </>
        }
      />

      {/* Grid or List View */}
      {filteredScreens.length === 0 ? (
        <EmptyState
          title={searchQuery ? 'No screens match your search' : 'No captured screens yet'}
          description={searchQuery ? 'Try a different search term' : 'Import HTML screens to get started'}
          action={
            !searchQuery
              ? { label: 'Import Your First Screen', onClick: () => setIsUploadModalOpen(true) }
              : undefined
          }
        />
      ) : viewMode === 'grid' ? (
        <Grid container spacing={2}>
          {filteredScreens.map((screen, index) => (
            <Grid
              item
              xs={12}
              sm={6}
              md={4}
              lg={3}
              key={screen.id}
              sx={{
                animation: 'fadeInUp 0.4s ease forwards',
                animationDelay: `${index * 0.05}s`,
                opacity: 0,
                '@keyframes fadeInUp': {
                  from: {
                    opacity: 0,
                    transform: 'translateY(20px)',
                  },
                  to: {
                    opacity: 1,
                    transform: 'translateY(0)',
                  },
                },
              }}
            >
              <ThumbnailCard
                id={screen.id}
                title={screen.name}
                subtitle={formatDate(screen.capturedAt)}
                tags={screen.tags}
                preview={{
                  type: screen.editedHtml ? 'html' : screen.filePath ? 'url' : 'placeholder',
                  content: screen.editedHtml || screen.filePath,
                }}
                isSelected={selectedIds.includes(screen.id)}
                onSelect={() => toggleSelectScreen(screen.id)}
                onClick={() => navigate(`/prototypes/${screen.id}`)}
                onMenuClick={(e) => handleMenuOpen(e, screen)}
                primaryAction={{
                  icon: <Sparkle size={24} color="white" weight="fill" />,
                  label: 'Open in Editor',
                  onClick: () => navigate(`/prototypes/${screen.id}`),
                }}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        /* List View - Table-like layout with columns */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Header row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 1.5,
              py: 1,
              borderBottom: `1px solid ${config.colors.border}`,
              bgcolor: config.colors.bgSecondary,
              borderRadius: '8px 8px 0 0',
            }}
          >
            <Box sx={{ width: 42 }} />
            <Box sx={{ width: 80, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Preview
              </Typography>
            </Box>
            <Box sx={{ flex: 2, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Name
              </Typography>
            </Box>
            <Box sx={{ width: 120, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Last Modified
              </Typography>
            </Box>
            <Box sx={{ width: 100, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Tags
              </Typography>
            </Box>
            <Box sx={{ width: 40, flexShrink: 0 }} />
          </Box>
          {/* Data rows */}
          {filteredScreens.map((screen, index) => (
            <Box
              key={screen.id}
              onClick={() => navigate(`/prototypes/${screen.id}`)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 1.5,
                py: 1,
                borderBottom: `1px solid ${config.colors.border}`,
                backgroundColor: config.colors.surface,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                animation: 'fadeInUp 0.3s ease forwards',
                animationDelay: `${index * 0.02}s`,
                opacity: 0,
                '@keyframes fadeInUp': {
                  from: { opacity: 0, transform: 'translateY(5px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': {
                  backgroundColor: 'rgba(118, 75, 162, 0.04)',
                  '& .action-button': {
                    opacity: 1,
                  },
                  '& .hover-checkbox': {
                    opacity: 1,
                  },
                },
                '&:last-child': {
                  borderRadius: '0 0 8px 8px',
                },
              }}
            >
              <Checkbox
                className="hover-checkbox"
                checked={selectedIds.includes(screen.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelectScreen(screen.id);
                }}
                sx={{
                  p: 0.5,
                  opacity: selectedIds.includes(screen.id) ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              />
              {/* Thumbnail */}
              <Box
                sx={{
                  width: 80,
                  height: 50,
                  borderRadius: 1,
                  backgroundColor: config.colors.bgSecondary,
                  flexShrink: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {screen.editedHtml || screen.filePath ? (
                  <iframe
                    srcDoc={screen.editedHtml || undefined}
                    src={!screen.editedHtml && screen.filePath ? screen.filePath : undefined}
                    style={{
                      width: '400%',
                      height: '400%',
                      transform: 'scale(0.25)',
                      transformOrigin: 'top left',
                      border: 'none',
                      pointerEvents: 'none',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                    title={screen.name}
                  />
                ) : (
                  <Sparkle size={20} color={config.colors.textSecondary} />
                )}
              </Box>
              {/* Name & Captured date */}
              <Box sx={{ flex: 2, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  sx={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {screen.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Captured {formatDate(screen.capturedAt)}
                </Typography>
              </Box>
              {/* Last Modified */}
              <Box sx={{ width: 120, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {screen.updatedAt ? formatDate(screen.updatedAt) : formatDate(screen.capturedAt)}
                </Typography>
              </Box>
              {/* Tags */}
              <Box sx={{ width: 100, flexShrink: 0, display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
                {screen.tags?.slice(0, 1).map((tag) => (
                  <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                ))}
                {(screen.tags?.length || 0) > 1 && (
                  <Chip label={`+${screen.tags!.length - 1}`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                )}
              </Box>
              {/* Actions - visible on hover */}
              <IconButton
                className="action-button"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMenuOpen(e, screen);
                }}
                sx={{
                  flexShrink: 0,
                  opacity: 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <DotsThreeVertical size={18} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        TransitionComponent={Fade}
        sx={{
          '& .MuiPaper-root': {
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            borderRadius: 2,
          },
        }}
      >
        <MenuItem
          onClick={() => {
            handleMenuClose();
            menuScreen && navigate(`/prototypes/${menuScreen.id}`);
          }}
          sx={{ transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><Sparkle size={18} color={config.colors.primary} /></ListItemIcon>
          Open in Vibe Editor
        </MenuItem>
        <MenuItem
          onClick={() => menuScreen && handleRenameClick(menuScreen)}
          sx={{ transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><PencilSimple size={18} color={config.colors.textSecondary} /></ListItemIcon>
          Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleMenuClose();
            menuScreen && duplicateScreen(menuScreen.id);
          }}
          sx={{ transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><Copy size={18} color={config.colors.textSecondary} /></ListItemIcon>
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => menuScreen && handleDeleteClick(menuScreen)}
          sx={{ color: 'error.main', transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><Trash size={18} color={config.colors.error} /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Upload Modal */}
      <Dialog
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle sx={{ fontFamily: config.fonts.display, fontWeight: mode === 'craftsman' ? 400 : 600 }}>
          Import HTML Screens
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <FileUpload
              accept=".html,.htm"
              multiple
              onFilesSelected={handleFilesSelected}
              title="Click or drag HTML files here"
              description="Upload captured screens from SingleFile or any HTML files"
            />

            {uploadingFiles.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Selected files ({uploadingFiles.length}):
                </Typography>
                {uploadingFiles.map((file, index) => (
                  <Chip
                    key={index}
                    label={file.name}
                    onDelete={() => setUploadingFiles((prev) => prev.filter((_, i) => i !== index))}
                    sx={{
                      m: 0.5,
                      transition: 'all 0.2s ease',
                      '&:hover': { transform: 'scale(1.02)' },
                    }}
                  />
                ))}
              </Box>
            )}

            <TextField
              fullWidth
              label="Tags (optional)"
              placeholder="e.g., landing, dashboard, mobile"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              helperText="Comma-separated tags for organization"
              sx={{ mt: 3 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsUploadModalOpen(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploadingFiles.length === 0 || isUploading}
          >
            {isUploading ? <CircularProgress size={20} /> : `Upload (${uploadingFiles.length})`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Screen"
        content={`Are you sure you want to delete "${screenToDelete?.name}"?`}
        confirmText="Delete"
        confirmColor="error"
      />

      {/* Rename Dialog */}
      <Dialog
        open={renameDialogOpen}
        onClose={() => setRenameDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        sx={{
          '& .MuiDialog-paper': {
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle sx={{ fontFamily: config.fonts.display, fontWeight: mode === 'craftsman' ? 400 : 600 }}>
          Rename Screen
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Screen Name"
            value={newScreenName}
            onChange={(e) => setNewScreenName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newScreenName.trim()) {
                handleRenameConfirm();
              }
            }}
            sx={{
              mt: 2,
              '& .MuiOutlinedInput-root': {
                fontFamily: config.fonts.body,
              },
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRenameConfirm}
            disabled={!newScreenName.trim()}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Batch Selection Bar */}
      <BatchSelectionBar
        selectedCount={selectedIds.length}
        totalCount={filteredScreens.length}
        onSelectAll={handleSelectAll}
        onClearSelection={clearSelection}
        actions={[
          {
            label: 'Delete',
            icon: <Trash size={18} weight="fill" />,
            color: 'error',
            onClick: handleBatchDelete,
          },
        ]}
      />
    </Box>
  );
}
