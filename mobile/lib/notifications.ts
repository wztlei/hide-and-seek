/**
 * Thin wrapper over react-native-toast-message matching react-toastify call sites.
 * Drop-in replacement for: import { toast } from 'react-toastify'
 */
import Toast from "react-native-toast-message";

export const toast = {
    success: (message: string) =>
        Toast.show({ type: "success", text1: message }),

    error: (message: string) => Toast.show({ type: "error", text1: message }),

    info: (message: string) => Toast.show({ type: "info", text1: message }),

    promise: async <T>(
        promise: Promise<T>,
        messages: { pending?: string; success?: string; error?: string },
    ): Promise<T> => {
        if (messages.pending) {
            Toast.show({ type: "info", text1: messages.pending });
        }
        try {
            const result = await promise;
            if (messages.success) {
                Toast.show({ type: "success", text1: messages.success });
            }
            return result;
        } catch (e) {
            if (messages.error) {
                Toast.show({ type: "error", text1: messages.error });
            }
            throw e;
        }
    },
};
