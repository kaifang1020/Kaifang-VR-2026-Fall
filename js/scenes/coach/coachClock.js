// Keep all viewers on the same choreography beat. The first connected headset
// supplies the clock; a desktop viewer follows its samples between messages.
export function createCoachClock() {
   let source = 'local', sampleTime = null, anchorTime = 0, anchorMono = 0;

   return ({ owner, self, sample, now, mono }) => {
      const remote = owner != null && String(owner) !== String(self) &&
                     sample && String(sample.owner) === String(owner) &&
                     Number.isFinite(sample.time);
      const nextSource = remote ? 'remote:' + owner : 'local';
      const changed = source !== nextSource;
      if (changed) sampleTime = null;
      source = nextSource;

      if (remote) {
         if (sampleTime !== sample.time) {
            sampleTime = sample.time;
            anchorTime = sample.time;
            anchorMono = mono;
         }
         return { time: anchorTime + mono - anchorMono, changed };
      }
      return { time: now, changed };
   };
}
