/**
 * Share Page - Public view for shared prototypes with commenting
 * Comments are saved to DB for Insights, but only displayed privately per user
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import Fade from '@mui/material/Fade';
import { Card, Chip, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions } from '@/components/ui';
import {
  Sparkle,
  Warning,
  ChatCircle,
  X,
  PushPin,
  Check,
  CheckCircle,
  ImageBroken,
} from '@phosphor-icons/react';
import { getShareData, type ShareData } from '@/services/sharingService';
import { relaxCsp } from '@/utils/htmlUtils';
import { supabasePublic } from '@/services/supabase';

// Local storage keys
const USER_INFO_KEY = 'voxel_share_user';
const getCommentsKey = (token: string, email: string) => `voxel_comments_${token}_${email}`;

// Generate unique session ID
const generateSessionId = () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface UserInfo {
  name: string;
  email: string;
}

interface LocalComment {
  id: string;
  content: string;
  positionX: number | null;
  positionY: number | null;
  variantIndex: number | null;
  resolved: boolean;
  createdAt: string;
}

// Helper to record view with enhanced tracking
async function recordEnhancedView(
  shareId: string,
  variantIndex: number,
  userInfo: UserInfo | null,
  sessionId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabasePublic.rpc('record_share_view_enhanced', {
      p_share_id: shareId,
      p_variant_index: variantIndex,
      p_viewer_email: userInfo?.email || null,
      p_viewer_name: userInfo?.name || null,
      p_session_id: sessionId,
      p_user_agent: navigator.userAgent,
    });

    if (error) {
      console.error('[Share] Error recording view:', error);
      // Fall back to basic view recording
      await supabasePublic.from('vibe_share_views').insert({
        share_id: shareId,
        variant_index: variantIndex,
        viewer_ip_hash: 'anonymous',
        user_agent: navigator.userAgent,
        viewer_email: userInfo?.email || null,
        viewer_name: userInfo?.name || null,
        session_id: sessionId,
      });
      return null;
    }

    return data as string;
  } catch (err) {
    console.error('[Share] Error recording view:', err);
    return null;
  }
}

// Helper to update session duration
async function updateSessionDuration(viewId: string, duration: number): Promise<void> {
  try {
    await supabasePublic.rpc('update_view_session_duration', {
      p_view_id: viewId,
      p_duration: duration,
    });
  } catch (err) {
    // Fall back to direct update
    try {
      await supabasePublic
        .from('vibe_share_views')
        .update({ session_duration: duration })
        .eq('id', viewId);
    } catch {
      console.error('[Share] Error updating session duration:', err);
    }
  }
}

// Helper to save comment to database
async function saveCommentToDb(
  shareToken: string,
  comment: LocalComment,
  userInfo: UserInfo
): Promise<boolean> {
  try {
    const { data, error } = await supabasePublic.rpc('add_share_comment', {
      p_share_token: shareToken,
      p_content: comment.content,
      p_user_email: userInfo.email,
      p_user_name: userInfo.name,
      p_position_x: comment.positionX,
      p_position_y: comment.positionY,
      p_variant_index: comment.variantIndex,
      p_parent_id: null,
    });

    if (error) {
      console.error('[Share] Error saving comment to DB via RPC:', error);
      // Try direct insert as fallback
      const { data: shareData } = await supabasePublic
        .from('vibe_shares')
        .select('id')
        .eq('share_token', shareToken)
        .eq('is_active', true)
        .single();

      if (shareData) {
        const { error: insertError } = await supabasePublic
          .from('share_comments')
          .insert({
            share_id: shareData.id,
            user_email: userInfo.email,
            user_name: userInfo.name,
            content: comment.content,
            position_x: comment.positionX,
            position_y: comment.positionY,
            variant_index: comment.variantIndex,
          });

        if (insertError) {
          console.error('[Share] Fallback insert also failed:', insertError);
          return false;
        }
        console.log('[Share] Comment saved via fallback insert');
        return true;
      }
      return false;
    }

    console.log('[Share] Comment saved to DB:', data);
    return true;
  } catch (err) {
    console.error('[Share] Error saving comment to DB:', err);
    return false;
  }
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [wireframeError, setWireframeError] = useState(false);

  // Comment state - stored locally per user but also saved to DB for Insights
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [newComment, setNewComment] = useState('');

  // Pin mode state
  const [pinMode, setPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pinComment, setPinComment] = useState('');
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Session tracking state
  const [viewId, setViewId] = useState<string | null>(null);
  const [sessionStartTime] = useState(() => Date.now());
  const [sessionId] = useState(() => generateSessionId());

  // User info state
  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => {
    const stored = localStorage.getItem(USER_INFO_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [userInfoDialogOpen, setUserInfoDialogOpen] = useState(false);
  const [tempUserInfo, setTempUserInfo] = useState<UserInfo>({ name: '', email: '' });
  const [pendingAction, setPendingAction] = useState<'comment' | 'pin' | null>(null);

  // Load comments from local storage
  const loadLocalComments = useCallback(() => {
    if (!token || !userInfo?.email) return;

    const key = getCommentsKey(token, userInfo.email);
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setComments(JSON.parse(stored));
      } catch {
        setComments([]);
      }
    }
  }, [token, userInfo?.email]);

  // Save comments to local storage
  const saveLocalComments = useCallback((newComments: LocalComment[]) => {
    if (!token || !userInfo?.email) return;

    const key = getCommentsKey(token, userInfo.email);
    localStorage.setItem(key, JSON.stringify(newComments));
    setComments(newComments);
  }, [token, userInfo?.email]);

  // Load share data
  useEffect(() => {
    async function loadShare() {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const data = await getShareData(token);

        if (!data) {
          setError('Share link not found or has expired');
          setLoading(false);
          return;
        }

        console.log('[SharePage] Share data loaded:', {
          shareWireframes: data.share.shareWireframes,
          wireframe_url: data.variant.wireframe_url,
          html_url: data.variant.html_url,
        });

        setShareData(data);

        // If html_url is a URL, fetch the content to avoid sandbox restrictions
        if (data.variant.html_url && data.variant.html_url.startsWith('http')) {
          try {
            const response = await fetch(data.variant.html_url);
            if (response.ok) {
              const html = await response.text();
              setHtmlContent(html);
            }
          } catch (fetchErr) {
            console.error('Error fetching HTML content:', fetchErr);
          }
        } else if (data.variant.html_url) {
          setHtmlContent(data.variant.html_url);
        }

        // Record the view with enhanced tracking
        const recordedViewId = await recordEnhancedView(
          data.share.id,
          data.variant.index,
          userInfo,
          sessionId
        );
        if (recordedViewId) {
          setViewId(recordedViewId);
        }
      } catch (err) {
        console.error('Error loading share:', err);
        setError('Failed to load shared prototype');
      } finally {
        setLoading(false);
      }
    }

    loadShare();
  }, [token, sessionId, userInfo]);

  // Track session duration on page unload
  useEffect(() => {
    const handleUnload = () => {
      if (viewId) {
        const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
        // Use sendBeacon for reliable unload tracking
        const data = JSON.stringify({
          view_id: viewId,
          duration,
        });
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/update_view_session_duration`,
          data
        );
      }
    };

    // Also update periodically while page is open
    const intervalId = setInterval(() => {
      if (viewId) {
        const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
        updateSessionDuration(viewId, duration);
      }
    }, 30000); // Update every 30 seconds

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      // Final update on unmount
      if (viewId) {
        const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
        updateSessionDuration(viewId, duration);
      }
    };
  }, [viewId, sessionStartTime]);

  // Load comments when user info is available
  useEffect(() => {
    loadLocalComments();
  }, [loadLocalComments]);

  // Handle user info submission
  const handleUserInfoSubmit = () => {
    if (!tempUserInfo.name.trim() || !tempUserInfo.email.trim()) return;

    const info = { name: tempUserInfo.name.trim(), email: tempUserInfo.email.trim() };
    setUserInfo(info);
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(info));
    setUserInfoDialogOpen(false);

    // Execute pending action after a brief delay to ensure state is updated
    setTimeout(() => {
      if (pendingAction === 'comment') {
        setCommentsOpen(true);
      } else if (pendingAction === 'pin') {
        setPinMode(true);
      }
      setPendingAction(null);
    }, 100);
  };

  // Ensure user info before action
  const ensureUserInfo = (action: 'comment' | 'pin'): boolean => {
    if (!userInfo) {
      setPendingAction(action);
      setTempUserInfo({ name: '', email: '' });
      setUserInfoDialogOpen(true);
      return false;
    }
    return true;
  };

  // Handle comment submission
  const handleSubmitComment = async () => {
    if (!token || !newComment.trim() || !userInfo) return;

    const comment: LocalComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: newComment.trim(),
      positionX: null,
      positionY: null,
      variantIndex: shareData?.variant.index ?? null,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    // Save locally for immediate display
    saveLocalComments([...comments, comment]);
    setNewComment('');

    // Also save to database for Insights aggregation
    await saveCommentToDb(token, comment, userInfo);
  };

  // Handle pin click on preview
  const handlePreviewClick = (e: React.MouseEvent) => {
    if (!pinMode || !previewRef.current) return;
    if (!ensureUserInfo('pin')) return;

    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setPendingPin({ x, y });
    setPinComment('');
  };

  // Handle pin comment submission
  const handleSubmitPinComment = async () => {
    if (!token || !pendingPin || !pinComment.trim() || !userInfo) return;

    const comment: LocalComment = {
      id: `pin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: pinComment.trim(),
      positionX: pendingPin.x,
      positionY: pendingPin.y,
      variantIndex: shareData?.variant.index ?? null,
      resolved: false,
      createdAt: new Date().toISOString(),
    };

    // Save locally for immediate display
    saveLocalComments([...comments, comment]);
    setPendingPin(null);
    setPinComment('');
    setPinMode(false);

    // Also save to database for Insights aggregation
    await saveCommentToDb(token, comment, userInfo);
  };

  // Handle resolve toggle
  const handleToggleResolved = (commentId: string) => {
    const updated = comments.map((c) =>
      c.id === commentId ? { ...c, resolved: !c.resolved } : c
    );
    saveLocalComments(updated);
  };

  // Handle delete comment
  const handleDeleteComment = (commentId: string) => {
    const updated = comments.filter((c) => c.id !== commentId);
    saveLocalComments(updated);
  };

  // Get pin comments (comments with positions)
  const pinComments = comments.filter((c) => c.positionX !== null && c.positionY !== null);
  const generalComments = comments.filter((c) => c.positionX === null);

  // Format relative time
  const formatTime = (dateStr: string) => {
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

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Loading state
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#f8f9fa',
        }}
      >
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={40} sx={{ mb: 2, color: '#764ba2' }} />
          <Typography color="text.secondary" variant="body2">
            Loading prototype...
          </Typography>
        </Box>
      </Box>
    );
  }

  // Error state
  if (error || !shareData) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#f8f9fa',
        }}
      >
        <Card sx={{ p: 4, maxWidth: 400, textAlign: 'center', boxShadow: 3 }}>
          <Warning size={48} color="#f57c00" style={{ marginBottom: 16 }} />
          <Typography variant="h6" sx={{ mb: 1, fontWeight: 600 }}>
            {error || 'Share not found'}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            This share link may have expired or been deactivated.
          </Typography>
        </Card>
      </Box>
    );
  }

  const { session, variant, share } = shareData;
  const variantLetter = String.fromCharCode(64 + variant.index);
  const totalComments = comments.length;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#f8f9fa',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 1.5,
          bgcolor: 'white',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              background: 'linear-gradient(135deg, #9b59b6 0%, #764ba2 100%)',
              px: 1.25,
              py: 0.5,
              borderRadius: 1,
            }}
          >
            <Sparkle size={16} color="white" weight="fill" />
            <Typography
              variant="caption"
              sx={{
                color: 'white',
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              Voxel
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
              {session.name || 'Shared Prototype'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {variant.title}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            size="small"
            label={`Variant ${variantLetter}`}
            sx={{
              bgcolor: 'rgba(118, 75, 162, 0.08)',
              color: '#764ba2',
              fontWeight: 600,
              fontSize: 11,
              height: 24,
            }}
          />

          {/* Pin mode toggle */}
          <Tooltip title={pinMode ? 'Exit pin mode (Esc)' : 'Add feedback pin'}>
            <IconButton
              size="small"
              onClick={() => {
                if (!pinMode && !ensureUserInfo('pin')) return;
                setPinMode(!pinMode);
                setPendingPin(null);
              }}
              sx={{
                bgcolor: pinMode ? '#764ba2' : 'transparent',
                color: pinMode ? 'white' : 'text.secondary',
                '&:hover': { bgcolor: pinMode ? '#5a3a7e' : 'rgba(0,0,0,0.04)' },
                transition: 'all 0.2s',
              }}
            >
              <PushPin size={18} weight={pinMode ? 'fill' : 'regular'} />
            </IconButton>
          </Tooltip>

          {/* Comments toggle */}
          <Tooltip title="My feedback">
            <IconButton
              size="small"
              onClick={() => {
                if (!ensureUserInfo('comment')) return;
                setCommentsOpen(true);
              }}
              sx={{
                color: 'text.secondary',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
              }}
            >
              <Badge
                badgeContent={totalComments}
                sx={{
                  '& .MuiBadge-badge': {
                    bgcolor: '#764ba2',
                    color: 'white',
                    fontSize: 10,
                    minWidth: 16,
                    height: 16,
                  },
                }}
              >
                <ChatCircle size={18} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User avatar */}
          {userInfo && (
            <Tooltip title={`${userInfo.name}`}>
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 10,
                  bgcolor: '#764ba2',
                  cursor: 'pointer',
                  ml: 0.5,
                }}
                onClick={() => {
                  setTempUserInfo(userInfo);
                  setUserInfoDialogOpen(true);
                }}
              >
                {getInitials(userInfo.name)}
              </Avatar>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Variant description bar */}
      {variant.description && (
        <Box
          sx={{
            px: 3,
            py: 1,
            bgcolor: 'rgba(118, 75, 162, 0.04)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {variant.description}
          </Typography>
        </Box>
      )}

      {/* Main Preview */}
      <Box
        ref={previewRef}
        onClick={handlePreviewClick}
        sx={{
          flex: 1,
          position: 'relative',
          cursor: pinMode ? 'crosshair' : 'default',
          overflow: 'hidden',
        }}
      >
        {/* Pin markers */}
        {pinComments.map((pin, idx) => (
          <Tooltip
            key={pin.id}
            title={
              <Box sx={{ maxWidth: 200 }}>
                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                  {pin.content}
                </Typography>
                <Typography variant="caption" display="block" sx={{ opacity: 0.7, mt: 0.5 }}>
                  {formatTime(pin.createdAt)}
                </Typography>
              </Box>
            }
            placement="top"
          >
            <Box
              onMouseEnter={() => setHoveredPin(pin.id)}
              onMouseLeave={() => setHoveredPin(null)}
              onClick={(e) => {
                e.stopPropagation();
                setCommentsOpen(true);
              }}
              sx={{
                position: 'absolute',
                left: `${pin.positionX}%`,
                top: `${pin.positionY}%`,
                transform: 'translate(-50%, -50%)',
                width: hoveredPin === pin.id ? 32 : 26,
                height: hoveredPin === pin.id ? 32 : 26,
                borderRadius: '50%',
                bgcolor: pin.resolved ? '#4caf50' : '#764ba2',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                zIndex: 10,
                boxShadow: hoveredPin === pin.id
                  ? '0 4px 12px rgba(118, 75, 162, 0.4)'
                  : '0 2px 8px rgba(0,0,0,0.2)',
                transition: 'all 0.15s ease',
                border: '2px solid white',
              }}
            >
              {idx + 1}
            </Box>
          </Tooltip>
        ))}

        {/* Pending pin input */}
        {pendingPin && (
          <Fade in>
            <Box
              sx={{
                position: 'absolute',
                left: `${pendingPin.x}%`,
                top: `${pendingPin.y}%`,
                transform: 'translate(-50%, -100%)',
                zIndex: 20,
                mt: -1,
              }}
            >
              {/* Pin indicator */}
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: '#764ba2',
                  border: '2px solid white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  position: 'absolute',
                  bottom: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              />
              <Card sx={{ p: 2, width: 280, boxShadow: 4, borderRadius: 2 }}>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 1.5, display: 'block', color: '#764ba2' }}>
                  Add feedback
                </Typography>
                <TextField
                  autoFocus
                  multiline
                  rows={2}
                  placeholder="What's your feedback on this area?"
                  value={pinComment}
                  onChange={(e) => setPinComment(e.target.value)}
                  fullWidth
                  size="small"
                  sx={{
                    mb: 1.5,
                    '& .MuiOutlinedInput-root': {
                      fontSize: 13,
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setPendingPin(null);
                      setPinComment('');
                    }
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setPendingPin(null);
                      setPinComment('');
                    }}
                    sx={{ fontSize: 12 }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={!pinComment.trim()}
                    onClick={handleSubmitPinComment}
                    sx={{
                      fontSize: 12,
                      bgcolor: '#764ba2',
                      '&:hover': { bgcolor: '#5a3a7e' },
                    }}
                  >
                    Add Pin
                  </Button>
                </Box>
              </Card>
            </Box>
          </Fade>
        )}

        {/* Content display */}
        {share.shareWireframes ? (
          // Wireframe display
          variant.wireframe_url && !wireframeError ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f0f0f0',
                p: 4,
              }}
            >
              <img
                src={variant.wireframe_url}
                alt={`Wireframe - Variant ${variantLetter}`}
                onError={() => setWireframeError(true)}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                  pointerEvents: pinMode ? 'none' : 'auto',
                }}
              />
            </Box>
          ) : (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: '#f5f5f5',
              }}
            >
              <ImageBroken size={48} color="#999" />
              <Typography color="text.secondary" sx={{ mt: 2 }}>
                Wireframe not available
              </Typography>
              <Typography variant="caption" color="text.secondary">
                The wireframe image could not be loaded
              </Typography>
            </Box>
          )
        ) : htmlContent ? (
          <iframe
            srcDoc={relaxCsp(htmlContent)}
            title={`${session.name} - Variant ${variantLetter}`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: pinMode ? 'none' : 'auto',
            }}
          />
        ) : variant.html_url ? (
          <iframe
            src={variant.html_url}
            title={`${session.name} - Variant ${variantLetter}`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: pinMode ? 'none' : 'auto',
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography color="text.secondary">No preview available</Typography>
          </Box>
        )}

        {/* Pin mode hint */}
        {pinMode && !pendingPin && (
          <Fade in>
            <Box
              sx={{
                position: 'absolute',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                bgcolor: 'rgba(0,0,0,0.85)',
                color: 'white',
                px: 2.5,
                py: 1.25,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <PushPin size={16} weight="fill" />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Click anywhere to add feedback
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.6, ml: 1 }}>
                Press Esc to cancel
              </Typography>
            </Box>
          </Fade>
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 3,
          py: 1,
          bgcolor: 'white',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
        }}
      >
        <Sparkle size={12} color="#764ba2" weight="fill" />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
          Created with{' '}
          <Typography
            component="span"
            variant="caption"
            sx={{ color: '#764ba2', fontWeight: 600, fontSize: 11 }}
          >
            Voxel
          </Typography>
        </Typography>
      </Box>

      {/* Comments Drawer */}
      <Drawer
        anchor="right"
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        PaperProps={{
          sx: {
            width: 360,
            maxWidth: '100vw',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          },
        }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Drawer Header */}
          <Box
            sx={{
              px: 2.5,
              py: 2,
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              bgcolor: '#fafafa',
            }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                My Feedback
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Only visible to you
              </Typography>
            </Box>
            <IconButton onClick={() => setCommentsOpen(false)} size="small">
              <X size={18} />
            </IconButton>
          </Box>

          {/* Comments List */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
            {comments.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    bgcolor: '#ede7f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                  }}
                >
                  <ChatCircle size={28} color="#7e57c2" />
                </Box>
                <Typography fontWeight={500} sx={{ mb: 0.5 }}>
                  No feedback yet
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Add pins or comments to share your thoughts
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PushPin size={14} />}
                  onClick={() => {
                    setCommentsOpen(false);
                    setPinMode(true);
                  }}
                  sx={{
                    borderColor: '#7e57c2',
                    color: '#7e57c2',
                    '&:hover': { borderColor: '#5e35b1', bgcolor: '#ede7f6' },
                  }}
                >
                  Add a pin
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {/* Pin comments */}
                {pinComments.length > 0 && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      PINNED FEEDBACK ({pinComments.length})
                    </Typography>
                    {pinComments.map((comment, idx) => (
                      <CommentCard
                        key={comment.id}
                        comment={comment}
                        pinNumber={idx + 1}
                        formatTime={formatTime}
                        onToggleResolved={() => handleToggleResolved(comment.id)}
                        onDelete={() => handleDeleteComment(comment.id)}
                      />
                    ))}
                  </Box>
                )}

                {/* General comments */}
                {generalComments.length > 0 && (
                  <Box>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      GENERAL FEEDBACK ({generalComments.length})
                    </Typography>
                    {generalComments.map((comment) => (
                      <CommentCard
                        key={comment.id}
                        comment={comment}
                        formatTime={formatTime}
                        onToggleResolved={() => handleToggleResolved(comment.id)}
                        onDelete={() => handleDeleteComment(comment.id)}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {/* New Comment Input */}
          <Box sx={{ p: 2, borderTop: '1px solid rgba(0,0,0,0.08)', bgcolor: '#fafafa' }}>
            <TextField
              multiline
              rows={2}
              placeholder="Add general feedback..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              fullWidth
              size="small"
              sx={{
                mb: 1.5,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'white',
                  fontSize: 13,
                },
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey) {
                  handleSubmitComment();
                }
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                ⌘ + Enter to submit
              </Typography>
              <Button
                variant="contained"
                size="small"
                disabled={!newComment.trim()}
                onClick={handleSubmitComment}
                sx={{
                  bgcolor: '#764ba2',
                  '&:hover': { bgcolor: '#5a3a7e' },
                  fontSize: 12,
                }}
              >
                Add Feedback
              </Button>
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/* User Info Dialog */}
      <Dialog
        open={userInfoDialogOpen}
        onClose={() => {
          setUserInfoDialogOpen(false);
          setPendingAction(null);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            {userInfo ? 'Update your info' : 'Before you start'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your feedback will be saved locally
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Your name"
              value={tempUserInfo.name}
              onChange={(e) => setTempUserInfo((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              autoFocus
              size="small"
            />
            <TextField
              label="Email"
              type="email"
              value={tempUserInfo.email}
              onChange={(e) => setTempUserInfo((prev) => ({ ...prev, email: e.target.value }))}
              fullWidth
              size="small"
              helperText="Used to save your feedback privately"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="text"
            onClick={() => {
              setUserInfoDialogOpen(false);
              setPendingAction(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUserInfoSubmit}
            disabled={!tempUserInfo.name.trim() || !tempUserInfo.email.trim()}
            sx={{
              bgcolor: '#764ba2',
              '&:hover': { bgcolor: '#5a3a7e' },
            }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Comment Card Component
interface CommentCardProps {
  comment: LocalComment;
  pinNumber?: number;
  formatTime: (date: string) => string;
  onToggleResolved: () => void;
  onDelete: () => void;
}

function CommentCard({ comment, pinNumber, formatTime, onToggleResolved, onDelete }: CommentCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <Box
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      sx={{
        p: 1.5,
        mb: 1,
        borderRadius: 1.5,
        bgcolor: comment.resolved ? 'rgba(76, 175, 80, 0.05)' : '#ffffff',
        border: '1px solid',
        borderColor: comment.resolved ? 'rgba(76, 175, 80, 0.2)' : '#e0e0e0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        transition: 'all 0.15s',
        '&:hover': {
          borderColor: comment.resolved ? 'rgba(76, 175, 80, 0.3)' : '#bdbdbd',
          boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {pinNumber && (
            <Box
              sx={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: comment.resolved ? '#4caf50' : '#764ba2',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {pinNumber}
            </Box>
          )}
          {comment.resolved && (
            <Chip
              size="small"
              label="Resolved"
              icon={<CheckCircle size={12} weight="fill" />}
              sx={{
                height: 20,
                fontSize: 10,
                bgcolor: 'rgba(76, 175, 80, 0.1)',
                color: '#2e7d32',
                '& .MuiChip-icon': { color: '#2e7d32' },
              }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, opacity: showActions ? 1 : 0, transition: 'opacity 0.15s' }}>
          <Tooltip title={comment.resolved ? 'Mark unresolved' : 'Mark resolved'}>
            <IconButton size="small" onClick={onToggleResolved} sx={{ p: 0.5 }}>
              <Check size={14} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={onDelete} sx={{ p: 0.5, color: 'error.main' }}>
              <X size={14} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Typography
        variant="body2"
        sx={{
          wordBreak: 'break-word',
          opacity: comment.resolved ? 0.7 : 1,
          textDecoration: comment.resolved ? 'line-through' : 'none',
        }}
      >
        {comment.content}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
        {formatTime(comment.createdAt)}
      </Typography>
    </Box>
  );
}
