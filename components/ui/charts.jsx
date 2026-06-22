import { useMemo } from 'react';

export function SvgPieChart({ data, onSegmentClick, size = 200 }) {
  const radius = size / 2;
  const center = size / 2;

  const total = data.reduce((sum, item) => sum + item.value, 0);

    let currentAngle = -Math.PI / 2;

  const segments = data.map((item, index) => {
    if (total === 0) return null;
    
    const percentage = item.value / total;
    const angle = percentage * 2 * Math.PI;
    
    const x1 = center + radius * Math.cos(currentAngle);
    const y1 = center + radius * Math.sin(currentAngle);
    
    currentAngle += angle;
    
    const x2 = center + radius * Math.cos(currentAngle);
    const y2 = center + radius * Math.sin(currentAngle);
    
    const largeArcFlag = angle > Math.PI ? 1 : 0;
    
    let pathData;
    if (percentage === 1) {
      pathData = `
        M ${center},${center - radius}
        A ${radius},${radius} 0 1,1 ${center},${center + radius}
        A ${radius},${radius} 0 1,1 ${center},${center - radius}
        Z
      `;
    } else {
      pathData = `
        M ${center},${center}
        L ${x1},${y1}
        A ${radius},${radius} 0 ${largeArcFlag},1 ${x2},${y2}
        Z
      `;
    }

    return (
      <path
        key={item.id || index}
        d={pathData}
        fill={item.color}
        onClick={() => onSegmentClick?.(item)}
        className="transition-opacity hover:opacity-80 cursor-pointer"
        stroke="#1e293b"
        strokeWidth="2"
      >
        <title>{`${item.label}: ${item.value}`}</title>
      </path>
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {total > 0 ? (
        segments
      ) : (
        <circle cx={center} cy={center} r={radius} fill="#334155" />
      )}
    </svg>
  );
}

export function SvgBarChart({ data, targetLine, onBarClick, width = '100%', height = 250 }) {
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };

  const maxValue = useMemo(() => {
    const maxData = Math.max(...data.map((d) => d.value), 0);
    return Math.max(maxData, targetLine || 0) * 1.1;
  }, [data, targetLine]);

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="relative h-full w-full" style={{ height: `${height}px`, width }}>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Y Axis Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = 100 - padding.bottom - (100 - padding.top - padding.bottom) * ratio;
          return (
            <line
              key={ratio}
              x1={padding.left}
              y1={y}
              x2={100 - padding.right}
              y2={y}
              stroke="#334155"
              strokeWidth="0.5"
              strokeDasharray={ratio === 0 ? '' : '2,2'}
            />
          );
        })}

        {/* Bars */}
        {data.map((item, index) => {
          const barWidth = (100 - padding.left - padding.right) / data.length;
          const barSpace = barWidth * 0.2;
          const actualWidth = barWidth - barSpace;
          const x = padding.left + index * barWidth + barSpace / 2;

          const barHeightPercentage = maxValue > 0 ? item.value / maxValue : 0;
          const actualHeight = (100 - padding.top - padding.bottom) * barHeightPercentage;
          const y = 100 - padding.bottom - actualHeight;

          return (
            <g key={item.id || index}>
              <rect
                x={x}
                y={y}
                width={actualWidth}
                height={actualHeight}
                fill={item.color || '#0ea5e9'}
                onClick={() => onBarClick?.(item)}
                className="transition-opacity hover:opacity-80 cursor-pointer"
                rx="1"
                ry="1"
              >
                <title>{`${item.label}: ${item.value}`}</title>
              </rect>
            </g>
          );
        })}

        {/* Target Line */}
        {targetLine !== undefined && targetLine !== null && maxValue > 0 && (
          <line
            x1={padding.left}
            y1={100 - padding.bottom - (100 - padding.top - padding.bottom) * (targetLine / maxValue)}
            x2={100 - padding.right}
            y2={100 - padding.bottom - (100 - padding.top - padding.bottom) * (targetLine / maxValue)}
            stroke="#f59e0b"
            strokeWidth="0.8"
            strokeDasharray="2,2"
          />
        )}
      </svg>

      {/* X-axis labels */}
      <div
        className="absolute"
        style={{
          left: `${padding.left}%`,
          right: `${padding.right}%`,
          bottom: '8px',
        }}
      >
        <div className="flex justify-between">
          {data.map((item, index) => (
            <span key={item.id || index} className="text-[10px] text-slate-500">
              {item.label || item.date}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
