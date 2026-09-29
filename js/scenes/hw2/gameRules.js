// Pure game rules: rendering and controller input live in the scene modules.
export class TimedGame {
   constructor(duration, lives, goal) {
      this.duration = duration; this.maxLives = lives; this.goal = goal;
      this.reset(false);
   }
   reset(play = true) {
      this.phase = play ? 'playing' : 'ready';
      this.remaining = this.duration; this.lives = this.maxLives;
      this.score = 0; this.progress = 0;
   }
   tick(dt) {
      if (this.phase !== 'playing') return;
      this.remaining = Math.max(0, this.remaining - Math.max(0, dt));
      if (this.remaining === 0) this.phase = 'lost';
   }
   damage() {
      if (this.phase !== 'playing') return;
      if (--this.lives <= 0) this.phase = 'lost';
   }
   collect() {
      if (this.phase !== 'playing') return false;
      this.score += 100; this.progress++;
      if (this.progress >= this.goal) this.phase = 'won';
      return true;
   }
}

export const ORDERS = [
   {name:'FEATHER FLIGHT', lift:50},
   {name:'MOON HOP', lift:65},
   {name:'DRAGON WINGS', lift:80},
];
const bound = (v,lo=0,hi=100) => Math.max(lo,Math.min(hi,v));

// Convert actual circular movement into stirring. Merely holding still, moving
// across the center, or losing/reacquiring the ray does not count.
export function stirAmount(previous, current, dt) {
   if(!previous || !current || dt<=0) return 0;
   const radius=p=>Math.hypot(p[0]/.20,(p[1]-1.04)/.09);
   if([previous,current].some(p=>radius(p)<.25 || radius(p)>1.35)) return 0;
   const angle=p=>Math.atan2((p[1]-1.04)/.09,p[0]/.20);
   let delta=angle(current)-angle(previous);
   delta=Math.atan2(Math.sin(delta),Math.cos(delta));
   if(Math.abs(delta)>Math.PI/2) return 0;
   return bound(Math.abs(delta)/(dt*3),0,1);
}

export class PotionGame extends TimedGame {
   constructor() { super(150,3,ORDERS.length); }
   reset(play=true) { super.reset(play); this.clock=0; this.serial=0; this.clearBatch(); }
   clearBatch() {
      this.lift=0; this.heat=25; this.quality=0; this.mix=0; this.ingredients=0;
      this.bubbles=[]; this.bubbleClock=0; this.lastEvent='';
   }
   get order() { return ORDERS[Math.min(this.progress,ORDERS.length-1)]; }
   get ready() { return this.ingredients>0 && this.lift>=this.order.lift && this.heat<=75 && this.mix>=80; }
   addIngredient(kind) {
      if(this.phase!=='playing' || ![0,1,2].includes(kind)) return false;
      this.ingredients++;
      if(kind===0) {this.lift=bound(this.lift+25);this.heat=bound(this.heat+16);}
      if(kind===1) {this.lift=bound(this.lift-10);this.heat=bound(this.heat-30);}
      if(kind===2) {this.quality=bound(this.quality+25);this.heat=bound(this.heat+8);this.bubbleClock+=2;}
      this.mix=bound(this.mix-(kind===1?12:20));
      return true;
   }
   burst() {
      this.damage();this.clearBatch();this.lastEvent='BURST! Batch lost - one life gone';
   }
   tick(dt, stirring=0) {
      if(this.phase!=='playing') return;
      dt=Math.max(0,dt); super.tick(dt);
      if(this.phase!=='playing') return;
      this.clock+=dt; stirring=bound(stirring,0,1);
      if(!this.ingredients) return;
      this.mix=bound(this.mix+stirring*24*dt);
      this.heat=bound(this.heat+(.8+stirring*2)*dt);
      if(this.heat>=100) {this.burst();return;}
      for(const bubble of this.bubbles) bubble.age+=dt;
      if(this.bubbles.some(b=>b.age>=7)) {this.burst();return;}
      if(this.heat>65 || this.quality>0) {
         this.bubbleClock+=dt*(1+this.quality/100);
         if(this.bubbleClock>=4 && this.bubbles.length<3) {
            this.bubbleClock=0;this.bubbles.push({id:this.serial++,age:0});
         }
      }
   }
   pop(id) {
      if(this.phase!=='playing') return false;
      const index=this.bubbles.findIndex(b=>b.id===id);
      if(index<0) return false;
      this.bubbles.splice(index,1);this.heat=bound(this.heat-5);return true;
   }
   serve() {
      if(this.phase!=='playing' || !this.ready) return 0;
      const points=100+Math.round(this.quality*3)+Math.round(Math.max(0,this.lift-this.order.lift));
      this.score+=points;this.progress++;
      if(this.progress===this.goal) this.phase='won';
      this.clearBatch();return points;
   }
}

export const PUPPET_Z = -1.15;
export const shoulder = side => [side === 'left' ? -.105 : .105, 1.22, PUPPET_Z];
// Every goal is reachable by its arm (two segments of 0.17 m).
export function rescueTarget(index) {
   const side = index % 2 ? 'right' : 'left';
   const offsets = [[.22,.09], [.17,-.13], [.06,.23], [.25,-.04], [.13,.17]];
   const [x,y] = offsets[Math.floor(index/2) % offsets.length];
   const s = shoulder(side);
   return { side, p: [s[0] + (side === 'left' ? -x : x), s[1]+y, PUPPET_Z] };
}

// Prevent a fast hand from skipping through a collectible between frames.
export function segmentDistance(point, a, b) {
   const v = b.map((x,i) => x-a[i]);
   const length2 = v.reduce((sum,x) => sum+x*x,0);
   const t = length2 ? Math.max(0,Math.min(1,
      v.reduce((sum,x,i) => sum+x*(point[i]-a[i]),0)/length2)) : 0;
   return Math.hypot(...point.map((x,i) => x-a[i]-t*v[i]));
}
