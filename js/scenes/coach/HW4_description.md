**Branch:** https://github.com/kaifang1020/Kaifang-VR-2026-Fall/tree/hw4
**Scene:** `coach` (code in `js/scenes/coach/`, see `README.md` there)

**Follow the Coach: AI Choreography (Assignment 4)**

Follow the Coach is my ongoing VR dance and fitness game, where two players
mirror a coach together. For this assignment, I made the AI a choreographer,
built on the `aiquery.js` starter kit.

- **Describe a dance, and the coach performs it.** Inside VR, I point at
  *TYPE A PROMPT* and type on an in-world keyboard with the controller beam (or
  pick a ready-made idea). The AI turns the description into an 8-move routine
  with a title, and both players can dance it and play a scored round. A prompt
  can also be typed from a computer while the other player is in the headset,
  including in Chinese.
- **A movement duet.** I record a short phrase with my own body, and the AI
  answers with four new moves that echo it. My moves and the AI's reply then
  loop together.

**How it works:** the AI never writes code. It returns pose data as JSON, in the
same body coordinates the game already uses. The scene checks and clamps every
reply so the moves stay safe and reachable, then shares the routine with both
headsets. If the AI fails, the game keeps playing.

**One thing I learned:** the prompt panel was blank in the headset but fine on
the desktop. In VR, the renderer that draws the controller models re-binds the
low texture units every frame, which replaced my canvas texture. Moving it to
its own texture unit fixed it.

**Tests:** `node --test js/scenes/coach/*.test.mjs js/util/aiquery.test.mjs`
