// Run: node --test js/scenes/hw2/games.test.mjs
// Data URLs allow testing these browser ES modules without changing the
// course server's CommonJS package configuration.
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const rulesURL = url(await readFile(new URL('./gameRules.js', import.meta.url), 'utf8'));
const { TimedGame, PotionGame, ORDERS, stirAmount, rescueTarget, shoulder, segmentDistance } = await import(rulesURL);

test('rescue: ten collections win; timeout and three hits lose; reset restores state', () => {
   const g = new TimedGame(60, 3, 10);
   g.tick(90); assert.equal(g.phase, 'ready'); assert.equal(g.collect(), false);
   g.reset();
   for (let i=0; i<10; i++) g.collect();
   assert.equal(g.phase, 'won'); assert.equal(g.score, 1000);
   g.tick(90); g.damage(); g.collect();
   assert.equal(g.phase, 'won'); assert.equal(g.score, 1000);
   g.reset(); g.tick(60); assert.equal(g.phase, 'lost');
   g.reset(); g.damage(); g.damage(); g.damage();
   assert.equal(g.phase, 'lost'); assert.equal(g.lives, 0);
   g.reset(); assert.deepEqual([g.score,g.progress,g.lives,g.remaining], [0,0,3,60]);
});

test('all rescue targets fit the actual hand and handle travel limits', () => {
   for (let i=0; i<10; i++) {
      const {side,p} = rescueTarget(i), s = shoulder(side);
      assert.ok(Math.hypot(...p.map((x,j)=>x-s[j])) <= .325);
      assert.ok(p[1]+.38 >= 1.32 && p[1]+.38 <= 1.85);
      assert.ok(Math.abs(p[0]) >= .025 && Math.abs(p[0]) <= .44);
   }
   assert.equal(segmentDistance([0,0,0],[-1,0,0],[1,0,0]),0);
   assert.equal(segmentDistance([2,0,0],[-1,0,0],[1,0,0]),1);
   assert.equal(segmentDistance([0,1,0],[0,0,0],[0,0,0]),1);
});

test('potion: orders allow choices, reject premature serving, and reward risk', () => {
   const g=new PotionGame();g.reset();assert.equal(g.serve(),0);
   for(const order of ORDERS) {
      for(let i=0;i<Math.ceil((order.lift+10)/25);i++)g.addIngredient(0);
      g.addIngredient(1);
      assert.equal(g.serve(),0); // Mixing is mandatory.
      for(let i=0;i<35;i++){g.tick(.1,1);for(const b of [...g.bubbles])g.pop(b.id);}
      assert.ok(g.ready);assert.ok(g.serve()>=100);
   }
   assert.equal(g.phase,'won');const score=g.score;
   g.tick(200);assert.equal(g.addIngredient(0),false);assert.equal(g.serve(),0);assert.equal(g.score,score);
   g.reset();g.addIngredient(0);g.addIngredient(0);g.addIngredient(2);
   for(let i=0;i<35;i++){g.tick(.1,1);for(const b of [...g.bubbles])g.pop(b.id);}
   assert.ok(g.serve()>=175); // Quality contributes a real bonus.
});

test('potion: heat and escaping bubbles destroy a batch; popping prevents escape', () => {
   const g=new PotionGame();g.reset();
   for(let i=0;i<3;i++) {
      for(let j=0;j<5;j++)g.addIngredient(0);
      g.tick(.1);assert.equal(g.ingredients,0);assert.equal(g.lives,2-i);
   }
   assert.equal(g.phase,'lost');g.reset();
   g.addIngredient(2);g.tick(3);assert.equal(g.bubbles.length,1);
   const id=g.bubbles[0].id;assert.equal(g.pop(id),true);assert.equal(g.pop(id),false);
   g.tick(4);g.tick(7);assert.equal(g.lives,2);assert.equal(g.bubbles.length,0);
   g.reset();g.tick(151);assert.equal(g.phase,'lost');
});

test('stirring requires a circular movement, not stationary aim or ray jumps', () => {
   const p=a=>[.15*Math.cos(a),1.04+.07*Math.sin(a),-.78];
   assert.equal(stirAmount(p(0),p(0),1/60),0);
   assert.equal(stirAmount(null,p(0),1/60),0);
   assert.equal(stirAmount([0,1.04,-.78],p(0),1/60),0);
   assert.equal(stirAmount(p(0),p(Math.PI),1/60),0);
   assert.ok(stirAmount(p(Math.PI-.02),p(-Math.PI+.02),1/60)>0);
});

// Run the real scene callbacks with a lightweight renderer and controller stub.
// This checks scene wiring, not just the independent rule classes.
const cgURL=url(await readFile(new URL('../../render/core/cg.js',import.meta.url),'utf8'));
const kitURL=url(`export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const buzz=()=>{}; export const createKit=()=>globalThis.testKit;`);
class SceneNode {
   constructor(){this.nodes=[];this.time=0;this.deltaTime=1/60;}
   add(){const n=new SceneNode();this.nodes.push(n);return n;}
   nChildren(){return this.nodes.length;} child(i){return this.nodes[i];}
   animate(fn){this.frame=fn;}
}
for(const method of ['color','move','scale','identity','turnX','turnY','turnZ','placeLimb','dull'])
   SceneNode.prototype[method]=function(...args){
      assert.ok(args.flat().every(v=>typeof v!=='number'||Number.isFinite(v)),method+' received non-finite geometry');
      return this;
   };
async function scene(name) {
   const labels={}, model=new SceneNode();
   globalThis.inputEvents={};
   globalThis.clay={definePathsMesh(){}};
   const kit=globalThis.testKit={keys:new Set(), label:id=>s=>labels[id]=s,
      onKey:fn=>kit.key=fn, update(){},tone(){},dispose(){kit.disposed=true;},
      pointsAt:()=>true,plane:()=>[0,1.04,-.78]};
   const source=(await readFile(new URL('./'+name+'.js',import.meta.url),'utf8'))
      .replace('../../render/core/cg.js',cgURL).replace('./gameKit.js',kitURL).replace('./gameRules.js',rulesURL);
   const module=await import(url(source)); await module.init(model);
   const advance=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++){model.time+=1/60;model.frame();}};
   advance(1/60);
   return {model,kit,labels,advance,module};
}

test('potion scene: debounce, three orders win, restart, timeout, cleanup', async () => {
   const {kit,labels,advance,module}=await scene('tinyPotionLab');
   kit.key(' ');advance(.02);
   kit.key('1');kit.key('2');advance(.6);
   assert.match(labels.lift,/LIFT 25/);
   kit.key('r');advance(.02);
   for(const order of ORDERS) {
      for(let i=0;i<Math.ceil((order.lift+10)/25);i++){kit.key('1');advance(.5);}
      kit.key('2');advance(.5);kit.keys.add('s');
      for(let i=0;i<35;i++){advance(.1);kit.key('b');}
      kit.keys.clear();kit.key('e');advance(.02);
   }
   assert.match(labels.message,/YOU WIN/);assert.match(labels.stats,/ORDERS 3\/3/);
   kit.key('r');advance(.02);assert.match(labels.stats,/SCORE 0.*ORDERS 0\/3.*LIVES 3/);
   advance(151);assert.match(labels.message,/YOU LOST/);
   module.deinit();assert.equal(kit.disposed,true);
});

test('potion scene: simultaneous beam stirring and grabbing, misses return crystals', async () => {
   const {kit,labels,advance,module,model}=await scene('tinyPotionLab');
   kit.key(' ');advance(.02);
   kit.pointsAt=(_hand,p)=>p[0]<-.4 && p[1]>1.3;
   inputEvents.onPress('right');advance(.02);inputEvents.onRelease('right');advance(.6);
   assert.match(labels.lift,/LIFT 25/);
   kit.pointsAt=()=>false;kit.plane=()=>[.15,1.04,-.78];
   inputEvents.onPress('left');advance(.5);assert.match(labels.mix,/MIX 0/);
   kit.plane=hand=>hand==='left'?[.15*Math.cos(model.time*3),1.04+.07*Math.sin(model.time*3),-.78]:[.7,1.5,-.78];
   kit.pointsAt=(hand,p)=>hand==='right' && p[0]<-.4 && p[1]>1.3;
   inputEvents.onPress('right');advance(.5);inputEvents.onRelease('right');advance(.02);
   assert.match(labels.message,/Missed pot/);assert.ok(Number(labels.mix.match(/MIX (\d+)/)[1])>0);
   module.deinit();
});

test('rescue scene: starts, moves both arms without invalid IK, restarts and cleans up', async () => {
   const {kit,labels,advance,module}=await scene('puppetRescue');
   kit.key(' ');kit.keys.add('w');kit.keys.add('i');advance(1.1);
   kit.keys.clear();assert.match(labels.status,/TIME 59/);
   kit.key('r');advance(.02);assert.match(labels.status,/SCORE 0.*ENERGY 0\/10.*LIVES 3.*TIME 60/);
   advance(61);assert.match(labels.task,/YOU LOST/);
   module.deinit();assert.equal(kit.disposed,true);
});

test('rescue scene: both beam-controlled strings can complete all ten targets', async () => {
   const {kit,labels,advance,module}=await scene('puppetRescue');
   kit.key(' ');inputEvents.onPress('left');inputEvents.onPress('right');
   for(let i=0;i<10;i++) {
      const target=rescueTarget(i);
      kit.plane=side=>side===target.side?[target.p[0],target.p[1]+.38,target.p[2]]:
         [side==='left'?-.04:.04,1.8,target.p[2]];
      for(let j=0;j<90 && labels.status.includes('ENERGY '+i+'/10');j++) advance(1/60);
      assert.ok(labels.status.includes('ENERGY '+(i+1)+'/10'),labels.status);
   }
   assert.match(labels.task,/YOU WIN/);
   module.deinit();
});
