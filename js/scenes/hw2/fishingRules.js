// Pure fishing rules: no rendering and no controllers. The scene feeds in time,
// the trigger state and strike gestures; the rules answer with one-shot events
// that the scene turns into haptics, sound, text and animation.

// Each fish announces itself with its own haptic signature before it bites:
// a number of sharp nibbles, or (for junk) one long dull rumble.
//   window: seconds the player has to strike after the bite
//   pull  : how hard it loads the line while being reeled in
export const FISH = [
   { name:'MINNOW'    , points:100, kg:[ .2, .6], nibbles:1, gap:.55, window:.95, pull:.45, weight:40 },
   { name:'BASS'      , points:200, kg:[1.2,3.0], nibbles:2, gap:.42, window:.80, pull:.70, weight:34 },
   { name:'GOLDEN KOI', points:400, kg:[3.0,6.0], nibbles:3, gap:.22, window:.60, pull:.95, weight:14 },
   { name:'OLD BOOT'  , points:-50, kg:[ .8, .8], nibbles:0, rumble:1.3, window:1.1, pull:0, weight:12, junk:true },
];

export const SNAP_AFTER = .35;      // seconds the line survives at full tension
export const LANDED_FOR = 1.6;      // seconds a catch is shown before the next cast

const clamp = (x,a,b) => Math.max(a,Math.min(b,x));

export function pickFish(r) {
   const total = FISH.reduce((sum,f) => sum+f.weight,0);
   let at = clamp(r,0,.999999)*total;
   for (const fish of FISH) if ((at -= fish.weight) < 0) return fish;
   return FISH[0];
}

export class FishingGame {
   constructor(duration = 120, lines = 3, goal = 800, random = Math.random) {
      this.duration = duration; this.maxLines = lines; this.goal = goal; this.random = random;
      this.reset(false);
   }
   reset(play = true) {
      this.phase = play ? 'playing' : 'ready';     // ready | playing | won | lost
      this.state = 'idle';                         // idle | flying | waiting | nibbling | bite | fight | landed
      this.remaining = this.duration; this.lines = this.maxLines;
      this.score = 0; this.caught = 0;
      this.fish = null; this.kg = 0; this.timer = 0; this.nibblesLeft = 0;
      this.tension = 0; this.progress = 0; this.over = 0;
      this.surging = false; this.surgeTimer = 0;
   }
   // The bobber left the rod.
   cast() {
      if (this.phase !== 'playing' || this.state !== 'idle') return false;
      this.state = 'flying';
      return true;
   }
   // The bobber came down, either in the pond or on the ground.
   land(inPond) {
      if (this.phase !== 'playing' || this.state !== 'flying') return [];
      if (!inPond) { this.state = 'idle'; return [{type:'missedPond'}]; }
      this.wait();
      return [{type:'splash'}];
   }
   wait() {
      this.state = 'waiting'; this.fish = null;
      this.timer = 1.8 + 3.2*this.random();
      this.tension = 0; this.progress = 0; this.over = 0; this.surging = false;
   }
   // Another player reached the goal first: this game is over.
   forfeit() {
      if (this.phase !== 'playing') return [];
      this.phase = 'lost'; this.state = 'idle'; this.tension = 0;
      return [{type:'lost',reason:'beaten'}];
   }
   // input: {reel: trigger held, strike: rod was just yanked upward}
   tick(dt, input = {}) {
      const events = [];
      if (this.phase !== 'playing') return events;
      dt = Math.max(0,dt);
      this.remaining = Math.max(0,this.remaining-dt);
      const strike = !!input.strike, reel = !!input.reel;

      if (this.state === 'waiting') {
         if ((this.timer -= dt) <= 0) {
            this.fish = pickFish(this.random());
            this.state = 'nibbling';
            this.nibblesLeft = this.fish.nibbles;
            if (this.fish.junk) { this.timer = this.fish.rumble; events.push({type:'rumble',seconds:this.fish.rumble}); }
            else this.timer = .1;
         }
      }
      else if (this.state === 'nibbling') {
         if (strike) { events.push({type:'early'}); this.wait(); }
         else if ((this.timer -= dt) <= 0) {
            if (this.nibblesLeft > 0) {
               this.nibblesLeft--;
               this.timer = this.fish.gap;
               events.push({type:'nibble'});
            }
            else {
               this.state = 'bite'; this.timer = this.fish.window;
               events.push({type:'bite',weak:!!this.fish.junk});
            }
         }
      }
      else if (this.state === 'bite') {
         if (strike) {
            const [low,high] = this.fish.kg;
            this.kg = Math.round((low+(high-low)*this.random())*10)/10;
            if (this.fish.junk) {                  // striking at a boot costs points and a cast
               this.score = Math.max(0,this.score+this.fish.points);
               this.state = 'landed'; this.timer = LANDED_FOR;
               events.push({type:'junk',fish:this.fish,points:this.fish.points});
            }
            else {
               this.state = 'fight'; this.progress = .25; this.tension = .35; this.over = 0;
               this.surging = false; this.surgeTimer = 1.2 + 1.5*this.random();
               events.push({type:'hooked',fish:this.fish});
            }
         }
         else if ((this.timer -= dt) <= 0) { events.push({type:'escaped'}); this.wait(); }
      }
      else if (this.state === 'fight') {
         const pull = this.fish.pull;
         if ((this.surgeTimer -= dt) <= 0) {
            this.surging = !this.surging;
            this.surgeTimer = this.surging ? .7 + .6*this.random() : 1.6 + 1.8*this.random();
            if (this.surging) events.push({type:'surge'});
         }
         if (reel) {
            // Reeling against a surge loads the line about three times faster.
            this.tension += (this.surging ? .9 + 1.1*pull : .42 + .2*pull)*dt;
            this.progress += (this.surging ? .04 : .30)/(.7+pull)*dt;
         }
         else {
            this.tension -= .9*dt;
            this.progress -= (this.surging ? .10 : .035)*pull*dt;
         }
         this.tension = clamp(this.tension,0,1.15);
         this.over = this.tension >= 1 ? this.over+dt : 0;
         if (this.over > SNAP_AFTER) {
            this.lines--; this.state = 'idle'; this.tension = 0;
            events.push({type:'snap',fish:this.fish});
            if (this.lines <= 0) { this.phase = 'lost'; events.push({type:'lost',reason:'lines'}); return events; }
         }
         else if (this.progress <= 0) { events.push({type:'escaped'}); this.wait(); }
         else if (this.progress >= 1) {
            this.score += this.fish.points; this.caught++;
            this.state = 'landed'; this.timer = LANDED_FOR; this.tension = 0;
            events.push({type:'caught',fish:this.fish,kg:this.kg,points:this.fish.points});
            if (this.score >= this.goal) { this.phase = 'won'; events.push({type:'won'}); return events; }
         }
      }
      else if (this.state === 'landed') {
         if ((this.timer -= dt) <= 0) this.state = 'idle';
      }

      if (this.remaining === 0 && this.phase === 'playing') {
         this.phase = 'lost';
         events.push({type:'lost',reason:'time'});
      }
      return events;
   }
}
