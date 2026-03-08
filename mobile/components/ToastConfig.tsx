import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { BaseToastProps } from 'react-native-toast-message';

type Variant = 'success' | 'error' | 'info';

const VARIANTS: Record<Variant, { icon: keyof typeof Ionicons.glyphMap; iconColor: string; accent: string }> = {
  success: { icon: 'checkmark-circle',   iconColor: '#22c55e', accent: 'rgba(34,197,94,0.15)' },
  error:   { icon: 'alert-circle',       iconColor: '#ef4444', accent: 'rgba(239,68,68,0.15)' },
  info:    { icon: 'information-circle', iconColor: '#60a5fa', accent: 'rgba(96,165,250,0.15)' },
};

function ToastItem({ text1, variant }: BaseToastProps & { variant: Variant }) {
  const { icon, iconColor, accent } = VARIANTS[variant];
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: accent }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.message} numberOfLines={2}>{text1}</Text>
    </View>
  );
}

export const toastConfig = {
  success: (props: BaseToastProps) => <ToastItem {...props} variant="success" />,
  error:   (props: BaseToastProps) => <ToastItem {...props} variant="error" />,
  info:    (props: BaseToastProps) => <ToastItem {...props} variant="info" />,
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    color: '#f5f5f5',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
});
