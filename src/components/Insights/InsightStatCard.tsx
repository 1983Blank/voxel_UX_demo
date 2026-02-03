import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { TrendUp, TrendDown } from '@phosphor-icons/react';
import { Card } from '@/components/ui';
import { useThemeStore } from '@/store/themeStore';

interface InsightStatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string | number;
    label?: string;
  };
  color?: string;
}

/**
 * Compact stat card with minimal design
 */
export function InsightStatCard({
  title,
  value,
  icon,
  subtitle,
  trend,
  color,
}: InsightStatCardProps) {
  const { config, mode } = useThemeStore();
  const accentColor = color || config.colors.primary;

  return (
    <Card
      sx={{
        p: 0,
        height: '100%',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: `${accentColor}50`,
          boxShadow: `0 2px 8px ${accentColor}10`,
        },
      }}
    >
      {/* Top accent bar */}
      <Box
        sx={{
          height: 2,
          background: mode === 'modern' && config.gradients
            ? config.gradients.primary
            : accentColor,
          opacity: 0.8,
        }}
      />

      <Box sx={{ p: 1.5, py: 1.25 }}>
        {/* Header with icon */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 0.75,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: config.colors.textSecondary,
              fontWeight: 500,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 1,
              backgroundColor: `${accentColor}12`,
              color: accentColor,
            }}
          >
            {icon}
          </Box>
        </Box>

        {/* Value */}
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            fontSize: '1.35rem',
            lineHeight: 1,
            color: config.colors.textPrimary,
            fontFamily: config.fonts.display,
            mb: subtitle || trend ? 0.5 : 0,
          }}
        >
          {value}
        </Typography>

        {/* Subtitle or trend */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 16,
          }}
        >
          {subtitle && (
            <Typography
              variant="caption"
              sx={{
                color: config.colors.textSecondary,
                fontSize: '0.6rem',
              }}
            >
              {subtitle}
            </Typography>
          )}

          {trend && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.75,
                py: 0.125,
                borderRadius: 0.75,
                backgroundColor:
                  trend.direction === 'up'
                    ? `${config.colors.success}15`
                    : trend.direction === 'down'
                    ? `${config.colors.error}15`
                    : `${config.colors.textSecondary}10`,
              }}
            >
              {trend.direction === 'up' && (
                <TrendUp size={10} color={config.colors.success} weight="bold" />
              )}
              {trend.direction === 'down' && (
                <TrendDown size={10} color={config.colors.error} weight="bold" />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.6rem',
                  color:
                    trend.direction === 'up'
                      ? config.colors.success
                      : trend.direction === 'down'
                      ? config.colors.error
                      : config.colors.textSecondary,
                }}
              >
                {trend.value}
                {typeof trend.value === 'number' ? '%' : ''}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Card>
  );
}
