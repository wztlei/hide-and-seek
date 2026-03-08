import * as turf from '@turf/turf';
import * as Clipboard from 'expo-clipboard';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { addQuestion } from '../lib/context';
import { toast } from '../lib/notifications';

interface Props {
  visible: boolean;
  coordinate: [number, number] | null; // [longitude, latitude] — GeoJSON order
  onClose: () => void;
}

interface MenuItem {
  label: string;
  onPress: () => void;
}

export function MapContextMenu({ visible, coordinate, onClose }: Props) {
  if (!coordinate) return null;

  const [lng, lat] = coordinate;

  const items: MenuItem[] = [
    {
      label: 'Add Radius',
      onPress: () => {
        addQuestion({ id: 'radius', data: { lat, lng } });
        onClose();
      },
    },
    {
      label: 'Add Thermometer',
      onPress: () => {
        const dest = turf.destination([lng, lat], 5, 90, { units: 'miles' });
        addQuestion({
          id: 'thermometer',
          data: {
            latA: lat,
            lngA: lng,
            latB: dest.geometry.coordinates[1],
            lngB: dest.geometry.coordinates[0],
          },
        });
        onClose();
      },
    },
    {
      label: 'Add Tentacles',
      onPress: () => {
        addQuestion({ id: 'tentacles', data: { lat, lng } });
        onClose();
      },
    },
    {
      label: 'Add Matching',
      onPress: () => {
        addQuestion({ id: 'matching', data: { lat, lng } });
        onClose();
      },
    },
    {
      label: 'Add Measuring',
      onPress: () => {
        addQuestion({ id: 'measuring', data: { lat, lng } });
        onClose();
      },
    },
    {
      label: 'Copy Coordinates',
      onPress: async () => {
        const absLat = Math.abs(lat).toFixed(6);
        const absLng = Math.abs(lng).toFixed(6);
        const text = `${absLat}°${lat >= 0 ? 'N' : 'S'}, ${absLng}°${lng >= 0 ? 'E' : 'W'}`;
        await Clipboard.setStringAsync(text);
        toast.success('Coordinates copied!');
        onClose();
      },
    },
  ];

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.menu}>
          <Text style={styles.coords}>
            {Math.abs(lat).toFixed(4)}°{lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(lng).toFixed(4)}°{lng >= 0 ? 'E' : 'W'}
          </Text>
          {items.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={item.onPress}
            >
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable
            style={({ pressed }) => [styles.item, styles.cancelItem, pressed && styles.itemPressed]}
            onPress={onClose}
          >
            <Text style={[styles.itemText, styles.cancelText]}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: 'white',
    borderRadius: 14,
    width: 270,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  coords: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f7f7f7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  itemPressed: {
    backgroundColor: '#eef4ff',
  },
  itemText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  cancelItem: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
    borderBottomWidth: 0,
  },
  cancelText: {
    color: '#999',
    textAlign: 'center',
  },
});
