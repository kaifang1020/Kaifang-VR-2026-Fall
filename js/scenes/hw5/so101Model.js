// The SO101 robot arm as data, with no rendering: the kinematic tables from the
// course's SO101.js (which come from the robot's URDF file), the axis each joint
// turns about, and small helpers for angles and limits. armLab.js renders it;
// the tests check the numbers.
import * as cg from '../../render/core/cg.js';

export const PRINTED = [1, .82, .12], MOTOR = [.1, .1, .1];   // part colours: 3D-printed shell, servo motor

// Each link is a rigid part of the arm. Its meshes are STL files in media/stl/SO101;
// xyz (metres) and rpy (roll, pitch, yaw in radians) place each mesh in the link's frame.
export const LINKS = {
   base_link: [
      { stl: 'base_motor_holder_so101_v1'       , xyz: [-0.00636471, -0.0000994414, -0.0024], rpy: [1.5708, 0, 1.5708], color: PRINTED },
      { stl: 'base_so101_v2'                    , xyz: [-0.00636471, 0, -0.0024], rpy: [1.5708, 0, 1.5708], color: PRINTED },
      { stl: 'sts3215_03a_v1'                   , xyz: [0.0263353, 0, 0.0437], rpy: [0, 0, 0], color: MOTOR },
      { stl: 'waveshare_mounting_plate_so101_v2', xyz: [-0.0309827, -0.000199441, 0.0474], rpy: [1.5708, 0, 1.5708], color: PRINTED },
   ],
   shoulder_link: [
      { stl: 'sts3215_03a_v1'            , xyz: [-0.0303992, 0.000422241, -0.0417], rpy: [1.5708, 1.5708, 0], color: MOTOR },
      { stl: 'motor_holder_so101_base_v1', xyz: [-0.0675992, -0.000177759, 0.0158499], rpy: [1.5708, -1.5708, 0], color: PRINTED },
      { stl: 'rotation_pitch_so101_v1'   , xyz: [0.0122008, 0.0000222413, 0.0464], rpy: [-1.5708, 0, 0], color: PRINTED },
   ],
   upper_arm_link: [
      { stl: 'sts3215_03a_v1'    , xyz: [-0.11257, -0.0155, 0.0187], rpy: [-3.14159, 0, -1.5708], color: MOTOR },
      { stl: 'upper_arm_s0101_v1', xyz: [-0.065085, 0.012, 0.0182], rpy: [3.14159, 0, 0], color: PRINTED },
   ],
   lower_arm_link: [
      { stl: 'under_arm_so101_v1'         , xyz: [-0.0648499, -0.032, 0.0182], rpy: [3.14159, 0, 0], color: PRINTED },
      { stl: 'motor_holder_so101_wrist_v1', xyz: [-0.0648499, -0.032, 0.018], rpy: [-3.14159, 0, 0], color: PRINTED },
      { stl: 'sts3215_03a_v1'             , xyz: [-0.1224, 0.0052, 0.0187], rpy: [-3.14159, 0, -3.14159], color: MOTOR },
   ],
   wrist_link: [
      { stl: 'sts3215_03a_no_horn_v1'   , xyz: [0, -0.0424, 0.0306], rpy: [1.5708, 1.5708, 0], color: MOTOR },
      { stl: 'wrist_roll_pitch_so101_v2', xyz: [0, -0.028, 0.0181], rpy: [-1.5708, -1.5708, 0], color: PRINTED },
   ],
   gripper_link: [
      { stl: 'sts3215_03a_v1'              , xyz: [0.0077, 0.0001, -0.0234], rpy: [-1.5708, 0, 0], color: MOTOR },
      { stl: 'wrist_roll_follower_so101_v1', xyz: [0, -0.000218214, 0.000949706], rpy: [-3.14159, 0, 0], color: PRINTED },
   ],
   gripper_frame_link: [],                                     // no mesh: it only marks the point between the jaws
   moving_jaw_so101_v1_link: [
      { stl: 'moving_jaw_so101_v1', xyz: [0, 0, 0.0189], rpy: [0, 0, 0], color: PRINTED },
   ],
};

// Each joint sits at xyz/rpy in its parent's frame, turns about `axis` between
// lo and hi radians, and carries `link`. The six in order are the six motors.
export const JOINTS = [
   { name: 'shoulder_pan' , parent: 'robotBaseFrame', xyz: [ 0.0388353,  0          ,  0.0624   ], rpy: [ 3.14159, 0        , -3.14159], lo: -1.91986 , hi: 1.91986, axis: 'z', link: 'shoulder_link'            },
   { name: 'shoulder_lift', parent: 'shoulder_pan'  , xyz: [-0.0303992, -0.0182778  , -0.0542   ], rpy: [-1.5708 ,-1.5708   ,  0      ], lo: -1.74533 , hi: 1.74533, axis: 'y', link: 'upper_arm_link'           },
   { name: 'elbow_flex'   , parent: 'shoulder_lift' , xyz: [-0.11257  , -0.028      ,  0        ], rpy: [ 0      , 0        ,  1.5708 ], lo: -1.69    , hi: 1.69   , axis: 'z', link: 'lower_arm_link'           },
   { name: 'wrist_flex'   , parent: 'elbow_flex'    , xyz: [-0.1349   ,  0.0052     ,  0        ], rpy: [ 0      , 0        , -1.5708 ], lo: -1.65806 , hi: 1.65806, axis: 'z', link: 'wrist_link'               },
   { name: 'wrist_roll'   , parent: 'wrist_flex'    , xyz: [ 0        , -0.0611     ,  0.0181   ], rpy: [ 1.5708 , 0.0486795,  3.14159], lo: -2.74385 , hi: 2.84121, axis: 'y', link: 'gripper_link'             },
   { name: 'gripper'      , parent: 'wrist_roll'    , xyz: [ 0.0202   ,  0.0188     , -0.0234   ], rpy: [ 1.5708 , 0        ,  0      ], lo: -0.174533, hi: 1.74533, axis: 'y', link: 'moving_jaw_so101_v1_link' },
   { name: 'gripper_frame', parent: 'wrist_roll'    , xyz: [-0.0079   , -0.000218121, -0.0981274], rpy: [ 0      , 3.14159  ,  0      ], fixed: true,                       link: 'gripper_frame_link'       },
];
export const MOTORS = JOINTS.filter(j => !j.fixed);          // the six you can move

export const toDeg = rad => rad * 180 / Math.PI;
export const toRad = deg => deg * Math.PI / 180;

// The gripper is special. Its servo range is -10..+100 degrees, but the two jaws
// touch at about +12 degrees (measured from the STL meshes): below that the moving
// jaw passes through the fixed one, which the real robot cannot do. So its label
// shows the opening between the jaw tips in centimetres instead of an angle.
export const GRIPPER_CLOSED = toRad(12);      // jaws touch
const JAW_LENGTH_CM = 8.4;                     // pivot to tip; 2 L sin(a/2) matches the measured openings
export const jawsOverlap = angle => angle < GRIPPER_CLOSED;
export const gripperOpeningCm = angle => jawsOverlap(angle) ? 0 : 2 * JAW_LENGTH_CM * Math.sin((angle - GRIPPER_CLOSED) / 2);

// Keep an angle inside its joint's limits. For the gripper the lower limit is the
// physical one (the jaws touching, see GRIPPER_CLOSED below), not the servo's -10
// degrees: the real jaw is stopped by the other jaw, so the digital double is too.
export const physicalLo = joint => joint.name === 'gripper' ? GRIPPER_CLOSED : joint.lo;
export const clampAngle = (joint, angle) => Math.max(physicalLo(joint), Math.min(joint.hi, angle));

// How close an angle is to a limit: 0 at the middle of the range, 1 at either end.
export function limitFraction(joint, angle) {
   const mid = (joint.lo + joint.hi) / 2, half = (joint.hi - joint.lo) / 2;
   return half > 0 ? Math.min(1, Math.abs(angle - mid) / half) : 0;
}
export const NEAR_LIMIT = .85;                                 // from here on, warn

// ---------- A dial and a slider for each motor (the teach pendant panel) ----------
// Both run over the physical range, 0 at the low limit and 1 at the high limit, so
// the gripper's slider stops where the jaws touch. The dial is a 270-degree arc that
// starts at the lower left (t = 0) and sweeps clockwise to the lower right (t = 1).
export const sliderToAngle = (joint, v) => physicalLo(joint) + Math.max(0, Math.min(1, v)) * (joint.hi - physicalLo(joint));
export const angleToSlider = (joint, angle) => Math.max(0, Math.min(1, (angle - physicalLo(joint)) / (joint.hi - physicalLo(joint))));
export const dialAngle = t => 1.25 * Math.PI - 1.5 * Math.PI * t;      // radians on the canvas, counter-clockwise from +x
export function dial(joint, angle) {
   const mid = (joint.lo + joint.hi) / 2, half = (joint.hi - joint.lo) / 2;   // the warning band uses the URDF range, like the labels
   return { t: angleToSlider(joint, angle),
            nearLo: angleToSlider(joint, mid - NEAR_LIMIT * half),            // below this, NEAR LIMIT
            nearHi: angleToSlider(joint, mid + NEAR_LIMIT * half) };          // above this, NEAR LIMIT
}

// The text shown beside a joint: its name, its angle now, its range in degrees,
// and a warning near a limit. Example: 'ELBOW FLEX  +64 / -97..+97'.
export function jointLabel(joint, angle) {
   if (joint.name === 'gripper') {
      if (jawsOverlap(angle)) return 'GRIPPER  CLOSED  JAWS OVERLAP';          // only reachable from data, never from the scene
      const open = gripperOpeningCm(angle), max = gripperOpeningCm(joint.hi);
      if (open < .05) return 'GRIPPER  CLOSED  0.0 / ' + max.toFixed(1) + ' CM';
      return 'GRIPPER  OPEN ' + open.toFixed(1) + ' / ' + max.toFixed(1) + ' CM' + (limitFraction(joint, angle) >= 1 ? '  AT LIMIT' : '');
   }
   const deg = Math.round(toDeg(angle)), signed = d => (d >= 0 ? '+' : '') + d;
   const text = joint.name.toUpperCase().replace('_', ' ') + '  ' + signed(deg) +
                ' / ' + signed(Math.round(toDeg(joint.lo))) + '..' + signed(Math.round(toDeg(joint.hi)));
   const f = limitFraction(joint, angle);
   return f >= 1 ? text + '  AT LIMIT' : f >= NEAR_LIMIT ? text + '  NEAR LIMIT' : text;
}

// Annotation 2: the distance from the gripper to a target. Real-robot metres in,
// a label out; within GRAB_CM the jaws can close on it.
export const GRAB_CM = 3;
export function distanceLabel(metres) {
   const cm = metres * 100;
   return (cm <= GRAB_CM ? 'GRAB  ' : '') + cm.toFixed(1) + ' CM';
}

// ---------- Forward kinematics, the same arithmetic the scene graph does ----------
// A joint's own matrix: move to xyz, then turnZ, turnY, turnX (clay's order for rpy),
// with the motor's angle added to the component that is its axis.
export function jointMatrix(joint, angle = 0) {
   let [x, y, z] = joint.rpy;
   if (!joint.fixed) { if (joint.axis === 'z') z += angle; else y += angle; }
   return cg.mMultiply(cg.mTranslate(joint.xyz), cg.mMultiply(cg.mRotateZ(z), cg.mMultiply(cg.mRotateY(y), cg.mRotateX(x))));
}
// Every joint's matrix in the robot's base frame (metres, z up), for six motor angles.
export function forwardKinematics(angles) {
   const global = { robotBaseFrame: cg.mIdentity() };
   let i = 0;
   for (const j of JOINTS) global[j.name] = cg.mMultiply(global[j.parent], jointMatrix(j, j.fixed ? 0 : angles[i++]));
   return global;
}
export const tcpOf = angles => forwardKinematics(angles).gripper_frame.slice(12, 15);

// Which way should a thumbstick turn motor k so the gripper moves the way the stick
// is pushed? Nudge the angle and see where the gripper goes. `right` is the sign for
// the stick's x: robot +x is the player's right. `up` is the sign for pushing the
// stick forward: robot +z (up) if the motor lifts the gripper, otherwise robot +y
// (away from the player), as in most VR games. A motor that hardly moves the gripper
// (wrist roll, the gripper itself) falls back to: right or forward = positive.
export function stickSigns(angles, k, eps = .01) {
   const a = angles.slice(), b = angles.slice(); b[k] += eps;
   const d = cg.subtract(tcpOf(b), tcpOf(a)), n = cg.norm(d);
   if (n < eps * .05) return { right: 1, up: 1 };
   const right = Math.abs(d[0]) > .3 * n ? Math.sign(d[0]) : 0;
   const up = Math.abs(d[2]) > .3 * n ? Math.sign(d[2]) : Math.abs(d[1]) > .3 * n ? Math.sign(d[1]) : 0;
   return right || up ? { right, up } : { right: 1, up: 1 };
}

// The professor's demo motion from SO101.js: six slowly swinging angles.
export const demoMotion = time => [
   .3 * Math.cos(time * 1.2), .3 * Math.sin(time * 1.3), .3 * Math.cos(time * 1.4),
   .3 * Math.sin(time * 1.5), .3 * Math.cos(time * 1.6), .2 * Math.sin(time * 1.7),
];
