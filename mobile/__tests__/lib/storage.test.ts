jest.mock('@nanostores/persistent', () => ({
  setPersistentEngine: jest.fn(),
  persistentAtom: jest.fn(),
}));

describe('storage', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('calls setPersistentEngine with AsyncStorage and listen:false', () => {
    require('../../lib/storage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPersistentEngine } = require('@nanostores/persistent');
    // The mock exports the object as module.exports (no .default)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    expect(setPersistentEngine).toHaveBeenCalledWith(AsyncStorage, { listen: false });
  });

  it('only calls setPersistentEngine once per module load', () => {
    require('../../lib/storage');
    require('../../lib/storage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { setPersistentEngine } = require('@nanostores/persistent');
    expect(setPersistentEngine).toHaveBeenCalledTimes(1);
  });
});
