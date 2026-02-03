import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import CircularProgress from '@mui/material/CircularProgress';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import {
  Eye,
  Trophy,
  ChatCircle,
  CheckCircle,
  ArrowsClockwise,
  Users,
  UsersFour,
  Clock,
  EnvelopeSimple,
} from '@phosphor-icons/react';
import { Card, CardContent, Button, Chip } from '@/components/ui';
import { useThemeStore } from '@/store/themeStore';
import { PageHeader, StatCard } from '@/components';
import {
  UserFlowDiagram,
  CommentItem,
  FeedbackSummary,
  type FlowStage,
  type FeedbackSummaryData,
} from '@/components/Insights';
import {
  getProjectInsights,
  getVariantInsights,
  getVariantDetailInsight,
  getSessionInsight,
  generateAISummary,
  type ProjectInsight,
  type VariantInsight,
  type VariantDetailInsight,
  type Viewer,
  type FeedbackComment,
} from '@/services/feedbackInsightsService';

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// All Projects View
function AllProjectsView() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      setLoading(true);
      try {
        const data = await getProjectInsights();
        setProjects(data);
      } catch (err) {
        console.error('Error loading projects:', err);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, []);

  // Stats
  const activeProjects = projects.filter((p) => p.status === 'shared').length;
  const totalProjects = projects.length;
  const avgVariantsPerProject =
    projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + p.variants, 0) / projects.length)
      : 0;
  const totalParticipants = projects.reduce((sum, p) => sum + p.participants, 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader title="Insights" />

      {/* Stats Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={4}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Number of projects
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {activeProjects}/{totalProjects}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              (active/total)
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Avg. variants per project
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {avgVariantsPerProject}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Engaged participants
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {totalParticipants}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Projects Table */}
      <TableContainer component={Card} sx={{ border: 'none' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Project name</TableCell>
              <TableCell>Creator</TableCell>
              <TableCell align="center">Variants</TableCell>
              <TableCell align="center">Participants</TableCell>
              <TableCell align="center">Comments</TableCell>
              <TableCell align="right">Total time spent</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => (
              <TableRow
                key={project.id}
                hover
                onClick={() => navigate(`/insights/${project.sessionId}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {project.name}
                    {project.status === 'shared' && (
                      <Chip size="small" label="Active" color="success" sx={{ height: 20, fontSize: 10 }} />
                    )}
                  </Box>
                </TableCell>
                <TableCell>{project.creatorEmail}</TableCell>
                <TableCell align="center">{project.variants}</TableCell>
                <TableCell align="center">{project.participants}</TableCell>
                <TableCell align="center">{project.comments}</TableCell>
                <TableCell align="right">{project.totalTimeSpent}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {projects.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <ChatCircle size={48} color="#ccc" />
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            No shared projects yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share a prototype to start collecting feedback
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// Project View
function ProjectView({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { config } = useThemeStore();
  const [variants, setVariants] = useState<VariantInsight[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('Project');
  const [totalTimeSpent, setTotalTimeSpent] = useState('0m');
  const [totalViews, setTotalViews] = useState(0);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Load variants and session insights in parallel
        const [variantsData, sessionData] = await Promise.all([
          getVariantInsights(projectId),
          getSessionInsight(projectId),
        ]);

        setVariants(variantsData);

        if (sessionData) {
          setProjectName(sessionData.project.name);
          setViewers(sessionData.viewers);
          setTotalTimeSpent(sessionData.project.totalTimeSpent);
          setTotalViews(sessionData.project.totalViews);
        }
      } catch (err) {
        console.error('Error loading project data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId]);

  // Stats
  const totalVariants = variants.length;
  const totalParticipants = viewers.length > 0 ? viewers.length : variants.reduce((sum, v) => sum + v.participants, 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Breadcrumb navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Typography
          variant="h5"
          fontWeight={500}
          sx={{
            cursor: 'pointer',
            '&:hover': { color: config.colors.primary },
            transition: 'color 0.2s ease',
          }}
          onClick={() => navigate('/insights')}
        >
          Insights
        </Typography>
        <Typography variant="h5" fontWeight={500} color="text.secondary">
          {'>'}
        </Typography>
        <Typography variant="h5" fontWeight={500}>
          {projectName}
        </Typography>
      </Box>

      {/* Stats Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={3}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total variants
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {totalVariants}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total views
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {totalViews}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Unique participants
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {totalParticipants}
            </Typography>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card
            variant="outlined"
            sx={{
              p: 2,
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minHeight: 100,
            }}
          >
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Total time spent
            </Typography>
            <Typography variant="h5" fontWeight={500}>
              {totalTimeSpent}
            </Typography>
          </Card>
        </Grid>
      </Grid>

      {/* Variants Table */}
      <TableContainer component={Card} sx={{ border: 'none' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: config.colors.bgSecondary }}>
              <TableCell sx={{ fontWeight: 600 }}>Variant</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                Sessions
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                Participants
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">
                Comments
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Time spent
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {variants.map((variant) => (
              <TableRow
                key={variant.variantIndex}
                hover
                onClick={() => navigate(`/insights/${projectId}/${variant.variantIndex}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {variant.title || variant.label}
                    {variant.isTopPerformer && <Trophy size={16} weight="fill" color="#ffc107" />}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
                    {variant.description || '-'}
                  </Typography>
                </TableCell>
                <TableCell align="center">{variant.sessions}</TableCell>
                <TableCell align="center">{variant.participants}</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    {variant.comments}
                    {variant.resolvedComments > 0 && (
                      <Tooltip title={`${variant.resolvedComments} resolved`}>
                        <CheckCircle size={14} color="#2e7d32" weight="fill" />
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
                <TableCell align="right">{variant.totalTimeSpent}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {variants.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Eye size={48} color="#ccc" />
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            No variants found
          </Typography>
        </Box>
      )}

      {/* Viewers Section */}
      {viewers.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Users size={20} />
            <Typography variant="subtitle1" fontWeight={600}>
              Participants
            </Typography>
            <Chip size="small" label={viewers.length} />
          </Box>
          <Card variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: config.colors.bgSecondary }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Views</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Time spent</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Last seen</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {viewers.map((viewer, idx) => (
                  <TableRow key={viewer.email || idx}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: 'primary.main' }}>
                          {getInitials(viewer.name || 'A')}
                        </Avatar>
                        <Typography variant="body2">{viewer.name || 'Anonymous'}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <EnvelopeSimple size={14} />
                        <Typography variant="body2" color="text.secondary">
                          {viewer.email || '-'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="center">{viewer.viewCount || 1}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Clock size={14} />
                        <Typography variant="body2">
                          {formatTime(viewer.totalDuration || 0)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {viewer.lastSeen ? formatRelativeTime(viewer.lastSeen) : '-'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Box>
      )}
    </Box>
  );
}

// Variant View
function VariantView({ projectId, variantId }: { projectId: string; variantId: string }) {
  const navigate = useNavigate();
  const { config } = useThemeStore();
  const [detail, setDetail] = useState<VariantDetailInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('Project');
  const [aiSummary, setAiSummary] = useState<FeedbackSummaryData | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  const variantIndex = parseInt(variantId, 10);

  useEffect(() => {
    async function loadDetail() {
      setLoading(true);
      try {
        // Load variant detail and session info in parallel
        const [variantData, sessionData] = await Promise.all([
          getVariantDetailInsight(projectId, variantIndex),
          getSessionInsight(projectId),
        ]);

        setDetail(variantData);

        if (sessionData) {
          setProjectName(sessionData.project.name);
        }
      } catch (err) {
        console.error('Error loading variant detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [projectId, variantIndex]);

  // Generate AI summary
  const handleGenerateAISummary = useCallback(async () => {
    if (!detail || detail.comments.length === 0) return;

    setAiSummaryLoading(true);
    try {
      const summary = await generateAISummary(
        projectId,
        variantIndex,
        detail.comments,
        detail.title,
        detail.description
      );
      if (summary) {
        setAiSummary(summary);
      }
    } catch (err) {
      console.error('Error generating AI summary:', err);
    } finally {
      setAiSummaryLoading(false);
    }
  }, [detail, projectId, variantIndex]);

  // Handle generate variant from comment
  const handleGenerateFromComment = useCallback(
    (comment: FeedbackComment) => {
      navigate(`/prototypes/${projectId}/${projectId}`, {
        state: {
          iterationPrompt: `Based on feedback: "${comment.content}"`,
          sourceVariantIndex: variantIndex,
        },
      });
    },
    [navigate, projectId, variantIndex]
  );

  // Handle create iteration from AI summary
  const handleCreateIteration = useCallback(() => {
    if (!aiSummary) return;

    const prompt =
      aiSummary.actionItems.length > 0
        ? `Improve based on feedback:\n${aiSummary.actionItems.join('\n')}`
        : aiSummary.summary;

    navigate(`/prototypes/${projectId}/${projectId}`, {
      state: {
        iterationPrompt: prompt,
        sourceVariantIndex: variantIndex,
      },
    });
  }, [aiSummary, navigate, projectId, variantIndex]);

  // Build flow stages for UserFlowDiagram
  const flowStages: FlowStage[] = detail
    ? [
        {
          label: 'Viewed',
          count: detail.participantsFunnel[0]?.count || 0,
          percent: 100,
          icon: <Eye size={20} />,
        },
        {
          label: 'Engaged',
          count: detail.participantsFunnel[1]?.count || 0,
          percent: detail.participantsFunnel[1]?.percent || 0,
          icon: <Clock size={20} />,
        },
        {
          label: 'Commented',
          count: detail.participantsFunnel[2]?.count || 0,
          percent: detail.participantsFunnel[2]?.percent || 0,
          icon: <ChatCircle size={20} />,
        },
        {
          label: 'Resolved',
          count: detail.participantsFunnel[3]?.count || 0,
          percent: detail.participantsFunnel[3]?.percent || 0,
          icon: <CheckCircle size={20} />,
        },
      ]
    : [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!detail) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">Variant not found</Typography>
        <Button onClick={() => navigate(`/insights/${projectId}`)} sx={{ mt: 2 }}>
          Back to project
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      {/* Breadcrumb navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexShrink: 0 }}>
        <Typography
          variant="h5"
          fontWeight={500}
          sx={{
            cursor: 'pointer',
            '&:hover': { color: config.colors.primary },
            transition: 'color 0.2s ease',
          }}
          onClick={() => navigate('/insights')}
        >
          Insights
        </Typography>
        <Typography variant="h5" fontWeight={500} color="text.secondary">
          {'>'}
        </Typography>
        <Typography
          variant="h5"
          fontWeight={500}
          sx={{
            cursor: 'pointer',
            '&:hover': { color: config.colors.primary },
            transition: 'color 0.2s ease',
          }}
          onClick={() => navigate(`/insights/${projectId}`)}
        >
          {projectName}
        </Typography>
        <Typography variant="h5" fontWeight={500} color="text.secondary">
          {'>'}
        </Typography>
        <Typography variant="h5" fontWeight={500}>
          {detail.title || detail.label}
        </Typography>
        {detail.isTopPerformer && <Trophy size={20} weight="fill" color="#ffc107" />}
      </Box>

      {/* Top Section: Stats (2x2) + Thumbnail */}
      <Grid container spacing={3} sx={{ mb: 3, flexShrink: 0 }}>
        {/* Stats 2x2 Grid */}
        <Grid item xs={12} md={8}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <StatCard
                title="Total sessions"
                value={detail.sessions}
                icon={<Users size={20} />}
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Unique participants"
                value={detail.participants}
                icon={<UsersFour size={20} />}
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Time per session"
                value={formatTime(detail.avgTimeSpent)}
                icon={<Clock size={20} />}
              />
            </Grid>
            <Grid item xs={6}>
              <StatCard
                title="Feedback shared"
                value={detail.comments.length}
                icon={<ChatCircle size={20} />}
              />
            </Grid>
          </Grid>
        </Grid>

        {/* Variant Thumbnail / Actions */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', minHeight: 180, overflow: 'hidden' }}>
            {detail.screenshotUrl ? (
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 100,
                    backgroundColor: config.colors.bgSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={detail.screenshotUrl}
                    alt={detail.label}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
                <Box sx={{ p: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ textAlign: 'center', mb: 1.5, color: config.colors.textSecondary }}
                  >
                    {detail.label}
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    fullWidth
                    startIcon={<ArrowsClockwise size={16} />}
                    onClick={aiSummary ? handleCreateIteration : () => navigate(`/vibe/${projectId}`)}
                    disabled={aiSummaryLoading}
                  >
                    {aiSummary ? 'Create iteration from feedback' : 'Create iteration'}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: config.colors.bgSecondary,
                  p: 2,
                }}
              >
                <Eye size={32} color={config.colors.textSecondary} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                  {detail.label}
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<ArrowsClockwise size={16} />}
                  onClick={aiSummary ? handleCreateIteration : () => navigate(`/vibe/${projectId}`)}
                  disabled={aiSummaryLoading}
                >
                  {aiSummary ? 'Create iteration from feedback' : 'Create iteration'}
                </Button>
              </Box>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Main content: Left (AI Summary + User Flow) + Right (Feedback Shared) */}
      <Grid container spacing={3} sx={{ flex: 1, minHeight: 0 }}>
        {/* Left Column */}
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* AI Feedback Summary */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Feedback summary
              </Typography>
            </Box>
            <FeedbackSummary
              data={aiSummary}
              isLoading={aiSummaryLoading}
              onRegenerate={handleGenerateAISummary}
              commentCount={detail.comments.length}
            />
          </Box>

          {/* User Flow Diagram */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                User journey
              </Typography>
            </Box>
            <Card>
              <CardContent sx={{ p: 2 }}>
                <UserFlowDiagram stages={flowStages} />
              </CardContent>
            </Card>
          </Box>
        </Grid>

        {/* Right Column: Feedback Shared */}
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
          <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 2, overflow: 'hidden' }}>
            {/* Header */}
            <Box
              sx={{
                p: 2,
                borderBottom: 1,
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="subtitle2" fontWeight={600}>
                Feedback
              </Typography>
              <Chip
                size="small"
                label={detail.comments.length}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            </Box>

            {/* Comments list */}
            <Box sx={{ flex: 1, overflow: 'auto', maxHeight: 400 }}>
              {detail.comments.length === 0 ? (
                <Box
                  sx={{
                    height: '100%',
                    minHeight: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ChatCircle size={48} color={config.colors.textSecondary} />
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    No feedback yet
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {detail.comments.map((comment, index) => (
                    <Box
                      key={comment.id}
                      sx={{
                        borderBottom: index < detail.comments.length - 1 ? 1 : 0,
                        borderColor: 'divider',
                      }}
                    >
                      <CommentItem
                        comment={comment}
                        onGenerateVariant={() => handleGenerateFromComment(comment)}
                        showGenerateButton={true}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export function Insights() {
  const { projectId, variantId } = useParams();

  if (variantId && projectId) {
    return <VariantView projectId={projectId} variantId={variantId} />;
  }

  if (projectId) {
    return <ProjectView projectId={projectId} />;
  }

  return <AllProjectsView />;
}
