import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { Eye, Mouse, CursorClick, ChatCircle, CaretRight } from '@phosphor-icons/react';
import { useThemeStore } from '@/store/themeStore';

export interface JourneyEvent {
  type: 'pageview' | 'scroll' | 'click';
  count: number;
  label?: string;
}

export interface JourneyStage {
  name: string;
  events: JourneyEvent[];
  users: number;
}

interface UserJourneySankeyProps {
  stages: JourneyStage[];
}

// Stage icons mapping
const stageIcons: Record<string, React.ElementType> = {
  'Page Visit': Eye,
  'Scrolled': Mouse,
  'Clicked': CursorClick,
  'Feedback': ChatCircle,
};

export function UserJourneySankey({ stages }: UserJourneySankeyProps) {
  const { config } = useThemeStore();

  if (stages.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No journey data available
        </Typography>
      </Box>
    );
  }

  // Get max users for calculating percentages and bar widths
  const maxUsers = Math.max(...stages.map(s => s.users), 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Horizontal funnel visualization */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          flex: 1,
          minHeight: 180,
        }}
      >
        {stages.map((stage, index) => {
          const percentage = Math.round((stage.users / maxUsers) * 100);
          const dropoff = index > 0 ? stages[index - 1].users - stage.users : 0;
          const dropoffPercent = index > 0 ? Math.round((dropoff / stages[index - 1].users) * 100) : 0;
          const Icon = stageIcons[stage.name] || Eye;
          const isLast = index === stages.length - 1;

          // Color gradient from primary to success/warning based on position
          const stageColor = index === 0
            ? config.colors.primary
            : index === stages.length - 1
              ? (stage.users > 0 ? config.colors.success : config.colors.textSecondary)
              : `color-mix(in srgb, ${config.colors.primary} ${100 - (index / stages.length) * 50}%, ${config.colors.success})`;

          return (
            <Box
              key={stage.name}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              {/* Stage content */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {/* Funnel bar */}
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {/* Main bar */}
                  <Tooltip
                    title={
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {stage.name}
                        </Typography>
                        <br />
                        <Typography variant="caption">
                          {stage.users} users ({percentage}%)
                        </Typography>
                        {stage.events.map((event, i) => (
                          <Box key={i}>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', opacity: 0.8 }}>
                              {event.count} {event.type}s
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    }
                    arrow
                    placement="top"
                  >
                    <Box
                      sx={{
                        width: `${Math.max(percentage, 20)}%`,
                        minWidth: 48,
                        maxWidth: '90%',
                        height: 48,
                        backgroundColor: stageColor,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: 0.85 + (index === 0 ? 0.15 : 0),
                        '&:hover': {
                          transform: 'scale(1.02)',
                          opacity: 1,
                        },
                      }}
                    >
                      <Icon size={20} color="white" weight="bold" />
                    </Box>
                  </Tooltip>

                  {/* User count */}
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      fontSize: '1.1rem',
                      color: config.colors.textPrimary,
                      mt: 1,
                    }}
                  >
                    {stage.users}
                  </Typography>

                  {/* Stage name */}
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: '0.7rem',
                      color: config.colors.textSecondary,
                      textAlign: 'center',
                      fontWeight: 500,
                    }}
                  >
                    {stage.name}
                  </Typography>

                  {/* Dropoff indicator */}
                  {dropoffPercent > 5 && (
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.6rem',
                        color: config.colors.error,
                        mt: 0.5,
                        opacity: 0.8,
                      }}
                    >
                      -{dropoffPercent}%
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Connector arrow */}
              {!isLast && (
                <Box
                  sx={{
                    position: 'absolute',
                    right: -12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    zIndex: 1,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <CaretRight
                    size={24}
                    color={config.colors.textSecondary}
                    weight="bold"
                    style={{ opacity: 0.3 }}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 2.5,
          mt: 2,
          pt: 1.5,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {[
          { label: 'Page views', icon: Eye, color: config.colors.primary },
          { label: 'Scrolls', icon: Mouse, color: config.colors.success },
          { label: 'Clicks', icon: CursorClick, color: '#f59e0b' },
        ].map(({ label, icon: LegendIcon, color }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LegendIcon size={12} color={color} />
            <Typography variant="caption" sx={{ fontSize: '0.65rem', color: config.colors.textSecondary }}>
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
