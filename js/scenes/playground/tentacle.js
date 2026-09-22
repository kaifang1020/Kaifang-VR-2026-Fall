/*
   害羞的触手：一条用 IK 驱动的、有"性格"的触手。

   - 手慢慢靠近  -> 信任 (trust) 上升，它试探着伸向你
   - 手突然快动  -> 受惊 (fear)，它猛地缩回去蜷起来，变红
   - 手停着不动  -> 它好奇地左右摆动尖端
   - 信任很高且碰到你的手 -> 尖端"开花"，一道光波沿着身体传下去
   - 手在远处用光束 (beam) 指它附近 -> 它像猫追激光笔一样追着光束
   - 光束直接照到它的尖端 -> 它害羞地躲开，脸红 (变粉)
   - 手柄震动：靠近时能感到它的"心跳"(越信任越慢)，碰到时有明显震动

   没戴头显时，会有一只"幽灵手"(白色小球) 自动演示：慢慢靠近，偶尔突然抽走。
*/
import * as cg from "../../render/core/cg.js";
import { ControllerBeam } from "../../render/core/controllerInput.js";

export const init = async model => {

   // ---------- 可以调的参数 ----------

   const BASE      = [0, .9, -.5];   // 触手根部的位置 (米)
   const L1 = .32, L2 = .32;         // 两段"骨头"的长度
   const N         = 16;             // 身体由多少个小球组成
   const SCARE_SPEED = 1.0;          // 手速超过这个值 (米/秒) 它就会受惊
   const NOTICE_DIST = 1.0;          // 手离根部多近它才会注意到你
   const TOUCH_DIST  = .07;          // 尖端离手多近算"碰到"
   const BEAM_NOTICE = .55;          // 光束离它多近它才会去追
   const BEAM_DAZZLE = .06;          // 光束离尖端多近算"照到脸上"

   // ---------- 创建物体 (只执行一次) ----------

   // 底座
   model.add('tubeY').move(BASE[0], BASE[1]/2, BASE[2]).scale(.05, BASE[1]/2, .05).color(.25,.2,.2);
   model.add('sphere').move(BASE).scale(.08,.04,.08).color(.3,.25,.25);

   // 身体：一串由粗到细的小球
   let body = [], bodyPos = [];
   for (let i = 0 ; i < N ; i++) {
      body.push(model.add('sphere'));
      bodyPos.push(BASE.slice());
   }

   // 尖端的"花瓣"：平时缩成 0，碰到手时张开
   let petals = [];
   for (let i = 0 ; i < 6 ; i++)
      petals.push(model.add('sphere').color(1,.6,.8));

   // 两只手柄的光束
   let beams = { left: new ControllerBeam(model, 'left'), right: new ControllerBeam(model, 'right') };

   // 幽灵手 (只在没有头显时显示)
   let ghost = model.add('sphere').color(1,1,1);

   // ---------- 触手的"内心状态" ----------

   let trust = 0;                    // 信任 0..1
   let fear  = 0;                    // 受惊 0..1，会随时间自己消退
   let bloom = 0;                    // 开花程度 0..1
   let pulse = -1;                   // 光波位置 (0..1 沿身体传播)，-1 表示没有光波
   let tip   = cg.add(BASE, [0,.3,.1]);   // 尖端当前位置
   let prevHand = {};                // 上一帧每只手的位置，用来算速度
   let handSpeed = 0;
   let shy = 0;                      // 被光束照到脸的害羞程度 0..1
   let nextBeat = 0;                 // 下一次"心跳"震动的时间
   let wasTouching = false;

   // ---------- 小工具函数 ----------

   let isValid = p => Array.isArray(p) && p.length >= 3 && ! isNaN(p[0]) && cg.norm(p) > 0;

   // 没头显时的演示手：大部分时间慢慢靠近，每 9 秒突然抽走一次
   let ghostHand = t => {
      let phase = t % 9;
      let near = [.15 * Math.sin(.7*t), 1.25 + .05 * Math.sin(1.1*t), -.25];
      let far  = [.5, 1.4, .3];
      let s = phase < 7 ? Math.min(1, phase / 4)            // 0-4 秒: 慢慢靠近, 4-7 秒: 停着
                        : Math.max(0, 1 - (phase - 7) * 8); // 7 秒: 突然抽走
      return cg.mix(far, near, s);
   }

   // 手柄震动。只有在头显里、用手柄时才有效，其它情况安静地什么都不做
   let buzz = (hand, intensity, duration) => {
      try { if (window.vibrate && hand != 'ghost') vibrate(hand, intensity, duration); } catch (e) { }
   }

   // 光束上离点 P 最近的点 (只算手柄前方的那一半)。光束在手柄后面则返回 null
   let nearestOnBeam = (beam, P) => {
      let bm  = beam.beamMatrix();
      let inv = cg.mInverse(worldCoords);
      let o   = cg.mTransform(inv, bm.slice(12,15));                                   // 光束起点
      let o2  = cg.mTransform(inv, cg.subtract(bm.slice(12,15), bm.slice(8,11)));      // 光束上的另一点 (光束沿 -z 方向)
      let dir = cg.normalize(cg.subtract(o2, o));
      let d   = cg.dot(cg.subtract(P, o), dir);
      return d > 0 ? cg.add(o, cg.scale(dir, d)) : null;
   }

   // 二次贝塞尔曲线：让 根部->肘部->尖端 的折线变成一条柔软的曲线
   let bezier = (A, B, C, t) => cg.mix(cg.mix(A, B, t), cg.mix(B, C, t), t);

   // ---------- 每一帧 ----------

   model.animate(() => {
      let t  = model.time;
      let realDt = model.deltaTime || 1/60;            // 真实的帧间隔，用来算手速
      let dt = Math.min(.05, realDt);                  // 截断后的帧间隔，用来做动画 (卡顿时不会乱跳)

      // 1. 找到手：优先用真实手柄，否则用幽灵手

      let hands = {};
      for (let h of ['left', 'right']) {
         let p = inputEvents.pos(h);
         if (isValid(p))
            hands[h] = p.slice(0,3);
      }
      let usingGhost = Object.keys(hands).length == 0;
      if (usingGhost)
         hands.ghost = ghostHand(t);
      ghost.identity().move(hands.ghost ?? [0,0,0]).scale(usingGhost ? .035 : 0);

      // 2. 选离根部最近的那只手，并计算它的速度

      let hand = null, handName = null, handDist = 1000, speed = 0;
      for (let h in hands) {
         let d = cg.distance(hands[h], BASE);
         if (d < handDist) {
            hand = hands[h];
            handName = h;
            handDist = d;
            speed = prevHand[h] ? cg.distance(hands[h], prevHand[h]) / realDt : 0;
         }
      }
      prevHand = hands;
      handSpeed = cg.mixf(handSpeed, speed, .3);      // 平滑一下，避免追踪抖动误触发
      let noticed = handDist < NOTICE_DIST;

      // 2b. 光束：找离触手最近的那条光束

      let beamPoint = null, beamHand = null, beamDist = BEAM_NOTICE, dazzled = false;
      let head = cg.add(BASE, [0, .3, 0]);                                       // 触手"活动范围"的中心
      for (let h of ['left', 'right']) {
         beams[h].update();
         if (! hands[h])
            continue;                                                            // 没有真实手柄就不算
         let Q = nearestOnBeam(beams[h], head);
         if (Q && cg.distance(Q, head) < beamDist) {
            beamPoint = Q;
            beamHand  = h;
            beamDist  = cg.distance(Q, head);
         }
         let Qtip = nearestOnBeam(beams[h], tip);
         if (Qtip && cg.distance(Qtip, tip) < BEAM_DAZZLE && cg.distance(hands[h], tip) > .25) {
            dazzled = true;                                                      // 从远处直接照到了尖端
            buzz(h, .25, 30);
         }
      }
      shy = dazzled ? Math.min(1, shy + 4 * dt) : Math.max(0, shy - .7 * dt);

      // 3. 更新情绪

      if (noticed && handSpeed > SCARE_SPEED && fear < .5)
         buzz(handName, .8, 60);                       // 受惊的那一下：短促的抖动

      if (noticed && handSpeed > SCARE_SPEED) {        // 被吓到
         fear  = 1;
         trust = Math.max(0, trust - .6 * dt * 10);
      }
      fear = Math.max(0, fear - .35 * dt);             // 恐惧大约 3 秒消退

      if (noticed && handSpeed < .35 && fear < .3)
         trust = Math.min(1, trust + .16 * dt);        // 温柔 -> 大约 6 秒建立信任
      else if (! noticed)
         trust = Math.max(0, trust - .05 * dt);        // 你走了，它慢慢忘记你

      // 4. 决定尖端"想去哪里"

      let breathe = .03 * Math.sin(1.3 * t);
      let rest = cg.add(BASE, [.06 * Math.sin(.5*t), .30 + breathe, .12]);       // 休息姿势
      let curl = cg.add(BASE, [0, .10, -.10]);                                  // 受惊时蜷缩的姿势

      let want = rest;
      if (noticed && hand) {
         let reach = trust * trust * (3 - 2 * trust);                            // smoothstep: 一开始很迟疑
         want = cg.mix(rest, hand, reach);
         let still = Math.max(0, 1 - handSpeed / .2);                            // 手越静止，越好奇
         want = cg.add(want, [.04 * still * Math.sin(3*t), .02 * still * Math.sin(4.3*t), 0]);
      }
      else if (beamPoint) {                                                      // 手不在附近：追光束，像猫追激光笔
         want = cg.mix(rest, beamPoint, .85);
         if (shy > 0) {                                                          // 被照到脸：往光束的反方向躲
            let away = cg.subtract(rest, beamPoint);
            away = cg.norm(away) > .001 ? cg.normalize(away) : [0,0,1];
            want = cg.mix(want, cg.add(rest, cg.scale(away, .2)), shy);
         }
      }
      want = cg.mix(want, curl, fear);

      // 不能伸得比自己的身体还长
      let v = cg.subtract(want, BASE), len = cg.norm(v), maxLen = (L1 + L2) * .98;
      if (len > maxLen)
         want = cg.add(BASE, cg.scale(v, maxLen / len));

      // 5. 尖端向目标靠近：伸得慢，缩得快

      let rate = fear > .5 ? 14 : 2.2;
      tip = cg.mix(tip, want, 1 - Math.exp(-rate * dt));

      // 6. IK：根据 根部 和 尖端 算出"肘部"在哪

      let E = cg.ik2(BASE, tip, L1, L2, [.3, .2, 1]);
      if (! isValid(E))
         E = cg.mix(BASE, tip, .5);
      let ctrl = cg.add(E, cg.subtract(E, cg.mix(BASE, tip, .5)));              // 把控制点再往外推，曲线才会经过肘部附近

      // 7. 碰到了吗？

      let touching = hand && trust > .8 && cg.distance(tip, hand) < TOUCH_DIST;
      if (touching && bloom < .05 && pulse < 0)
         pulse = 0;                                                             // 发出一道光波
      bloom = cg.mixf(bloom, touching ? 1 : 0, 1 - Math.exp(-(touching ? 4 : 1.5) * dt));
      if (touching && ! wasTouching)
         buzz(handName, 1, 250);                                                // 碰到的那一刻：明显的一下
      else if (touching)
         buzz(handName, .15, 30);                                               // 一直搭着：轻轻的"呼噜"
      wasTouching = touching;

      // 7b. 心跳：手在附近且它不害怕时，手柄能感到它的心跳。越信任，心跳越慢越稳

      if (noticed && ! touching && fear < .3 && t > nextBeat) {
         let closeness = Math.max(0, 1 - handDist / NOTICE_DIST);
         buzz(handName, .1 + .3 * closeness, 40);
         nextBeat = t + cg.mixf(.45, 1.1, trust);
      }

      if (pulse >= 0) {
         pulse += 1.2 * dt;
         if (pulse > 1.3) pulse = -1;
      }

      // 8. 摆放身体的每个小球，并上色

      for (let i = 0 ; i < N ; i++) {
         let f = i / (N - 1);                                                   // 0 = 根部, 1 = 尖端
         let target = bezier(BASE, ctrl, tip, f);
         let follow = fear > .5 ? 20 : cg.mixf(30, 7, f);                       // 越靠近尖端越"滞后"，看起来更软
         bodyPos[i] = cg.mix(bodyPos[i], target, 1 - Math.exp(-follow * dt));

         let size = cg.mixf(.05, .018, f) * (1 + .08 * Math.sin(2*t - 4*f));    // 由粗到细 + 一点蠕动
         body[i].identity().move(bodyPos[i]).scale(size);

         let calm = [.05, .55 + .25 * f, .55];                                  // 平静: 蓝绿色
         let c = cg.mix(calm, [1, .45, .6], shy * f);                           // 害羞: 尖端变粉
         c = cg.mix(c, [1, .1, .05], fear);                                     // 受惊: 红色
         let glow = trust * f * f * .6;                                         // 信任越高，尖端越亮
         if (pulse >= 0)
            glow += Math.max(0, 1 - Math.abs((1 - f) - pulse) * 6);             // 光波从尖端传向根部
         body[i].color(c[0] + glow, c[1] + glow, c[2] + glow * .6);
      }

      // 9. 花瓣

      for (let i = 0 ; i < petals.length ; i++) {
         let a = 2 * Math.PI * i / petals.length + t;
         let r = .045 * bloom;
         petals[i].identity()
                  .move(cg.add(bodyPos[N-1], [r * Math.cos(a), .01, r * Math.sin(a)]))
                  .scale(.02 * bloom);
      }
   });
}
