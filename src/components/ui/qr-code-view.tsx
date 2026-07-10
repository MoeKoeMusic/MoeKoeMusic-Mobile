import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { createQrMatrix } from '@/lib/kugou-api';

type QrRun = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type QrCodeViewProps = {
  value: string;
  /** 期望的整体边长（含白边），实际会向下取整到模块像素的整数倍 */
  size?: number;
};

const QUIET_ZONE = 12;

/** 纯 View 渲染二维码：同一行连续的深色模块合并成一个色块，避免上千个节点。 */
export function QrCodeView({ value, size = 224 }: QrCodeViewProps) {
  const { runs, side } = useMemo(() => {
    const matrix = createQrMatrix(value);
    const cell = Math.max(2, Math.floor((size - QUIET_ZONE * 2) / matrix.size));
    const mergedRuns: QrRun[] = [];

    for (let row = 0; row < matrix.size; row += 1) {
      let start = -1;
      for (let col = 0; col <= matrix.size; col += 1) {
        const dark = col < matrix.size && matrix.data[row * matrix.size + col] !== 0;
        if (dark && start < 0) {
          start = col;
        }
        if (!dark && start >= 0) {
          mergedRuns.push({
            key: `${row}-${start}`,
            left: start * cell,
            top: row * cell,
            width: (col - start) * cell,
            height: cell,
          });
          start = -1;
        }
      }
    }

    return { runs: mergedRuns, side: cell * matrix.size };
  }, [value, size]);

  return (
    <View style={[styles.card, { width: side + QUIET_ZONE * 2, height: side + QUIET_ZONE * 2 }]}>
      <View style={{ width: side, height: side }}>
        {runs.map((run) => (
          <View
            key={run.key}
            style={[
              styles.run,
              { left: run.left, top: run.top, width: run.width, height: run.height },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // 扫码需要高对比度，深浅主题都固定白底黑码
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: QUIET_ZONE,
  },
  run: {
    position: 'absolute',
    backgroundColor: '#111219',
  },
});
