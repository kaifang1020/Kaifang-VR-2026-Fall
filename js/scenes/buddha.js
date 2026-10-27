/*
   This shows how to incorporate GLTF models that were
   previously created in external modeling programs.
*/

import * as global from "../global.js";
import { quat } from "../render/math/gl-matrix.js";
import { Gltf2Node } from "../render/nodes/gltf2.js";

let buddha = new Gltf2Node({ url: './media/gltf/buddha_statue_broken/scene.gltf'});

export const init = async model => {
    buddha.translation = [0, 1.16, 0]; // 1.16 is pedestal height
    buddha.scale = [1.3,1.3,1.3];
    global.gltfRoot.addNode(buddha);

    const rotation = quat.create();
    model.animate(() => {
        // Rotate around the vertical axis once every 20 seconds.
        quat.setAxisAngle(rotation, [0, 1, 0], model.time * Math.PI / 10);
        buddha.rotation = rotation;
    });
 }
