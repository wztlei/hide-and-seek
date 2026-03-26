import { StyleSheet } from "react-native";

export const editorStyles = StyleSheet.create({
    radiusInput: {
        width: 80,
        height: 44,
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        paddingHorizontal: 12,
        fontSize: 18,
        color: "#1f2937",
        backgroundColor: "#fff",
        textAlign: "center",
    },
    segmentRow: {
        flexDirection: "row",
        borderWidth: 1,
        borderColor: "#d1d5db",
        borderRadius: 10,
        overflow: "hidden",
        flex: 1,
    },
    segmentItem: {
        flex: 1,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    segmentItemWide: {
        flex: 1,
        justifyContent: "center",
    },
    segmentText: {
        fontSize: 14,
        fontWeight: "500",
        color: "#6b7280",
    },
    segmentTextSelected: {
        color: "#fff",
        fontWeight: "600",
    },
    typeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
    },
});
