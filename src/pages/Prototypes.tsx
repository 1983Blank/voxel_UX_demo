import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Fade from '@mui/material/Fade';
import Skeleton from '@mui/material/Skeleton';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Slide from '@mui/material/Slide';
import {
  Plus,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  ShareNetwork,
  Copy,
  Flask,
  GridFour,
  List,
} from '@phosphor-icons/react';
import {
  Button,
  TextField,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from '@/components/ui';
import { EmptyState, ThumbnailCard, PageHeader, BatchSelectionBar } from '@/components';
import { useSnackbar } from '@/components/SnackbarProvider';
import { useThemeStore } from '@/store/themeStore';
import { useScreensStore } from '@/store/screensStore';
import { useAuthStore } from '@/store/authStore';
import { supabase, isSupabaseConfigured } from '@/services/supabase';

interface Prototype {
  id: string;
  name: string;
  status: 'draft' | 'shared' | 'deployed' | 'pending' | 'analyzing' | 'planning' | 'plan_ready' | 'wireframing' | 'wireframe_ready' | 'generating' | 'complete' | 'failed';
  variants: number;
  views: number;
  createdAt: string;
  updatedAt: string;
  screenId?: string;
  prompt?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'shared':
    case 'plan_ready':
    case 'wireframe_ready':
      return 'primary';
    case 'deployed':
    case 'complete':
      return 'success';
    case 'failed':
      return 'error';
    case 'generating':
    case 'analyzing':
    case 'planning':
    case 'wireframing':
      return 'warning';
    default:
      return 'default';
  }
};

const getDisplayStatus = (status: string) => {
  switch (status) {
    case 'plan_ready':
      return 'Paradigms Ready';
    case 'wireframing':
      return 'Wireframing';
    case 'wireframe_ready':
      return 'Wireframes Ready';
    case 'generating':
      return 'Generating';
    case 'analyzing':
      return 'Analyzing';
    case 'planning':
      return 'Planning';
    case 'complete':
      return 'Complete';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
};

export function Prototypes() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { config, mode } = useThemeStore();
  const { screens, initializeScreens } = useScreensStore();
  const { supabaseUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedPrototype, setSelectedPrototype] = useState<Prototype | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newPrototypeName, setNewPrototypeName] = useState('');
  const [prototypes, setPrototypes] = useState<Prototype[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // New state for batch actions and list view
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Initialize screens and fetch prototypes on mount
  // Run sequentially to avoid concurrent auth.getUser() calls which cause AbortError
  useEffect(() => {
    const init = async () => {
      await initializeScreens();
      await fetchPrototypes();
    };
    init();
  }, []);

  // Fetch prototypes from Supabase
  const fetchPrototypes = async () => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured()) {
        console.warn('[Prototypes] Supabase not configured');
        setPrototypes([]);
        return;
      }

      // Use supabaseUser from authStore to avoid concurrent auth.getUser() calls
      // which cause AbortError due to Supabase's internal lock mechanism
      if (!supabaseUser) {
        console.warn('[Prototypes] No authenticated user');
        setPrototypes([]);
        return;
      }

      // Fetch vibe sessions with variant counts
      const { data: sessions, error } = await supabase
        .from('vibe_sessions')
        .select(`
          *,
          vibe_variants(count)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Prototypes] Error fetching sessions:', error);
        throw error;
      }

      // Map to Prototype format
      const mapped: Prototype[] = (sessions || []).map((session) => ({
        id: session.id,
        name: session.name || 'Untitled Prototype',
        status: session.status || 'draft',
        variants: session.vibe_variants?.[0]?.count || 0,
        views: 0, // TODO: Implement view tracking
        createdAt: session.created_at,
        updatedAt: session.updated_at || session.created_at,
        screenId: session.screen_id,
        prompt: session.prompt,
      }));

      setPrototypes(mapped);
    } catch (error) {
      console.error('[Prototypes] Failed to fetch:', error);
      showError('Failed to load prototypes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, prototype: Prototype) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedPrototype(prototype);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleCreatePrototype = () => {
    if (!newPrototypeName.trim()) return;

    // Navigate to screens page to select a screen for the prototype
    // Or create from a blank screen
    showSuccess('Select a screen to create a prototype');
    setCreateDialogOpen(false);
    setNewPrototypeName('');
    navigate('/repository/screens');
  };

  const handleDeletePrototype = async () => {
    if (!selectedPrototype) return;

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('vibe_sessions')
          .delete()
          .eq('id', selectedPrototype.id);

        if (error) throw error;
      }

      setPrototypes((prev) => prev.filter((p) => p.id !== selectedPrototype.id));
      showSuccess('Prototype deleted');
    } catch (error) {
      console.error('Delete error:', error);
      showError('Failed to delete prototype');
    } finally {
      setDeleteDialogOpen(false);
      setSelectedPrototype(null);
      setAnchorEl(null);
    }
  };

  const handleDuplicatePrototype = async () => {
    if (!selectedPrototype) return;

    try {
      if (isSupabaseConfigured()) {
        // Use supabaseUser from authStore to avoid concurrent auth.getUser() calls
        if (!supabaseUser) throw new Error('Not authenticated');

        const { data, error } = await supabase
          .from('vibe_sessions')
          .insert({
            user_id: supabaseUser.id,
            screen_id: selectedPrototype.screenId,
            name: `${selectedPrototype.name} (Copy)`,
            prompt: selectedPrototype.prompt,
            status: 'draft',
          })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          setPrototypes((prev) => [{
            id: data.id,
            name: data.name,
            status: data.status,
            variants: 0,
            views: 0,
            createdAt: data.created_at,
            updatedAt: data.created_at,
            screenId: data.screen_id,
            prompt: data.prompt,
          }, ...prev]);
        }
      }

      showSuccess('Prototype duplicated');
    } catch (error) {
      console.error('Duplicate error:', error);
      showError('Failed to duplicate prototype');
    } finally {
      handleMenuClose();
    }
  };

  // Batch actions
  const handleSelectAll = () => {
    if (selectedIds.length === filteredPrototypes.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPrototypes.map(p => p.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('vibe_sessions')
          .delete()
          .in('id', selectedIds);

        if (error) throw error;
      }

      setPrototypes(prev => prev.filter(p => !selectedIds.includes(p.id)));
      showSuccess(`Deleted ${selectedIds.length} prototype(s)`);
      setSelectedIds([]);
    } catch (error) {
      console.error('Batch delete error:', error);
      showError('Failed to delete prototypes');
    }
  };

  const filteredPrototypes = prototypes.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.prompt?.toLowerCase().includes(searchQuery.toLowerCase());
    if (tabValue === 0) return matchesSearch;
    if (tabValue === 1) return matchesSearch && (p.status === 'draft' || p.status === 'pending');
    if (tabValue === 2) return matchesSearch && p.status === 'complete';
    if (tabValue === 3) return matchesSearch && (p.status === 'generating' || p.status === 'analyzing' || p.status === 'planning' || p.status === 'wireframing');
    return matchesSearch;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get preview data for a prototype from its associated screen
  const getPrototypePreview = (prototype: Prototype) => {
    if (!prototype.screenId) return undefined;
    const screen = screens.find((s) => s.id === prototype.screenId);
    if (!screen) return undefined;

    if (screen.editedHtml) {
      return { type: 'html' as const, content: screen.editedHtml };
    }
    if (screen.filePath) {
      return { type: 'url' as const, content: screen.filePath };
    }
    return undefined;
  };

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Prototypes"
        actions={
          <>
            <TextField
              placeholder="Search prototypes..."
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
              startIcon={<Plus size={18} />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              New Prototype
            </Button>
          </>
        }
      />

      {/* Status Tabs */}
      <Box sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="All" />
          <Tab label="Drafts" />
          <Tab label="Complete" />
          <Tab label="In Progress" />
        </Tabs>
      </Box>

      {/* Loading State - Skeleton Cards */}
      {isLoading && (
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
              <Box>
                <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1, mb: 1 }} />
                <Skeleton variant="text" width="70%" height={24} />
                <Skeleton variant="text" width="50%" height={20} />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Skeleton variant="rounded" width={60} height={20} />
                  <Skeleton variant="rounded" width={80} height={20} />
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Grid or List View */}
      {!isLoading && filteredPrototypes.length === 0 ? (
        <EmptyState
          title="No prototypes found"
          description={
            searchQuery
              ? 'Try a different search term'
              : prototypes.length === 0
              ? 'Create your first prototype by selecting a screen from the Repository'
              : 'No prototypes match the current filter'
          }
          action={
            !searchQuery && prototypes.length === 0
              ? { label: 'Go to Screens', onClick: () => navigate('/repository/screens') }
              : undefined
          }
        />
      ) : !isLoading && viewMode === 'grid' ? (
        <Grid container spacing={2}>
          {filteredPrototypes.map((prototype, index) => (
            <Grid
              item
              xs={12}
              sm={6}
              md={4}
              lg={3}
              key={prototype.id}
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
                id={prototype.id}
                title={prototype.name}
                subtitle={`Updated ${formatDate(prototype.updatedAt)}`}
                secondaryInfo={prototype.variants > 0 ? `${prototype.variants} variants` : prototype.prompt?.slice(0, 50)}
                status={{
                  label: getDisplayStatus(prototype.status),
                  color: getStatusColor(prototype.status),
                }}
                preview={getPrototypePreview(prototype)}
                isSelected={selectedIds.includes(prototype.id)}
                onSelect={() => handleToggleSelect(prototype.id)}
                onClick={() => navigate(`/prototypes/${prototype.screenId}/${prototype.id}`)}
                onMenuClick={(e) => handleMenuOpen(e, prototype)}
                primaryAction={{
                  icon: <Flask size={24} color="white" weight="fill" />,
                  label: 'Open Prototype',
                  onClick: () => navigate(`/prototypes/${prototype.screenId}/${prototype.id}`),
                }}
              />
            </Grid>
          ))}
        </Grid>
      ) : !isLoading && (
        /* List View - Table-like layout */
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
            <Box sx={{ width: 42, flexShrink: 0 }} />
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
            <Box sx={{ width: 100, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Status
              </Typography>
            </Box>
            <Box sx={{ width: 80, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Variants
              </Typography>
            </Box>
            <Box sx={{ width: 120, flexShrink: 0 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Last Modified
              </Typography>
            </Box>
            <Box sx={{ width: 40, flexShrink: 0 }} />
          </Box>
          {/* Data rows */}
          {filteredPrototypes.map((prototype, index) => (
            <Box
              key={prototype.id}
              onClick={() => navigate(`/prototypes/${prototype.screenId}/${prototype.id}`)}
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
                checked={selectedIds.includes(prototype.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(prototype.id);
                }}
                className="hover-checkbox"
                sx={{
                  p: 0.5,
                  opacity: selectedIds.includes(prototype.id) ? 1 : 0,
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
                {(() => {
                  const preview = getPrototypePreview(prototype);
                  if (preview?.type === 'html' && preview.content) {
                    return (
                      <iframe
                        srcDoc={preview.content}
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
                        title={prototype.name}
                      />
                    );
                  }
                  if (preview?.type === 'url' && preview.content) {
                    return (
                      <iframe
                        src={preview.content}
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
                        title={prototype.name}
                      />
                    );
                  }
                  return <Flask size={20} color={config.colors.textSecondary} />;
                })()}
              </Box>
              {/* Name */}
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
                  {prototype.name}
                </Typography>
                {prototype.prompt && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}
                  >
                    {prototype.prompt.slice(0, 60)}{prototype.prompt.length > 60 ? '...' : ''}
                  </Typography>
                )}
              </Box>
              {/* Status */}
              <Box sx={{ width: 100, flexShrink: 0 }}>
                <Chip
                  label={getDisplayStatus(prototype.status)}
                  color={getStatusColor(prototype.status) as 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'}
                  size="small"
                  sx={{ fontSize: '0.7rem' }}
                />
              </Box>
              {/* Variants */}
              <Box sx={{ width: 80, flexShrink: 0, display: { xs: 'none', md: 'block' } }}>
                <Typography variant="body2" color="text.secondary">
                  {prototype.variants || 0}
                </Typography>
              </Box>
              {/* Last Modified */}
              <Box sx={{ width: 120, flexShrink: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {formatDate(prototype.updatedAt)}
                </Typography>
              </Box>
              {/* Actions */}
              <Box sx={{ width: 40, flexShrink: 0 }}>
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, prototype)}
                  className="action-button"
                  sx={{ opacity: 0.5, transition: 'opacity 0.2s ease' }}
                >
                  <PencilSimple size={16} />
                </IconButton>
              </Box>
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
            navigate(`/prototypes/${selectedPrototype?.screenId}/${selectedPrototype?.id}`);
          }}
          sx={{ transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><PencilSimple size={18} color={config.colors.primary} /></ListItemIcon>
          Edit
        </MenuItem>
        <MenuItem onClick={handleDuplicatePrototype} sx={{ transition: 'all 0.15s ease' }}>
          <ListItemIcon><Copy size={18} color={config.colors.textSecondary} /></ListItemIcon>
          Duplicate
        </MenuItem>
        <MenuItem onClick={handleMenuClose} sx={{ transition: 'all 0.15s ease' }}>
          <ListItemIcon><ShareNetwork size={18} color={config.colors.textSecondary} /></ListItemIcon>
          Share
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleteDialogOpen(true);
          }}
          sx={{ color: config.colors.error, transition: 'all 0.15s ease' }}
        >
          <ListItemIcon><Trash size={18} color={config.colors.error} /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
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
          Create New Prototype
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            To create a new prototype, first select a captured screen from your Repository.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Prototype Name"
            value={newPrototypeName}
            onChange={(e) => setNewPrototypeName(e.target.value)}
            placeholder="My New Prototype"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreatePrototype}
            sx={{
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              },
            }}
          >
            Select Screen
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle>Delete Prototype?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{selectedPrototype?.name}"? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeletePrototype}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Bar */}
      <Slide direction="up" in={selectedIds.length > 0} mountOnEnter unmountOnExit>
        <Box sx={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1200 }}>
          <BatchSelectionBar
            selectedCount={selectedIds.length}
            totalCount={filteredPrototypes.length}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            actions={[
              {
                label: 'Delete',
                icon: <Trash size={18} />,
                onClick: handleBatchDelete,
                color: 'error',
              },
            ]}
          />
        </Box>
      </Slide>
    </Box>
  );
}
