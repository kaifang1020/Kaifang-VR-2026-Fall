/* Single-player rescue: pull two hand strings, collect ten stars, avoid red mines.
   The body is supported. Stable spring-following replaces the old free-body solver.
   Desktop: Space start, WASD left handle, IJKL right handle, R restart. */
import * as cg from '../../render/core/cg.js';
import { createKit, clamp, buzz } from './gameKit.js';
import { TimedGame, rescueTarget, shoulder, segmentDistance, PUPPET_Z as Z } from './gameRules.js';

let cleanup = () => {};
export const deinit = () => cleanup();
export const init = async model => {
   cleanup();
   const kit = createKit(model,'rescue'), game = new TimedGame(60,3,10);
   const blue = [.2,.75,1], gold = [1,.72,.2], wood = [.8,.53,.28];
   const add = (shape,color) => model.add(shape).color(color);
   add('cube',[.025,.035,.07]).move(0,1.25,Z-.18).scale(.82,.78,.025);
   add('tubeY',[.15,.19,.26]).move(0,.79,Z).scale(.48,.04,.32);
   add('cube',wood).move(0,1.87,Z).scale(.48,.025,.025);
   for (const x of [-.49,.49]) add('cube',wood).move(x,1.32,Z).scale(.02,.57,.02);
   add('sphere',wood).move(0,1.37,Z).scale(.075);
   add('coneY',gold).move(0,1.47,Z).scale(.09,.07,.09);
   add('tubeZ',[.22,.55,.65]).placeLimb([0,1.27,Z],[0,1.04,Z],.07);
   add('sphere',[.13,.22,.3]).move(0,1.04,Z).scale(.08,.05,.06);
   for (const x of [-.028,.028]) add('sphere',[.015,.02,.025]).move(x,1.39,Z+.067).scale(.009);
   const leg = x => {
      add('tubeZ',wood).placeLimb([x,1.04,Z],[x,.88,Z],.025);
      add('sphere',[.13,.22,.3]).move(x,.85,Z+.025).scale(.045,.025,.065);
      add('tubeZ',[.4,.45,.5]).placeLimb([x*3,1.85,Z-.04],[x,.87,Z],.0015);
   };
   leg(-.055); leg(.055);
   add('tubeZ',[.6,.65,.7]).placeLimb([0,1.85,Z],[0,1.53,Z],.002);
   const arms = {}, held = {left:false,right:false};
   for (const side of ['left','right']) {
      const sign = side === 'left' ? -1 : 1, color = sign < 0 ? blue : gold;
      arms[side] = {sign,color,p:[sign*.23,1.10,Z],v:[0,0,0],handle:[sign*.23,1.52,Z],
         upper:add('tubeZ',wood),lower:add('tubeZ',wood),joint:add('sphere',wood),
         hand:add('sphere',color),line:add('tubeZ',[.8,.85,.9]),knob:add('sphere',color)};
   }
   const star = model.add();
   star.add('sphere').scale(.04);
   for (let i=0;i<3;i++) star.add('cube').turnZ(i*Math.PI/3).scale(.065,.009,.01);
   const halo = add('torusZ',blue);
   const mines = [-1,1].map(sign => ({sign,p:[0,0,Z],root:model.add()}));
   for (const mine of mines) {
      mine.root.add('sphere').scale(.035).color(1,.15,.2);
      for (let i=0;i<3;i++) mine.root.add('cube').turnZ(i*Math.PI/3).scale(.055,.008,.012).color(1,.22,.25);
   }
   const beads = Array.from({length:10},(_,i)=>add('sphere',[.15,.2,.25]).move(-.27+i*.06,.69,Z+.12).scale(.014));
   kit.label('title',[0,2.08,Z],1.7,gold)('PUPPET RESCUE');
   const status = kit.label('status',[0,1.98,Z],1.25);
   const task = kit.label('task',[0,.61,Z+.06],1.3);
   kit.label('how',[0,.53,Z+.06],1.2)('Aim at matching handle. Hold trigger to pull.');
   kit.label('how2',[0,.46,Z+.06],1.2)('Touch stars with puppet hands. Avoid red mines.');
   kit.label('keys',[0,.38,Z+.06],1.0)('SPACE start | WASD left | IJKL right | R restart');
   const buttonP = [0,1.72,Z+.06];
   const button = add('cube',[.1,.38,.3]).move(buttonP).scale(.18,.055,.02);
   const buttonText = kit.label('button',[0,1.738,Z+.085],1);
   let elapsed = 0, immunity = 0, notice = '', noticeTime = 0, endTime = -10;
   const reset = () => {
      game.reset(); elapsed=0; immunity=0; noticeTime=0; notice='';
      for (const side in arms) {
         const a=arms[side]; held[side]=false;
         a.p=[a.sign*.23,1.10,Z]; a.v=[0,0,0]; a.handle=[a.sign*.23,1.52,Z];
      }
      kit.tone(520);
   };
   const press = hand => {
      if (game.phase !== 'playing') {
         if (model.time-endTime>.6 && kit.pointsAt(hand,buttonP,.19)) reset();
         return;
      }
      if (kit.pointsAt(hand,arms[hand].handle,.09)) {held[hand]=true; buzz(hand);kit.tone(400);}
   };
   const release = hand => held[hand]=false;
   inputEvents.onPress=press; inputEvents.onRelease=release;
   kit.onKey(key=> { if (key==='r' || key===' ' && game.phase!=='playing') reset(); });
   cleanup = () => {
      kit.dispose();
      if(inputEvents.onPress===press) inputEvents.onPress=()=>{};
      if(inputEvents.onRelease===release) inputEvents.onRelease=()=>{};
   };
   model.animate(() => {
      kit.update();
      const dt=clamp(model.deltaTime || 1/60,0,.05), before=game.phase;
      if(game.phase==='playing') elapsed+=dt;
      game.tick(model.deltaTime || 1/60); immunity=Math.max(0,immunity-dt); noticeTime=Math.max(0,noticeTime-dt);
      const target=rescueTarget(game.progress);
      for (const mine of mines) {
         mine.p=[mine.sign*(.25+.045*Math.sin(elapsed*.8)),1.18+.19*Math.sin(elapsed*1.05+mine.sign*.9),Z];
         // Keep a fair, collision-free pocket around the current collectible.
         if(cg.distance(mine.p,target.p)<.145) mine.p[1]=target.p[1]>1.22 ? .99 : 1.43;
         mine.root.identity().move(mine.p).turnZ(elapsed*1.3).scale(game.phase==='playing'?1:0);
      }
      for(const side in arms) {
         const a=arms[side], previous=a.p.slice(), s=shoulder(side);
         if(game.phase==='playing') {
            const hit=held[side] ? kit.plane(side,Z) : null;
            if(hit) a.handle=hit;
            const keys=side==='left'?['a','d','s','w']:['j','l','k','i'];
            a.handle[0]+=(Number(kit.keys.has(keys[1]))-Number(kit.keys.has(keys[0])))*.35*dt;
            a.handle[1]+=(Number(kit.keys.has(keys[3]))-Number(kit.keys.has(keys[2])))*.35*dt;
         }
         a.handle=[clamp(a.handle[0],a.sign<0?-.44:.025,a.sign<0?-.025:.44),clamp(a.handle[1],1.32,1.85),Z];
         const destination=[a.handle[0],a.handle[1]-.38,Z];
         const delta=cg.subtract(destination,s), length=cg.norm(delta);
         const goal=length>.325?cg.add(s,cg.scale(delta,.325/length)):destination;
         // Small substeps make spring motion predictable at varying frame rates.
         const steps=Math.max(1,Math.ceil(dt/.008)), h=dt/steps;
         for(let j=0;j<steps;j++) for(let axis=0;axis<2;axis++) {
            a.v[axis]+=(65*(goal[axis]-a.p[axis])-13*a.v[axis])*h;
            a.p[axis]+=a.v[axis]*h;
         }
         const reach=cg.subtract(a.p,s), n=cg.norm(reach);
         if(n>.33) {a.p=cg.add(s,cg.scale(reach,.33/n)); a.v=[0,0,0];}
         let elbow=cg.ik2(s,a.p,.17,.17,[a.sign,-.6,-1]);
         if(!elbow.every(Number.isFinite)) elbow=cg.mix(s,a.p,.5);
         a.upper.placeLimb(s,elbow,.021); a.lower.placeLimb(elbow,a.p,.018);
         a.joint.identity().move(elbow).scale(.025);
         a.hand.identity().move(a.p).scale(.036);
         a.line.placeLimb(a.handle,a.p,.002).color(held[side]?a.color:[.6,.65,.7]);
         a.knob.identity().move(a.handle).scale(held[side]?.045:.035).color(a.color);
         if(game.phase==='playing' && immunity===0 && mines.some(m=>segmentDistance(m.p,previous,a.p)<.06)) {
            game.damage(); immunity=1.3; notice='OUCH! Avoid red mines';noticeTime=1.2;
            buzz(side,1,160);kit.tone(120,.2);
         }
         if(game.phase==='playing' && side===target.side && segmentDistance(target.p,previous,a.p)<.067) {
            game.collect();notice='+100 ENERGY COLLECTED';noticeTime=.7;buzz(side,.8,100);kit.tone(700+game.progress*35);
         }
      }
      if(before==='playing' && game.phase!=='playing') {endTime=model.time;held.left=held.right=false;kit.tone(game.phase==='won'?1000:130,.4);}
      const active=game.phase==='playing', next=rescueTarget(game.progress), color=arms[next.side].color;
      star.identity().move(next.p).turnZ(model.time).scale(active?1:0);
      for(let i=0;i<star.nChildren();i++) star.child(i).color(color);
      halo.identity().move(next.p).scale(active?.085:0).color(color);
      beads.forEach((b,i)=>b.color(i<game.progress?[.3,1,.7]:[.15,.2,.25]));
      button.identity().move(buttonP).scale(active?0:.18,active?0:.055,.02);
      buttonText(active?'':game.phase==='ready'?'START':'PLAY AGAIN');
      status('SCORE '+game.score+'  ENERGY '+game.progress+'/10  LIVES '+game.lives+'  TIME '+Math.ceil(game.remaining));
      task(game.phase==='ready'?'Collect 10 stars in 60 seconds':game.phase==='won'?'YOU WIN - Puppet rescued!':game.phase==='lost'?'YOU LOST - Try again':noticeTime>0?notice:'Use the '+next.side.toUpperCase()+' puppet hand');
   });
};
