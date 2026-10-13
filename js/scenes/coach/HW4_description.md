**Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw4
**Scene:** `coach` (code in `js/scenes/coach/`, see `README.md` there)

**AI choreography for Follow the Coach.** My ongoing project is a VR dance and
fitness coach that two people follow together. This week the AI becomes a
choreographer, using the course's `aiquery.js` framework (`askAIJson` in the
browser, the server's `/api/aiquery` route, and the OpenAI key kept on the server
in `.env`). There are two ways to use it.

1. **A movement duet.** Point at the coach and hold the trigger to record up to
   four poses with your own body. When you release, your phrase starts playing at
   once, and the AI is asked to answer it: four new poses that echo one gesture
   from your phrase and then change its shape or direction. Your phrase and the
   AI's reply then loop together as one routine. The coach turns purple while it
   performs the AI's part.
2. **A routine from words.** In the browser view, open the `AI CHOREOGRAPHY`
   panel and describe a movement idea, for example "drifting underwater, then
   reaching for the surface". The AI turns it into a complete eight-pose routine
   with a title. The prompt and the generation status appear on a 3D board beside
   the coach, including Chinese or other non-English text. Someone at a computer
   can write the prompt while the other player is already in the headset.

**How AI output becomes VR content.** The AI never writes code. It returns JSON
pose data in the same body-relative coordinates the game already uses: for each
hand, [outward, height relative to the head, forward]. The browser checks every
reply: it needs the right number of poses, every number is clamped into a
comfortable reach, and squats are limited to one. Only the validated routine goes
into the shared Coach state, so both players see and dance the same AI routine,
and START plays a scored round with it. If the request fails or times out, your
recorded phrase still plays and the scene shows `AI UNAVAILABLE`. An answer to an
older request is discarded, and DANCE or FITNESS cancels and restores the built-in
routines.

**What I learned.** Asking for structured data instead of free text is what makes
AI usable in a live VR scene: the scene can check it, bound it, and share it like
any other state. I also found why the prompt board was blank in the headset but
fine on a desktop. In VR, the renderer that draws the controller models re-binds
the low texture units every frame, and the board's canvas texture was on one of
them, so the board now uses a unit of its own. The branch also includes last
week's fix for the shared team combo on slow networks.

**Tests:** `node --test js/scenes/coach/*.test.mjs js/util/aiquery.test.mjs`
cover the prompts, the validation of AI replies, the prompt panel and board, and
the whole scene with a fake renderer and clock.

**Not yet verified in a headset:** the prompt board after the texture-unit fix.
