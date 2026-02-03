import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
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

interface SankeyNode {
  id: string;
  label: string;
  value: number;
  x: number;
  y: number;
  height: number;
  color: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
  sourceY: number;
  targetY: number;
  height: number;
}

export function UserJourneySankey({ stages }: UserJourneySankeyProps) {
  const { config } = useThemeStore();

  // Event type colors
  const eventColors = {
    pageview: config.colors.primary,
    scroll: config.colors.success,
    click: '#f59e0b', // amber
  };

  // Calculate Sankey layout
  const { nodes, links, width, height } = useMemo(() => {
    if (stages.length === 0) {
      return { nodes: [], links: [], width: 600, height: 200 };
    }

    const padding = 20;
    const nodeWidth = 24;
    const minNodeHeight = 8;
    const chartWidth = 600;
    const chartHeight = 280;
    const stageGap = (chartWidth - padding * 2 - nodeWidth) / Math.max(stages.length - 1, 1);

    // Create nodes for each stage and event type
    const sankeyNodes: SankeyNode[] = [];
    const sankeyLinks: SankeyLink[] = [];

    // Find max users for scaling
    const maxUsers = Math.max(...stages.map(s => s.users), 1);

    stages.forEach((stage, stageIndex) => {
      const x = padding + stageIndex * stageGap;
      const totalEvents = stage.events.reduce((sum, e) => sum + e.count, 0);

      // Stage node (aggregate)
      const stageHeight = Math.max(minNodeHeight, (stage.users / maxUsers) * (chartHeight - 100));
      const stageY = (chartHeight - stageHeight) / 2;

      sankeyNodes.push({
        id: `stage-${stageIndex}`,
        label: stage.name,
        value: stage.users,
        x,
        y: stageY,
        height: stageHeight,
        color: config.colors.primary,
      });

      // Event breakdown nodes (to the right of stage)
      if (stage.events.length > 0 && stageIndex < stages.length - 1) {
        let eventY = stageY;
        stage.events.forEach((event) => {
          const eventHeight = Math.max(
            minNodeHeight / 2,
            (event.count / Math.max(totalEvents, 1)) * stageHeight
          );

          sankeyNodes.push({
            id: `event-${stageIndex}-${event.type}`,
            label: `${event.count} ${event.type}s`,
            value: event.count,
            x: x + nodeWidth + 8,
            y: eventY,
            height: eventHeight,
            color: eventColors[event.type],
          });

          eventY += eventHeight + 2;
        });
      }

      // Create links to next stage
      if (stageIndex < stages.length - 1) {
        const nextStage = stages[stageIndex + 1];
        const dropoff = stage.users - nextStage.users;
        const nextHeight = Math.max(minNodeHeight, (nextStage.users / maxUsers) * (chartHeight - 100));
        const nextY = (chartHeight - nextHeight) / 2;

        // Main flow link
        sankeyLinks.push({
          source: `stage-${stageIndex}`,
          target: `stage-${stageIndex + 1}`,
          value: nextStage.users,
          sourceY: stageY,
          targetY: nextY,
          height: Math.min(stageHeight, nextHeight),
        });

        // Dropoff indicator (if significant)
        if (dropoff > 0 && dropoff / stage.users > 0.1) {
          sankeyLinks.push({
            source: `stage-${stageIndex}`,
            target: `dropoff-${stageIndex}`,
            value: dropoff,
            sourceY: stageY + stageHeight - (dropoff / stage.users) * stageHeight,
            targetY: chartHeight - 30,
            height: (dropoff / stage.users) * stageHeight,
          });
        }
      }
    });

    return {
      nodes: sankeyNodes,
      links: sankeyLinks,
      width: chartWidth,
      height: chartHeight,
    };
  }, [stages, config.colors]);

  if (stages.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No journey data available
        </Typography>
      </Box>
    );
  }

  // Generate curved path for links
  const generateLinkPath = (link: SankeyLink, nodeWidth: number) => {
    const sourceNode = nodes.find(n => n.id === link.source);
    const targetNode = nodes.find(n => n.id === link.target);

    if (!sourceNode || !targetNode) return '';

    const x1 = sourceNode.x + nodeWidth;
    const y1 = link.sourceY + link.height / 2;
    const x2 = targetNode.x;
    const y2 = link.targetY + link.height / 2;

    const midX = (x1 + x2) / 2;

    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          {/* Gradient for links */}
          <linearGradient id="linkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={config.colors.primary} stopOpacity={0.4} />
            <stop offset="100%" stopColor={config.colors.primary} stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="dropoffGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={config.colors.error} stopOpacity={0.3} />
            <stop offset="100%" stopColor={config.colors.error} stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Links */}
        {links.map((link, index) => {
          const isDropoff = link.target.startsWith('dropoff');

          return (
            <g key={`link-${index}`}>
              <path
                d={generateLinkPath(link, 24)}
                fill="none"
                stroke={isDropoff ? `url(#dropoffGradient)` : `url(#linkGradient)`}
                strokeWidth={Math.max(link.height, 2)}
                strokeLinecap="round"
                opacity={0.6}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.filter(n => n.id.startsWith('stage')).map((node) => (
          <Tooltip
            key={node.id}
            title={`${node.label}: ${node.value} users`}
            arrow
            placement="top"
          >
            <g style={{ cursor: 'pointer' }}>
              <rect
                x={node.x}
                y={node.y}
                width={24}
                height={node.height}
                rx={4}
                fill={node.color}
                opacity={0.9}
              />
              {/* Stage label */}
              <text
                x={node.x + 12}
                y={node.y + node.height + 16}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill={config.colors.textPrimary}
              >
                {node.label}
              </text>
              {/* User count */}
              <text
                x={node.x + 12}
                y={node.y + node.height + 30}
                textAnchor="middle"
                fontSize={10}
                fill={config.colors.textSecondary}
              >
                {node.value}
              </text>
            </g>
          </Tooltip>
        ))}

        {/* Event indicators */}
        {nodes.filter(n => n.id.startsWith('event')).map((node) => (
          <Tooltip key={node.id} title={node.label} arrow placement="right">
            <rect
              x={node.x}
              y={node.y}
              width={8}
              height={Math.max(node.height, 4)}
              rx={2}
              fill={node.color}
              opacity={0.8}
              style={{ cursor: 'pointer' }}
            />
          </Tooltip>
        ))}
      </svg>

      {/* Legend */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 3,
          mt: 2,
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {Object.entries(eventColors).map(([type, color]) => (
          <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '2px',
                backgroundColor: color,
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
              {type}s
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
