import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text } from "react-native";
import { colors } from "../lib/colors";

interface Props {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
    onPress: () => void;
    color?: string;
    numberOfLines?: number;
    /** Stack icon above text instead of side-by-side. */
    vertical?: boolean;
}

/**
 * Universal icon + label action button.
 * White background with border, padding-based height, text-sm font-medium.
 * Horizontal layout (icon left of text) by default; pass `vertical` for icon-over-text.
 * Use `color` for both icon and text (defaults to indigo PRIMARY).
 */
export function ActionButton({
    icon,
    label,
    onPress,
    color = colors.PRIMARY,
    numberOfLines,
    vertical = false,
}: Props) {
    return (
        <Pressable
            onPress={onPress}
            className={`flex-1 active:opacity-70 items-center justify-center bg-white rounded-xl py-3 px-0 border border-gray-200 ${vertical ? "flex-col gap-1" : "flex-row"}`}
        >
            <Ionicons name={icon} size={vertical ? 20 : 18} color={color} />
            <Text
                style={{ color }}
                className={vertical ? "text-[11px] font-medium text-center" : "text-[13px] font-medium ml-1.5"}
                numberOfLines={vertical ? undefined : numberOfLines}
            >
                {label}
            </Text>
        </Pressable>
    );
}
