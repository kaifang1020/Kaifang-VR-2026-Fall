import * as cg from "../../render/core/cg.js";

export const init = async model => {

   // 空节点：整个太阳系的"关节"，之后转它，所有星球一起转
   let solar = model.add();
   solar.add('sphere').color(1,.8,0).scale(.15);      // 太阳，挂在 solar 下

    let planets = [];
   for (let i = 0; i < 3; i++) {
      let p = solar.add();                              // 每颗行星也是一个空节点
      p.add('sphere').color(i/2, .4, 1 - i/2);         // 球挂在空节点下
      planets.push(p);
   }
    let moon = planets[2].add('sphere').color(.8,.8,.8);
    
    let grass = [];
   for (let i = 0; i < 30; i++)
      grass.push(model.add('tubeY').color(.2, .6, .2));
       
   let ballPos = [0, 2.5, -1];     // 位置
   let ballVel = [0, 0, 0];        // 速度
   let hit = 0;                    // 落地后高亮倒计时
   let ball = model.add('sphere');

   // 定义一个函数：让球从某个位置重新掉下来
   let dropBall = pos => {
      ballPos = pos;
      ballVel = [0, 0, 0];
   };


   model.animate(() => {
      let t = model.time;
      solar.identity().move(0, 1.5, -2).turnY(.2 * t);
    for (let i = 0; i < 3; i++) {
    let r = .4 + .3 * i;                           // 轨道半径：0.4, 0.7, 1.0
    let speed = 1.5 - .4 * i;                      // 越外越慢
    planets[i].identity()
            .move(r * Math.sin(speed * t), 0, r * Math.cos(speed * t))
            .scale(.06);
    }
    moon.identity().move(2 * Math.sin(5 * t), 0, 2 * Math.cos(5 * t)).scale(.3);
    for (let i = 0; i < 30; i++) {
         let x = (i % 10) * .15 - .7;                   // 10 列
         let z = -1.2 - (i / 10 >> 0) * .15;            // 3 行
         let sway = .4 * cg.noise(x * 2, z * 2, t);     // 位置不同、时间不同 → 摆动不同但相邻相似
         grass[i].identity().move(x, .9, z).turnZ(sway).scale(.01, .1, .01);
      }
            ballVel[1] -= 3 * model.deltaTime;                // 重力：每秒往下加速
      ballPos = cg.add(ballPos, cg.scale(ballVel, model.deltaTime));   // 位置 += 速度 * 时间
      if (ballPos[1] < .95) {                           // 落到草地高度
         ballPos[1] = .95;
         ballVel[1] = -ballVel[1] * .8;                 // 反弹，每次损失 20%
         hit = 10;
      }
      if (ballPos[1] < .96 && Math.abs(ballVel[1]) < .05)
   dropBall([0, 2.5, -1]);
      ball.identity().move(ballPos).scale(.05)
          .color(hit-- > 0 ? [1,1,1] : [1,.3,.3]);     // 落地瞬间闪白 10 帧
   });
         
}