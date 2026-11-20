import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/core/errors';

describe('errorMessage', () => {
  it('removes terminal color codes', () => {
    const esc = String.fromCharCode(27);
    const err = new Error(`net::ERR_CONNECTION_REFUSED ${esc}[2mlog${esc}[22m`);
    expect(errorMessage(err)).toBe('Error: net::ERR_CONNECTION_REFUSED log');
  });
});
