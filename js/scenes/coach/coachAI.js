// AI writes pose data, never executable code. Keep the output inside the same
// reachable body-relative space as the hand targets used by Coach.
const limit = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function coachReplyPrompt(human) {
   return `You are choreographing the second half of a short VR movement duet.
The player recorded the first phrase below. Write exactly four response poses
that echo one recognizable gesture from it, then change its shape or direction.
Make the sequence distinct and playable, with alternating high/low or open/closed
movements. Do not simply copy the input poses.

Each hand is [outward, vertical relative to head, forward], in metres. The
player mirrors the coach. Keep x between -0.20 and 0.65, y between -0.70 and
0.35, z between -0.05 and 0.50. Avoid abrupt full-reach jumps. squat is 0 or 1;
use it at most once. sway is between -1 and 1.

Return ONLY a JSON object in this shape:
{"title":"TIDAL ECHO","poses":[{"a":[0.2,0.3,0.05],"b":[0.25,-0.6,0.05],"squat":0,"sway":0}]}
The title must be 2-4 short English words. poses must contain exactly four
objects. Do not include code, comments, markdown, or extra keys.

Player phrase: ${JSON.stringify(human)}`;
}

export function coachTextPrompt(description) {
   return `Create a complete, playable eight-pose choreography for a VR dance coach.
The player's creative direction is ${JSON.stringify(description)}.
Interpret its mood and imagery through movement, rather than writing a story.
Make the eight poses meaningfully different, with a smooth transition from the
last back to the first. Vary which hand leads; include open/closed and high/low
shapes. Keep it comfortable to perform in a small standing play area.

Each hand is [outward, vertical relative to head, forward], in metres. The
player mirrors the coach. Keep x between -0.20 and 0.65, y between -0.70 and
0.35, z between -0.05 and 0.50. Avoid abrupt full-reach jumps. squat is 0 or 1;
use it at most once. sway is between -1 and 1.

Return ONLY a JSON object with exactly eight poses and a short 2-4 word English title:
{"title":"UNDERWATER DRIFT","poses":[{"a":[0.2,0.3,0.05],"b":[0.25,-0.6,0.05],"squat":0,"sway":0}]}
Do not include code, comments, markdown, or extra keys.`;
}

export function validateCoachReply(reply, count = 4) {
   if (!reply || !Array.isArray(reply.poses) || reply.poses.length !== count)
      throw new Error(`AI must return exactly ${count} poses`);
   const hand = value => {
      if (!Array.isArray(value) || value.length !== 3 ||
          !value.every(n => typeof n === 'number' && Number.isFinite(n)))
         throw new Error('AI returned an invalid hand position');
      return [limit(value[0], -.2, .65), limit(value[1], -.7, .35), limit(value[2], -.05, .5)];
   };
   const poses = reply.poses.map(p => {
      if (!p || typeof p !== 'object') throw new Error('AI returned an invalid pose');
      const a = hand(p.a), b = hand(p.b);
      const sway = typeof p.sway === 'number' && Number.isFinite(p.sway) ? limit(p.sway, -1, 1) : 0;
      return { a, b, squat: p.squat === 1 ? 1 : 0, sway, feet: 0 };
   });
   // Keep the AI phrase suitable for a standing player even if the model ignores
   // the instruction to use a squat at most once.
   let squats = 0;
   for (const p of poses) if (p.squat && ++squats > 1) p.squat = 0;
   const title = typeof reply.title === 'string'
      ? reply.title.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28)
      : '';
   return { title: title || 'MOVEMENT ECHO', poses };
}
