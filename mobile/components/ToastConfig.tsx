import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
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
    <View
      className="mx-4 flex-row items-center bg-zinc-900 rounded-2xl px-4 py-3.5 gap-3"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <View
        className="w-9 h-9 rounded-full items-center justify-center"
        style={{ backgroundColor: badgeColor }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text className="flex-1 text-zinc-100 text-[15px] font-medium leading-5" numberOfLines={2}>
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
