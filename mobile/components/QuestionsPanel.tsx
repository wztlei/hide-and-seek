import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../lib/colors';
import { addQuestion, questions } from '../lib/context';
import type { Question, Questions } from '../../src/maps/schema';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Question type metadata ────────────────────────────────────────────────────

type QuestionId = 'radius' | 'thermometer' | 'tentacles' | 'matching' | 'measuring';

const QUESTION_TYPES: Array<{
  id: QuestionId;
  label: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}> = [
  { id: 'radius', label: 'Radius', subtitle: 'Is the hider within a set distance of a point?', icon: 'disc-outline' },
  { id: 'thermometer', label: 'Thermometer', subtitle: 'Is the hider closer to point A or point B?', icon: 'thermometer-outline' },
  { id: 'tentacles', label: 'Tentacles', subtitle: 'Is the hider within range of a type of place?', icon: 'pie-chart-outline' },
  { id: 'matching', label: 'Matching', subtitle: 'Is the hider in the same zone or near the same feature?', icon: 'copy-outline' },
  { id: 'measuring', label: 'Measuring', subtitle: 'Is the hider closer to a feature than the seeker?', icon: 'resize-outline' },
];

function iconForType(type: Question['id']): React.ComponentProps<typeof Ionicons>['name'] {
  return QUESTION_TYPES.find((q) => q.id === type)?.icon ?? 'help-circle-outline';
}

function labelForType(type: Question['id']): string {
  return QUESTION_TYPES.find((q) => q.id === type)?.label ?? type;
}

// ── Default payloads ──────────────────────────────────────────────────────────

function defaultPayloadForType(id: QuestionId) {
  switch (id) {
    case 'radius':
      return { id: 'radius' as const, data: { lat: 0, lng: 0 } };
    case 'thermometer':
      return { id: 'thermometer' as const, data: { latA: 0, lngA: 0, latB: 0, lngB: 0.1 } };
    case 'tentacles':
      return { id: 'tentacles' as const, data: { lat: 0, lng: 0 } };
    case 'matching':
      return { id: 'matching' as const, data: { lat: 0, lng: 0, type: 'airport' as const } };
    case 'measuring':
      return { id: 'measuring' as const, data: { lat: 0, lng: 0, type: 'coastline' as const } };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function QuestionsPanel({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const $questions = useStore(questions) as Questions;

  const sheetRef = useRef<BottomSheet>(null);
  const slideX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideX.setValue(0);
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSheetChange = useCallback(
    (index: number) => { if (index === -1) onClose(); },
    [onClose],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  function goToAddQuestion() {
    Animated.spring(slideX, { toValue: -SCREEN_WIDTH, useNativeDriver: true }).start();
  }

  function goBack() {
    Animated.spring(slideX, { toValue: 0, useNativeDriver: true }).start();
  }

  function handleAddQuestion(id: QuestionId) {
    addQuestion(defaultPayloadForType(id));
    goBack();
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['100%']}
      topInset={insets.top}
      enablePanDownToClose
      onClose={onClose}
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.sheetBackground}
    >
      {/* Sliding inner container — two screens side by side */}
      <Animated.View style={[styles.innerRow, { transform: [{ translateX: slideX }] }]}>

        {/* ── Screen 1: Questions list ────────────────────────────────────── */}
        <View style={styles.screen}>
          <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
            <Text className="flex-1 text-xl font-semibold text-gray-800">Questions</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 active:opacity-60">
              <Ionicons name="close" size={24} color="#555" />
            </Pressable>
          </View>

          <BottomSheetScrollView className="flex-1" contentContainerStyle={{ paddingVertical: 8 }}>
            {$questions.length === 0 ? (
              <Text className="text-center text-gray-400 text-lg mt-10">No questions yet</Text>
            ) : (
              $questions.map((q, i) => (
                <View key={q.key ?? i} className="flex-row items-center px-4 py-3 gap-3 border-b border-gray-100">
                  <Ionicons name={iconForType(q.id)} size={22} color={colors.PRIMARY} />
                  <Text className="text-lg text-gray-800">{labelForType(q.id)}</Text>
                </View>
              ))
            )}
          </BottomSheetScrollView>

          <View
            className="p-4 border-t border-gray-100"
            style={{ paddingBottom: insets.bottom + 16 }}
          >
            <Pressable
              onPress={goToAddQuestion}
              className="flex-row items-center justify-center h-12 rounded-xl gap-2 active:opacity-80"
              style={{ backgroundColor: colors.PRIMARY }}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text className="text-white text-base font-semibold">Add Question</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Screen 2: Add Question picker ──────────────────────────────── */}
        <View style={styles.screen}>
          <View className="flex-row items-center px-4 py-4 border-b border-gray-100">
            <Pressable onPress={goBack} hitSlop={8} className="p-1 mr-2 active:opacity-60">
              <Ionicons name="chevron-back" size={24} color="#555" />
            </Pressable>
            <Text className="flex-1 text-xl font-semibold text-gray-800">Add Question</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 active:opacity-60">
              <Ionicons name="close" size={24} color="#555" />
            </Pressable>
          </View>

          <BottomSheetScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {QUESTION_TYPES.map(({ id, label, subtitle, icon }) => (
              <Pressable
                key={id}
                onPress={() => handleAddQuestion(id)}
                className="flex-row items-center px-4 py-3.5 gap-3.5 border-b border-gray-100 active:bg-gray-50"
              >
                <View className="w-11 h-11 rounded-xl bg-blue-50 items-center justify-center">
                  <Ionicons name={icon} size={24} color={colors.PRIMARY} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-base font-semibold text-gray-800">{label}</Text>
                  <Text className="text-sm text-gray-500 leading-snug">{subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
              </Pressable>
            ))}
          </BottomSheetScrollView>
        </View>

      </Animated.View>
    </BottomSheet>
  );
}

// StyleSheet only for values NativeWind cannot express:
// - BottomSheet style props (third-party, no className support)
// - Animated.View dynamic pixel widths
const styles = StyleSheet.create({
  sheetBackground: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: '#d1d5db',
    width: 36,
  },
  innerRow: {
    flexDirection: 'row',
    width: SCREEN_WIDTH * 2,
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
});
