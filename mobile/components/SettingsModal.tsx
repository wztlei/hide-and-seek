import { useStore } from '@nanostores/react';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { thunderforestApiKey } from '../lib/context';
import { toast } from '../lib/notifications';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SettingsModal({ visible, onClose }: Props) {
  const $tfKey = useStore(thunderforestApiKey);
  const [draft, setDraft] = useState($tfKey);
  const [masked, setMasked] = useState(true);

  // Sync draft when modal opens
  useEffect(() => {
    if (visible) setDraft($tfKey);
  }, [visible, $tfKey]);

  function save() {
    thunderforestApiKey.set(draft.trim());
    toast.success('Settings saved');
    onClose();
  }

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kvWrapper}
        >
          {/* Prevent backdrop tap from closing when tapping the sheet itself */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Settings</Text>

            <Text style={styles.label}>Thunderforest API Key</Text>
            <Text style={styles.hint}>
              Used for the Transport map style. Get a free key at{' '}
              <Text style={styles.hintLink}>thunderforest.com</Text>.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                secureTextEntry={masked}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Paste your API key here"
                placeholderTextColor="#aaa"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setMasked((m) => !m)}
                hitSlop={8}
              >
                <Ionicons
                  name={masked ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#666"
                />
              </Pressable>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.btn, styles.cancelBtn, pressed && styles.pressed]}
                onPress={onClose}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.btn, styles.saveBtn, pressed && styles.pressed]}
                onPress={save}
              >
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  kvWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  hintLink: {
    color: '#2A81CB',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: '#111',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  eyeButton: {
    paddingLeft: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f0f0f0',
  },
  saveBtn: {
    backgroundColor: '#2A81CB',
  },
  pressed: {
    opacity: 0.75,
  },
  cancelText: {
    fontSize: 16,
    color: '#444',
    fontWeight: '500',
  },
  saveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
