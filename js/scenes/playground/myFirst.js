/*
   我的第一个练习场景：一个会转的立方体 + 一个跟着时间上下浮动的球。
   按下手柄扳机（或桌面上按鼠标）时，把球移到手的位置并变色。
*/
// import * as cg from "../../render/core/cg.js";

// export const init = async model => {

//    // init 里只执行一次：创建物体
//    let cube = model.add('torusY').color(1,0,0);
//    let ball = model.add('sphere').color(1,.4,.2);
//    let ballPos = [0, 1.5, -1];   // 单位是米，y=1.5 大约在视线高度

//    // 输入事件：手柄按下时把球放到手的位置
//    inputEvents.onPress = hand => {
//       ballPos = inputEvents.pos(hand);
//       ball.color(hand == 'left' ? [0,1,0] : [0,0,1]);
//    };

//    // animate 每一帧执行：更新位置/旋转
//    model.animate(() => {
//       let t = model.time;
//       cube.identity().move(Math.sin(t), 1.5, -2 + Math.cos(t)).turnY(6*t).turnX(.5*t).scale(.2);
//       ball.identity().move(cg.add(ballPos, [0, .1*Math.sin(3*t), 0])).scale(.1);
//    });
// }

import * as cg from "../../render/core/cg.js";

export const init = async model => {

   // 一个转圈的圆环
   let cube = model.add('torusY').color(1,0,0);

   // 第4步：用循环造 10 个球，颜色从蓝渐变到红
   let balls = [];
   for (let i = 0; i < 10; i++)
      balls.push(model.add('sphere').color(i/10, .5, 1 - i/10));

   model.animate(() => {
      let t = model.time;

      cube.identity().move(Math.sin(t), 1.5, -2 + Math.cos(t)).turnY(6*t).turnX(.5*t).scale(.2);

      // 第4步：把 10 个球排成一排，高度按波浪起伏
      for (let i = 0; i < 10; i++)
         balls[i].identity().move(i * .3 - 1.35, 1.5 + .2 * Math.sin(t + i), -2).scale(.08);
   });
}
