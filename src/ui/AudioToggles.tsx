import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeAudio, unlockAudio, type Channel } from './audio';
import { sfx } from './sound';

const snapshot = () => `${isMuted('music') ? 1 : 0}${isMuted('sfx') ? 1 : 0}`;

/** Separate on/off switches for music and sound effects. */
export function AudioToggles({ className = 'btn ghost' }: { className?: string }) {
  useSyncExternalStore(subscribeAudio, snapshot);
  const toggle = (ch: Channel) => {
    unlockAudio();
    setMuted(ch, !isMuted(ch));
    if (ch === 'sfx' && !isMuted('sfx')) sfx.click();
  };
  return (
    <>
      <button type="button" className={className} aria-pressed={!isMuted('music')} onClick={() => toggle('music')}>
        Music {isMuted('music') ? 'off' : 'on'}
      </button>
      <button type="button" className={className} aria-pressed={!isMuted('sfx')} onClick={() => toggle('sfx')}>
        SFX {isMuted('sfx') ? 'off' : 'on'}
      </button>
    </>
  );
}
