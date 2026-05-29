import { describe, expect, it } from 'vitest';
import { MOH_CLASS, mohClass, renderMohSetLine } from '../moh';

describe('music on hold helper', () => {
  it('exposes a single default class', () => {
    expect(MOH_CLASS).toBe('default');
    expect(mohClass()).toBe('default');
  });

  it('renders a CHANNEL(musicclass) Set line', () => {
    expect(renderMohSetLine()).toBe('Set(CHANNEL(musicclass)=default)');
  });
});
