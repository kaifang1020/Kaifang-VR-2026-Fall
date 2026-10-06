/*
 * Reliable message passing for Echo Garden, on top of server.init/send/sync.
 *
 * Two problems in the course framework (server/client.js) made two pages drift:
 *
 * 1. Lost batches. A batch of messages from client id arrives as
 *    window['__echoGarden_updates__' + id] = batch, and only the next
 *    server.sync (inside model.animate) hands it to our callback. A second
 *    batch that arrives before that frame REPLACES the first. A hidden tab
 *    runs no frames at all, so it keeps only the last batch it was sent.
 *    Fix: give each of those inboxes a setter that appends instead.
 *
 * 2. Snapshots that are slightly old can replace a newer local state. This
 *    scene disables the course framework's periodic full-state broadcast and
 *    exchanges scene-specific snapshots on join. If a startup snapshot still
 *    replaces the state, replay the most recent local messages.
 */

const REPLAY_SECONDS = 1;

export function createGardenSync({ server, win = window, name, apply, onRemote = () => {},
                                   snapshot = null, mergeSnapshot = () => {},
                                   now = () => performance.now() / 1000 }) {
   const prefix = '__' + name + '_updates__';
   const inboxes = new Set();
   const recent = [];                 // my own messages: {message, time}
   let seen = null;                   // the state object I last worked on
   let requestedSnapshot = false;

   const keepEveryBatch = id => {
      const key = prefix + id;
      if (inboxes.has(key)) return;
      inboxes.add(key);
      let pending = {}, count = 0;
      const early = win[key];
      Object.defineProperty(win, key, {
         configurable: true,
         get: () => pending,
         set: batch => {
            if (!batch || !Object.keys(batch).length) { pending = {}; return; }   // sync emptied it
            for (const k in batch) pending[count++] = batch[k];
         },
      });
      if (early) win[key] = early;
   };

   const receive = (messages, from) => {
      for (const key in messages) {
         const message = messages[key];
         if (message?.op === 'snapshot-request') {
            if (snapshot && String(from) !== String(win.clientID))
               server.send(name,{op:'snapshot',target:message.requester,garden:structuredClone(snapshot())});
            continue;
         }
         if (message?.op === 'snapshot') {
            if (String(message.target) === String(win.clientID)) mergeSnapshot(message.garden);
            continue;
         }
         if (apply(message) && String(from) !== String(win.clientID)) onRemote(message);
      }
   };

   // The state object was replaced by a snapshot: put my newest messages back.
   const replayIfReplaced = () => {
      const state = win[name];
      if (state === seen) return;
      seen = state;
      const t = now();
      while (recent.length && t - recent[0].time > REPLAY_SECONDS) recent.shift();
      for (const { message } of recent) apply(message);
   };

   const sync = () => {
      for (const id of win.clients || []) keepEveryBatch(id);
      if (win.clientID !== undefined) keepEveryBatch(win.clientID);
      server.sync(name, receive);
      replayIfReplaced();
      if (!requestedSnapshot && snapshot && win.clientID !== undefined) {
         requestedSnapshot = true;
         server.send(name,{op:'snapshot-request',requester:win.clientID});
         server.sync(name,receive);
      }
   };

   // Keep operation messages, but do not let the master's older full-state
   // broadcast overwrite another player's newer operation. server.sync takes
   // no interval argument: the interval is a setting of the whole client, and
   // a negative one means "save to storage, but do not broadcast".
   server.syncInterval?.(-3);

   return {
      // Put the framework back the way other scenes expect it (3 s, broadcast).
      dispose: () => server.syncInterval?.(3),
      // Call once per frame, before reading the state.
      frame: sync,
      // Apply my change here at once, then tell everyone. Returns false if it changed nothing.
      dispatch: message => {
         replayIfReplaced();
         if (!apply(message)) return false;
         recent.push({ message, time: now() });
         server.send(name, message);
         // Send now: a tab that is about to be hidden may run no more frames.
         if (server.socket?.readyState === 1 && win.clients?.length) sync();
         return true;
      },
   };
}
