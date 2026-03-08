import { PointAnnotation } from '@maplibre/maplibre-react-native';
import { useStore } from '@nanostores/react';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { ICON_COLORS } from '../../src/maps/api/constants';
import type { Question } from '../../src/maps/schema';
import { hiderMode, questionModified, questions, triggerLocalRefresh } from '../lib/context';

// Map icon color names to hex values matching the web marker colors
const COLOR_MAP: Record<string, string> = {
  blue: '#2A81CB',
  red: '#CB2B3E',
  green: '#2AAD27',
  orange: '#CB8427',
  yellow: '#CAC428',
  violet: '#9C2BCB',
  grey: '#7B7B7B',
  black: '#3D3D3D',
};

interface MarkerProps {
  id: string;
  coordinate: [number, number]; // [longitude, latitude] — GeoJSON / MapLibre order
  color: string;
  onDragEnd?: (coordinate: [number, number]) => void;
}

function QuestionMarker({ id, coordinate, color, onDragEnd }: MarkerProps) {
  const hexColor = COLOR_MAP[color] ?? '#2A81CB';
  return (
    <PointAnnotation
      id={id}
      coordinate={coordinate}
      draggable={!!onDragEnd}
      onDragEnd={(event: any) => {
        const coords = event.geometry?.coordinates as [number, number] | undefined;
        if (coords && onDragEnd) onDragEnd(coords);
      }}
    >
      <View style={[styles.marker, { backgroundColor: hexColor }]} />
    </PointAnnotation>
  );
}

export function DraggableMarkers() {
  useStore(triggerLocalRefresh);
  const $questions = useStore(questions);
  const $hiderMode = useStore(hiderMode);

  return (
    <Fragment>
      {$hiderMode !== false && (
        <QuestionMarker
          id="hider-marker"
          coordinate={[$hiderMode.longitude, $hiderMode.latitude]}
          color="green"
          onDragEnd={([lng, lat]) => hiderMode.set({ latitude: lat, longitude: lng })}
        />
      )}

      {$questions.map((question: Question) => {
        if (!question.data?.drag) return null;
        if (question.id === 'matching' && question.data.type === 'custom-zone') return null;

        switch (question.id) {
          case 'radius':
          case 'tentacles':
          case 'matching':
          case 'measuring':
            return (
              <QuestionMarker
                key={question.key}
                id={`marker-${question.key}`}
                coordinate={[question.data.lng, question.data.lat]}
                color={question.data.color}
                onDragEnd={([lng, lat]) => {
                  question.data.lat = lat;
                  question.data.lng = lng;
                  questionModified();
                }}
              />
            );
          case 'thermometer':
            return (
              <Fragment key={question.key}>
                <QuestionMarker
                  id={`marker-a-${question.key}`}
                  coordinate={[question.data.lngA, question.data.latA]}
                  color={question.data.colorA}
                  onDragEnd={([lng, lat]) => {
                    question.data.latA = lat;
                    question.data.lngA = lng;
                    questionModified();
                  }}
                />
                <QuestionMarker
                  id={`marker-b-${question.key}`}
                  coordinate={[question.data.lngB, question.data.latB]}
                  color={question.data.colorB}
                  onDragEnd={([lng, lat]) => {
                    question.data.latB = lat;
                    question.data.lngB = lng;
                    questionModified();
                  }}
                />
              </Fragment>
            );
          default:
            return null;
        }
      })}
    </Fragment>
  );
}

export { ICON_COLORS };

const styles = StyleSheet.create({
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },
});
