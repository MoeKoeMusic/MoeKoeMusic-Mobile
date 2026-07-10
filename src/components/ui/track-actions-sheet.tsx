import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet, Spinner, Text, XStack, YStack } from 'tamagui';

import { Artwork } from '@/components/ui/artwork';
import { showToast } from '@/components/ui/toast';
import { isLoggedIn } from '@/features/account/user-api';
import { libraryActions, useIsLiked, useLibrary, type LibraryPlaylist } from '@/features/library/store';
import type { PlayerTrack } from '@/features/player/types';
import { usePalette } from '@/hooks/use-palette';
import { shareTrack } from '@/lib/share';

type SheetBaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ActionRow({
  icon,
  label,
  danger = false,
  active = false,
  busy = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const color = danger ? palette.danger : active ? palette.accent : palette.text;

  return (
    <XStack
      alignItems="center"
      gap={14}
      paddingVertical={13}
      paddingHorizontal={14}
      borderRadius={14}
      opacity={busy ? 0.55 : 1}
      transition="quickest"
      pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
      onPress={busy ? undefined : onPress}>
      <XStack width={26} alignItems="center" justifyContent="center">
        {busy ? <Spinner size="small" color={palette.accent} /> : icon}
      </XStack>
      <Text flex={1} color={color} fontSize={15} fontWeight="600">
        {label}
      </Text>
    </XStack>
  );
}

/** 新建歌单弹窗;创建成功后回调新歌单 listid。 */
export function CreatePlaylistSheet({
  open,
  onOpenChange,
  onCreated,
}: SheetBaseProps & {
  onCreated?: (listid: string, name: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setBusy(false);
    }
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }

    setBusy(true);
    try {
      const listid = await libraryActions.createPlaylist(trimmed);
      showToast(`歌单「${trimmed}」已创建`);
      onOpenChange(false);
      onCreated?.(listid, trimmed);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建歌单失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      modal={false}
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      moveOnKeyboardChange
      transition="medium"
      zIndex={110000}>
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
        paddingHorizontal="$4"
        paddingBottom={Math.max(insets.bottom, 16) + 8}>
        <YStack gap={16}>
          <Text color={palette.text} fontSize={17} fontWeight="700">
            新建歌单
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="歌单名称"
            placeholderTextColor={palette.textTertiary}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
            style={[
              styles.input,
              {
                color: palette.text,
                backgroundColor: palette.cardAlt,
                borderColor: palette.border,
              },
            ]}
          />
          <XStack gap={12}>
            <XStack
              flex={1}
              height={44}
              alignItems="center"
              justifyContent="center"
              borderRadius={22}
              backgroundColor={palette.cardAlt}
              transition="quickest"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => onOpenChange(false)}>
              <Text color={palette.textSecondary} fontSize={14.5} fontWeight="600">
                取消
              </Text>
            </XStack>
            <XStack
              flex={1}
              height={44}
              alignItems="center"
              justifyContent="center"
              gap={8}
              borderRadius={22}
              backgroundColor={palette.accent}
              opacity={name.trim() && !busy ? 1 : 0.5}
              transition="quickest"
              pressStyle={{ opacity: 0.85 }}
              onPress={() => void handleCreate()}>
              {busy ? <Spinner size="small" color={palette.onAccent} /> : null}
              <Text color={palette.onAccent} fontSize={14.5} fontWeight="700">
                创建
              </Text>
            </XStack>
          </XStack>
        </YStack>
      </Sheet.Frame>
    </Sheet>
  );
}

export type TrackRemovalContext = {
  /** 所在歌单的 listid(写操作用)。 */
  listid: string;
  /** 移除成功后由页面同步本地列表。 */
  onRemoved: (track: PlayerTrack) => void;
};

/**
 * 歌曲操作面板:喜欢 / 收藏到歌单 / 分享,在自己歌单上下文里额外提供"从歌单移除"。
 * modal={false} 内联渲染,原生 modal 页(/player)内也能正常弹出。
 */
export function TrackActionsSheet({
  open,
  onOpenChange,
  track,
  removal,
  initialView = 'actions',
}: SheetBaseProps & {
  track: PlayerTrack | null;
  removal?: TrackRemovalContext;
  initialView?: 'actions' | 'pick';
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const liked = useIsLiked(track?.hash);
  const [view, setView] = useState<'actions' | 'pick'>(initialView);
  const [busyKey, setBusyKey] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetState, setResetState] = useState({ open, initialView });

  if (open !== resetState.open || (open && initialView !== resetState.initialView)) {
    setResetState({ open, initialView });
    if (open) {
      setView(initialView);
      setBusyKey('');
    }
  }

  useEffect(() => {
    if (open && isLoggedIn()) {
      void libraryActions.ensure().catch(() => undefined);
    }
  }, [open]);

  const myPlaylists = library.playlists.filter((item) => item.isMine);

  async function run(key: string, action: () => Promise<void>) {
    if (busyKey) {
      return;
    }
    setBusyKey(key);
    try {
      await action();
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败');
    } finally {
      setBusyKey('');
    }
  }

  function handleToggleLike(current: PlayerTrack) {
    void run('like', async () => {
      const result = await libraryActions.toggleLike(current);
      showToast(result === 'liked' ? '已加入「我喜欢」' : '已移出「我喜欢」');
      onOpenChange(false);
    });
  }

  function handleAddTo(playlist: LibraryPlaylist, current: PlayerTrack) {
    void run(`add-${playlist.listid}`, async () => {
      await libraryActions.addToPlaylist(playlist, [current]);
      showToast(`已收藏到「${playlist.name}」`);
      onOpenChange(false);
    });
  }

  function handleRemove(current: PlayerTrack, context: TrackRemovalContext) {
    void run('remove', async () => {
      await libraryActions.removeFromPlaylist(context.listid, [current]);
      context.onRemoved(current);
      showToast('已从歌单移除');
      onOpenChange(false);
    });
  }

  function handleShare(current: PlayerTrack) {
    onOpenChange(false);
    void shareTrack(current);
  }

  return (
    <>
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
          paddingBottom={Math.max(insets.bottom, 16) + 6}>
          {track ? (
            <YStack paddingHorizontal="$3">
              <XStack
                alignItems="center"
                gap={12}
                paddingHorizontal={14}
                paddingBottom={12}
                borderBottomWidth={StyleSheet.hairlineWidth}
                borderBottomColor={palette.border}>
                <Artwork uri={track.coverUrl} size={44} radius={10} />
                <YStack flex={1} gap={2}>
                  <Text color={palette.text} fontSize={15} fontWeight="700" numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text color={palette.textTertiary} fontSize={12} numberOfLines={1}>
                    {track.artist || '未知歌手'}
                  </Text>
                </YStack>
                {view === 'pick' ? (
                  <Text
                    color={palette.accent}
                    fontSize={13}
                    fontWeight="600"
                    pressStyle={{ opacity: 0.6 }}
                    onPress={() => setView('actions')}
                    suppressHighlighting>
                    返回
                  </Text>
                ) : null}
              </XStack>

              {view === 'actions' ? (
                <YStack paddingTop={6}>
                  <ActionRow
                    icon={
                      <Ionicons
                        name={liked ? 'heart' : 'heart-outline'}
                        size={21}
                        color={liked ? palette.accent : palette.text}
                      />
                    }
                    label={liked ? '从「我喜欢」移除' : '加入「我喜欢」'}
                    active={liked}
                    busy={busyKey === 'like'}
                    onPress={() => handleToggleLike(track)}
                  />
                  <ActionRow
                    icon={<MaterialCommunityIcons name="playlist-plus" size={22} color={palette.text} />}
                    label="收藏到歌单"
                    onPress={() => {
                      if (!isLoggedIn()) {
                        showToast('请先登录');
                        return;
                      }
                      setView('pick');
                    }}
                  />
                  <ActionRow
                    icon={<Ionicons name="share-social-outline" size={20} color={palette.text} />}
                    label="分享"
                    onPress={() => handleShare(track)}
                  />
                  {removal ? (
                    <ActionRow
                      icon={<Ionicons name="remove-circle-outline" size={21} color={palette.danger} />}
                      label="从歌单移除"
                      danger
                      busy={busyKey === 'remove'}
                      onPress={() => handleRemove(track, removal)}
                    />
                  ) : null}
                </YStack>
              ) : (
                <YStack paddingTop={6}>
                  <ActionRow
                    icon={<Ionicons name="add-circle-outline" size={21} color={palette.accent} />}
                    label="新建歌单"
                    active
                    onPress={() => setCreateOpen(true)}
                  />
                  <Sheet.ScrollView showsVerticalScrollIndicator={false} style={styles.pickList}>
                    {library.status === 'loading' && !myPlaylists.length ? (
                      <YStack alignItems="center" paddingVertical={26}>
                        <Spinner color={palette.accent} />
                      </YStack>
                    ) : myPlaylists.length ? (
                      myPlaylists.map((playlist) => (
                        <XStack
                          key={playlist.listid}
                          alignItems="center"
                          gap={12}
                          paddingVertical={9}
                          paddingHorizontal={14}
                          borderRadius={14}
                          opacity={busyKey === `add-${playlist.listid}` ? 0.55 : 1}
                          transition="quickest"
                          pressStyle={{ opacity: 0.6, backgroundColor: palette.cardAlt }}
                          onPress={() => handleAddTo(playlist, track)}>
                          <Artwork uri={playlist.coverUrl} size={40} radius={10} />
                          <YStack flex={1} gap={2}>
                            <Text color={palette.text} fontSize={14.5} fontWeight="600" numberOfLines={1}>
                              {playlist.name}
                            </Text>
                            <Text color={palette.textTertiary} fontSize={11.5}>
                              {playlist.count} 首
                            </Text>
                          </YStack>
                          {busyKey === `add-${playlist.listid}` ? (
                            <Spinner size="small" color={palette.accent} />
                          ) : (
                            <Ionicons name="add" size={18} color={palette.textTertiary} />
                          )}
                        </XStack>
                      ))
                    ) : (
                      <YStack alignItems="center" paddingVertical={26} gap={6}>
                        <Text color={palette.textTertiary} fontSize={13}>
                          还没有自己的歌单
                        </Text>
                      </YStack>
                    )}
                  </Sheet.ScrollView>
                </YStack>
              )}
            </YStack>
          ) : null}
        </Sheet.Frame>
      </Sheet>

      <CreatePlaylistSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(listid, name) => {
          if (!track) {
            return;
          }
          const created: LibraryPlaylist = {
            listid,
            gid: '',
            name,
            coverUrl: null,
            count: 0,
            isMine: true,
            isLike: false,
          };
          void run(`add-${listid}`, async () => {
            await libraryActions.addToPlaylist(created, [track]);
            showToast(`已收藏到「${name}」`);
            onOpenChange(false);
          });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 46,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  pickList: {
    maxHeight: 320,
  },
});
