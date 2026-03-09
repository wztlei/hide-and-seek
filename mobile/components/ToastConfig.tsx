import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { BaseToastProps } from 'react-native-toast-message';

type Variant = 'success' | 'error' | 'info';

const VARIANTS: Record<Variant, { icon: keyof typeof Ionicons.glyphMap; iconColor: string; badgeColor: string }> = {
  success: { icon: 'checkmark-circle',   iconColor: '#22c55e', badgeColor: 'rgba(34,197,94,0.2)'  },
  error:   { icon: 'alert-circle',       iconColor: '#ef4444', badgeColor: 'rgba(239,68,68,0.2)'  },
  info:    { icon: 'information-circle', iconColor: '#60a5fa', badgeColor: 'rgba(96,165,250,0.2)' },
};

function ToastItem({ text1, variant }: BaseToastProps & { variant: Variant }) {
  const { icon, iconColor, badgeColor } = VARIANTS[variant];
  return (
    <View style={styles.container}>
      <View style={[styles.badge, { backgroundColor: badgeColor }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {text1}
      </Text>
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
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',   // zinc-900
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#f4f4f5',             // zinc-100
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
});
