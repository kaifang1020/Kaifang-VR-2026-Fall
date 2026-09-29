/* A reactive cauldron: choose ingredients, stir with one hand, manage bubbles
   with the other, and decide when to bank the batch. No fixed recipe sequence. */
import * as cg from '../../render/core/cg.js';
import { createKit, clamp, buzz } from './gameKit.js';
import { PotionGame, stirAmount } from './gameRules.js';

let cleanup=()=>{};
export const deinit=()=>cleanup();
export const init=async model=> {
   cleanup();
   const kit=createKit(model,'potion'), game=new PotionGame(), Z=-1.12;
   const colors=[[.2,.65,1],[1,.25,.35],[.4,1,.5]];
   const sources=colors.map((_,i)=>[(i-1)*.46,1.24,Z]);
   const pot=[0,.91,Z+.12], dropPoint=[0,1.04,Z+.34];
   const add=(shape,color)=>model.add(shape).color(color);
   add('cube',[.035,.025,.065]).move(0,1.35,Z-.17).scale(.95,.92,.025);
   add('cube',[.27,.15,.095]).move(0,.71,Z).scale(.78,.035,.32);
   for(const x of [-.65,.65]) add('cube',[.15,.08,.06]).move(x,.39,Z).scale(.045,.3,.045);
   add('sphere',[.09,.075,.14]).move(pot).scale(.22,.17,.20);
   add('torusY',[.35,.27,.48]).move(0,1.015,pot[2]).scale(.20,.018,.18);
   const liquid=add('diskY',[.25,.13,.45]).move(0,1.018,pot[2]).scale(.18);
   for(const x of [-.24,.24]) add('torusZ',[.35,.27,.48]).move(x,.92,pot[2]).scale(.06);
   clay.definePathsMesh('potion_drop_ring',.004,[Array.from({length:49},(_,i)=>
      [.20*Math.cos(i*Math.PI/24),.09*Math.sin(i*Math.PI/24),0])]);
   const dropRing=add('potion_drop_ring',[.4,.9,.75]).move(dropPoint).dull();
   sources.forEach((p,i)=> {
      const root=model.add().move(p);
      root.add('tubeY').move(0,-.08,0).scale(.07,.08,.07).color(colors[i]);
      root.add('tubeY').move(0,.02,0).scale(.035,.04,.035).color(colors[i]);
      root.add('cube').move(0,.065,0).scale(.04,.015,.04).color([.65,.42,.2]);
      root.add('octahedron').move(0,.16,0).scale(.045).color(colors[i]);
      kit.label('source'+i,[p[0],1.52,Z+.04],1.05,colors[i])(['1 LIFT','2 COOL','3 VALUE'][i]);
      kit.label('effect'+i,[p[0],1.46,Z+.04],.85)(['+LIFT +HEAT','-HEAT -LIFT','+VALUE +BUBBLES'][i]);
   });
   const finished=Array.from({length:3},(_,i)=>add('tubeY',[.15,.15,.2]).move(-.32+i*.32,.78,Z+.22).scale(.035,.055,.035));
   const dangerMeshes=Array.from({length:3},()=>add('sphere',[1,.25,.15]));
   const foam=Array.from({length:8},()=>add('sphere',[.5,.9,.8]));
   const spoon=add('tubeZ',[.85,.7,.4]), spoonTip=add('sphere',[.85,.7,.4]);
   const held={left:null,right:null}, stirring={left:false,right:false}, previous={left:null,right:null};
   const carried={left:add('octahedron',colors[0]),right:add('octahedron',colors[0])};
   const deliveryMesh=add('octahedron',colors[0]);
   let delivery=null, notice='',noticeUntil=0,endTime=-10,spin=0,finishObserved=false;
   kit.label('title',[0,2.16,Z],1.65,[1,.8,.45])('TINY POTION LAB: WILD BREW');
   const stats=kit.label('stats',[0,2.07,Z],1.15);
   const orderText=kit.label('order',[0,1.98,Z],1.25,[1,.8,.45]);
   const message=kit.label('message',[0,1.88,Z],1.1,[.6,1,.85]);
   const meterText=['lift','heat','mix'].map((id,i)=>kit.label(id,[(i-1)*.51,1.79,Z],1.1));
   const qualityText=kit.label('quality',[0,1.62,Z],1.0,[.7,1,.7]);
   const meterBars=[0,1,2].map((_,i)=> {
      const x=(i-1)*.51;
      add('cube',[.12,.15,.2]).move(x,1.69,Z).scale(.21,.015,.008);
      return {x,node:add('cube',colors[i]).dull()};
   });
   kit.label('how',[0,.55,Z+.40],1.05)('Grab crystal, release in ring. Hold ring + circle to stir.');
   kit.label('how2',[0,.47,Z+.40],1.05)('Shoot red bubbles! SERVE when ready, or risk more value.');
   kit.label('keys',[0,.39,Z+.40],.95)('SPACE start | 1/2/3 add | hold S stir | B pop | E serve | R reset');
   const buttonP=[.52,.97,Z+.15];
   const button=add('cube',[.18,.38,.3]);
   const buttonText=kit.label('button',[buttonP[0],buttonP[1]+.018,buttonP[2]+.03],1.1);
   kit.label('danger',[0,.63,Z+.4],1.05,[1,.55,.3])('Heat 100 or escaped bubble = batch lost');
   const say=(text,seconds=1.6)=>{notice=text;noticeUntil=model.time+seconds;};
   const clearHands=()=> {
      held.left=held.right=null;stirring.left=stirring.right=false;
      previous.left=previous.right=null;delivery=null;
   };
   const reset=()=>{game.reset();finishObserved=false;clearHands();notice='';noticeUntil=0;kit.tone(500);};
   const inRing=p=>p && Math.hypot(p[0]/.20,(p[1]-dropPoint[1])/.09)<1.35;
   const bubblePosition=b=>[.30*Math.sin(b.id*2.4+.8),1.14+b.age*.075,dropPoint[2]+.06];
   const pop=(id,hand)=> {
      if(game.pop(id)){kit.tone(820,.07);buzz(hand,.4,35);say('POP! Heat reduced',.6);}
   };
   const serve=()=> {
      if(delivery){say('Wait for the ingredient to land');return;}
      const points=game.serve();
      if(points){clearHands();say('DELIVERED +'+points+' - next customer!',2);kit.tone(1000,.25);}
      else if(game.phase==='playing') say(game.lift<game.order.lift?'Need more lift':game.heat>75?'Too hot! Add COOL or pop bubbles':'Hold ring and move in circles to mix');
   };
   const deliver=(kind,hand,from)=> {
      if(game.phase!=='playing' || delivery) return false;
      delivery={kind,hand,from:from.slice(),start:model.time};return true;
   };
   const press=hand=> {
      if(game.phase!=='playing') {
         if(model.time-endTime>.6 && kit.pointsAt(hand,buttonP,.17)) reset();return;
      }
      const bubble=game.bubbles.find(b=>kit.pointsAt(hand,bubblePosition(b),.075));
      if(bubble){pop(bubble.id,hand);return;}
      if(kit.pointsAt(hand,buttonP,.17)){serve();return;}
      if(held[hand])return;
      const kind=sources.findIndex(p=>kit.pointsAt(hand,cg.add(p,[0,.16,0]),.075));
      if(kind>=0 && !delivery) {
         held[hand]={kind,p:cg.add(sources[kind],[0,.16,0])};buzz(hand);kit.tone(420+kind*100);return;
      }
      const p=kit.plane(hand,dropPoint[2]);
      if(inRing(p)){stirring[hand]=true;previous[hand]=p;}
   };
   const release=hand=> {
      stirring[hand]=false;previous[hand]=null;
      const item=held[hand];held[hand]=null;
      if(!item || game.phase!=='playing')return;
      const p=kit.plane(hand,dropPoint[2]);
      if(inRing(p)) {
         if(!deliver(item.kind,hand,item.p))say('Wait for the ingredient to land');
      } else say('Missed pot - crystal returned');
   };
   inputEvents.onPress=press;inputEvents.onRelease=release;
   kit.onKey(key=> {
      if(key==='r' || key===' ' && game.phase!=='playing')reset();
      else if(['1','2','3'].includes(key)) {
         const kind=Number(key)-1;deliver(kind,'right',cg.add(sources[kind],[0,.16,0]));
      } else if(key==='e')serve();
      else if(key==='b' && game.bubbles.length)pop(game.bubbles[0].id,'right');
   });
   cleanup=()=> {
      kit.dispose();if(inputEvents.onPress===press)inputEvents.onPress=()=>{};
      if(inputEvents.onRelease===release)inputEvents.onRelease=()=>{};
   };
   model.animate(()=> {
      kit.update();const t=model.time,dt=model.deltaTime||1/60;
      let effort=kit.keys.has('s')?1:0;
      for(const hand of ['left','right']) {
         if(stirring[hand]) {
            const p=kit.plane(hand,dropPoint[2]);
            effort=Math.max(effort,stirAmount(previous[hand],p,dt));previous[hand]=inRing(p)?p:null;
         }
      }
      game.tick(dt,effort);
      if(game.lastEvent){say(game.lastEvent,2.5);game.lastEvent='';clearHands();kit.tone(100,.3);buzz('left',1,150);buzz('right',1,150);}
      const active=game.phase==='playing';
      if(active)spin+=effort*dt*4;
      const tip=[.12*Math.cos(spin),1.04+.045*Math.sin(spin),dropPoint[2]+.015];
      spoon.placeLimb(tip,[tip[0]+.12,tip[1]+.20,tip[2]+.08],.009);
      spoonTip.identity().move(tip).scale(.026,.015,.015);
      for(const hand of ['left','right']) {
         const item=held[hand];
         if(item) {
            const p=kit.plane(hand,dropPoint[2]);
            if(p)item.p=[clamp(p[0],-.8,.8),clamp(p[1],.85,1.65),dropPoint[2]+.015];
         }
         carried[hand].identity().move(item?item.p:[0,0,0]).turnY(t*2).scale(item && active?.045:0).color(item?colors[item.kind]:colors[0]);
      }
      if(delivery && active) {
         const u=clamp((t-delivery.start)/.45,0,1),p=cg.mix(delivery.from,[0,1.02,pot[2]],u);
         p[1]+=.15*Math.sin(Math.PI*u);
         deliveryMesh.identity().move(p).turnY(t*4).scale(.045*(1-.5*u)).color(colors[delivery.kind]);
         if(u>=1) {
            const {kind,hand}=delivery;game.addIngredient(kind);delivery=null;kit.tone(520+kind*120,.1);buzz(hand);
            say(['LIFT added - watch the heat','COOLED - some lift lost','VALUE added - bubbles incoming'][kind],1);
         }
      } else deliveryMesh.identity().scale(0);
      if(!active && game.phase!=='ready' && !finishObserved) {
         finishObserved=true;endTime=t;clearHands();kit.tone(game.phase==='won'?1100:130,.4);
      }
      liquid.color([.2+game.heat*.007,.15+game.quality*.006,.8-game.heat*.005]);
      dropRing.color(effort>0 && active?[1,.85,.3]:game.ready?[.4,1,.5]:[.35,.7,.8]);
      dangerMeshes.forEach((node,i)=> {
         const b=game.bubbles[i];
         node.identity().move(b?bubblePosition(b):[0,0,0]).scale(b && active?.035+b.age*.004:0)
            .color(b && b.age>5?[1,.05,.05]:[1,.35,.12]);
      });
      finished.forEach((b,i)=>b.color(i<game.progress?[.45,1,.7]:[.15,.15,.2]));
      foam.forEach((b,i)=> {
         const u=(t*.65+i/8)%1;
         b.identity().move(.12*Math.sin(i*4.1+spin),1.03+u*.1,pot[2]+.09*Math.cos(i*2.3+spin))
            .scale(game.ingredients?(1-u)*.012:0);
      });
      const values=[game.lift,game.heat,game.mix];
      meterBars.forEach(({x,node},i)=>node.identity().move(x-.21+.21*values[i]/100,1.69,Z+.015)
         .scale(Math.max(.001,.21*values[i]/100),.012,.01).color(i===1 && game.heat>75?[1,.15,.08]:i===2?[.4,1,.6]:colors[i]));
      button.identity().move(buttonP).scale(.17,.055,.025).color(active?(game.ready?[.15,.65,.3]:[.25,.25,.3]):[.18,.38,.3]);
      buttonText(active?'SERVE [E]':game.phase==='ready'?'START':'AGAIN');
      stats('SCORE '+game.score+'  ORDERS '+game.progress+'/3  LIVES '+game.lives+'  TIME '+Math.ceil(game.remaining));
      orderText(game.order.name+' : LIFT '+game.order.lift+'+ / HEAT 75- / MIX 80+');
      meterText.forEach((set,i)=>set(['LIFT ','HEAT ','MIX '][i]+Math.floor(values[i])));
      qualityText('VALUE BONUS +'+Math.round(game.quality*3)+'  |  BUBBLES '+game.bubbles.length);
      message(game.phase==='ready'?'Serve 3 flight potions. Mix, cool, pop, decide!':game.phase==='won'?'YOU WIN - All customers airborne!':game.phase==='lost'?'YOU LOST - Lab closed':t<noticeUntil?notice:game.heat>85?'TOO HOT! Cool it before it bursts!':game.bubbles.length?'Pop red bubbles before they escape!':game.ready?'READY! Serve now, or add VALUE for a bonus':'Choose ingredients. Hold ring + circle to mix.');
   });
};
