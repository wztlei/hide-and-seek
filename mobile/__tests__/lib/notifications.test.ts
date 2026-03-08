import Toast from 'react-native-toast-message';

import { toast } from '../../lib/notifications';

// Toast is mocked via jest.setup.ts
const mockShow = Toast.show as jest.Mock;

describe('toast wrapper', () => {
  beforeEach(() => mockShow.mockClear());

  it('toast.success shows a success toast', () => {
    toast.success('All good!');
    expect(mockShow).toHaveBeenCalledWith({ type: 'success', text1: 'All good!' });
  });

  it('toast.error shows an error toast', () => {
    toast.error('Something broke');
    expect(mockShow).toHaveBeenCalledWith({ type: 'error', text1: 'Something broke' });
  });

  it('toast.info shows an info toast', () => {
    toast.info('FYI');
    expect(mockShow).toHaveBeenCalledWith({ type: 'info', text1: 'FYI' });
  });

  describe('toast.promise', () => {
    it('shows pending toast then success toast on resolve', async () => {
      const p = Promise.resolve(42);
      const result = await toast.promise(p, { pending: 'Loading...', success: 'Done!' });

      expect(mockShow).toHaveBeenNthCalledWith(1, { type: 'info', text1: 'Loading...' });
      expect(mockShow).toHaveBeenNthCalledWith(2, { type: 'success', text1: 'Done!' });
      expect(result).toBe(42);
    });

    it('shows error toast on rejection and re-throws', async () => {
      const p = Promise.reject(new Error('oops'));
      await expect(
        toast.promise(p, { pending: 'Loading...', error: 'Failed!' }),
      ).rejects.toThrow('oops');

      expect(mockShow).toHaveBeenLastCalledWith({ type: 'error', text1: 'Failed!' });
    });

    it('shows no toast when message strings are omitted', async () => {
      await toast.promise(Promise.resolve(), {});
      expect(mockShow).not.toHaveBeenCalled();
    });
  });
});
