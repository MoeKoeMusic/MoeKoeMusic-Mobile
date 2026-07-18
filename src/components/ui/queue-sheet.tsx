import { Ionicons } from '@expo/vector-icons';
import { FlatList, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Text, XStack, YStack } from 'tamagui';

import { playerActions, usePlayer } from '@/features/player/store';
import { usePalette } from '@/hooks/use-palette';

type QueueSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MODE_LABEL: Record<string, string> = {
  sequence: '顺序播放',
  shuffle: '随机播放',
  single: '单曲循环',
};

const QUEUE_ITEM_HEIGHT = 58;
const QUEUE_HEADER_HEIGHT = 78;
const QUEUE_MAX_HEIGHT_RATIO = 0.68;
const QUEUE_RENDER_ALL_LIMIT = 100;

export function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { queue, index, mode } = usePlayer();
  const frameBottomPadding = Math.max(insets.bottom, 16) + 6;
  const maxListHeight = Math.max(
    QUEUE_ITEM_HEIGHT * 3,
    height * QUEUE_MAX_HEIGHT_RATIO - QUEUE_HEADER_HEIGHT - frameBottomPadding
  );
  const listContentHeight = queue.length * QUEUE_ITEM_HEIGHT;
  const listHeight = Math.min(listContentHeight, maxListHeight);
  const listScrollable = listContentHeight > maxListHeight;
  const visibleRows = Math.ceil(maxListHeight / QUEUE_ITEM_HEIGHT);
  const renderAllRows = queue.length <= QUEUE_RENDER_ALL_LIMIT;
  const initialRows = renderAllRows ? queue.length : Math.max(24, visibleRows + 18);
  const batchRows = renderAllRows ? queue.length : 64;

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      transition="medium"
      zIndex={100000}>
      <Sheet.Overlay
        transition="quick"
        backgroundColor="rgba(8, 8, 14, 0.42)"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Handle backgroundColor={palette.cardAlt} width={40} alignSelf="center" />
      <Sheet.Frame
        backgroundColor={palette.card}
        borderTopLeftRadius={26}
        borderTopRightRadius={26}
        paddingTop="$3"
        paddingBottom={frameBottomPadding}>
        <XStack
          alignItems="center"
          justifyContent="space-between"
          paddingHorizontal="$4"
          paddingBottom="$3">
          <YStack gap={2}>
            <Text color={palette.text} fontSize={17} fontWeight="700">
              播放队列
            </Text>
            <Text color={palette.textTertiary} fontSize={12}>
              {MODE_LABEL[mode]} · {queue.length} 首
            </Text>
          </YStack>
          <XStack
            alignItems="center"
            gap={5}
            paddingHorizontal={12}
            paddingVertical={7}
            borderRadius={999}
            backgroundColor={palette.cardAlt}
            transition="quickest"
            pressStyle={{ opacity: 0.6 }}
            onPress={() => {
              playerActions.clearQueue();
              onOpenChange(false);
            }}>
            <Ionicons name="trash-outline" size={14} color={palette.textSecondary} />
            <Text color={palette.textSecondary} fontSize={12.5} fontWeight="600">
              清空
            </Text>
          </XStack>
        </XStack>

        <FlatList
          data={queue}
          keyExtractor={(track, itemIndex) => `${track.hash}-${itemIndex}`}
          showsVerticalScrollIndicator={false}
          scrollEnabled={listScrollable}
          bounces={listScrollable}
          alwaysBounceVertical={false}
          overScrollMode="never"
          initialNumToRender={initialRows}
          maxToRenderPerBatch={batchRows}
          updateCellsBatchingPeriod={0}
          windowSize={renderAllRows ? 51 : 25}
          removeClippedSubviews={false}
          nestedScrollEnabled
          getItemLayout={(_, itemIndex) => ({
            length: QUEUE_ITEM_HEIGHT,
            offset: QUEUE_ITEM_HEIGHT * itemIndex,
            index: itemIndex,
          })}
          style={{ height: listHeight }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item: track, index: itemIndex }) => {
            const active = itemIndex === index;
            return (
              <XStack
                height={QUEUE_ITEM_HEIGHT}
                alignItems="center"
                gap={12}
                paddingHorizontal={12}
                borderRadius={14}
                backgroundColor={active ? palette.accentSoft : 'transparent'}
                transition="quickest"
                pressStyle={{ opacity: 0.65 }}
                onPress={() => void playerActions.jumpTo(itemIndex)}>
                <XStack width={34} flexShrink={0} justifyContent="center">
                  {active ? (
                    <Ionicons name="pulse" size={16} color={palette.accent} />
                  ) : (
                    <Text
                      width={34}
                      numberOfLines={1}
                      textAlign="center"
                      color={palette.textTertiary}
                      fontSize={12.5}
                      fontVariant={['tabular-nums']}>
                      {itemIndex + 1}
                    </Text>
                  )}
                </XStack>
                <YStack flex={1} gap={1}>
                  <Text
                    color={active ? palette.accent : palette.text}
                    fontSize={14.5}
                    fontWeight={active ? '700' : '500'}
                    numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text color={palette.textTertiary} fontSize={11.5} numberOfLines={1}>
                    {track.artist || '未知歌手'}
                  </Text>
                </YStack>
                <XStack
                  width={30}
                  height={30}
                  alignItems="center"
                  justifyContent="center"
                  transition="quickest"
                  pressStyle={{ opacity: 0.5, scale: 0.9 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    playerActions.removeAt(itemIndex);
                  }}>
                  <Ionicons name="close" size={15} color={palette.textTertiary} />
                </XStack>
              </XStack>
            );
          }}
        />
      </Sheet.Frame>
    </Sheet>
  );
}
