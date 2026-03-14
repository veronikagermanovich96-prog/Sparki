import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export interface DotData {
    color: string;
    state: 'filled' | 'empty' | 'today' | 'future' | 'warning' | 'overflow';
    meta?: any;
}

export interface IconArrayProps {
    dots: DotData[];
    columns?: number;
    dotSize?: number;
    gap?: number;
    onDotPress?: (dot: DotData, index: number) => void;
}

export const IconArray: React.FC<IconArrayProps> = ({
    dots,
    columns = 10,
    dotSize = 8,
    gap = 4,
    onDotPress,
}) => {
    const rows = Math.ceil(dots.length / columns);
    const width = columns * dotSize + (columns - 1) * gap;
    const height = rows * dotSize + (rows - 1) * gap;

    return (
        <View style={{ width, height }}>
            <Svg width={width} height={height} pointerEvents={onDotPress ? 'auto' : 'none'}>
                {dots.map((dot, index) => {
                    const row = Math.floor(index / columns);
                    const col = index % columns;
                    const cx = col * (dotSize + gap) + dotSize / 2;
                    const cy = row * (dotSize + gap) + dotSize / 2;
                    const r = dotSize / 2;

                    let fill = dot.color;
                    let stroke = 'transparent';
                    let strokeWidth = 0;

                    if (dot.state === 'empty' || dot.state === 'future') {
                        fill = 'transparent';
                        stroke = dot.color;
                        strokeWidth = 1;
                    }

                    return (
                        <Circle
                            key={index}
                            cx={cx}
                            cy={cy}
                            r={r - strokeWidth / 2}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            onPress={onDotPress ? () => onDotPress(dot, index) : undefined}
                        />
                    );
                })}
            </Svg>
        </View>
    );
};
