module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|react-native-toast-message|nanostores|@nanostores/.*|@turf/.*|d3-.*|osmtogeojson)',
  ],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  modulePaths: ['<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '@react-native-async-storage/async-storage':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    // Stub @arcgis/core (browser-only) and all subpath imports
    '^@arcgis/core(.*)$': '<rootDir>/__mocks__/arcgis-core.js',
    // Redirect src/maps/api/cache to AsyncStorage implementation
    '^(\\.\\./)*(src/maps/api/cache)$': '<rootDir>/lib/cache',
  },
};
