export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            // Follow the Coach: the ongoing project, extended every week
            { name: "coach"       , path: "./coach/coach.js"     , public: true },

            // HW2 games (single player)
            { name: "fishing"     , path: "./hw2/fishing.js"     , public: true },
            { name: "puppetRescue", path: "./hw2/puppetRescue.js", public: true },
            { name: "tinyPotionLab", path: "./hw2/tinyPotionLab.js", public: true },
            // HW1
            { name: "coachHW1"  , path: "./hw1/coach.js"            , public: true },   // as submitted for HW1
            { name: "marionette", path: "./hw1/marionette.js"       , public: true },
            { name: "signalRoom", path: "./hw1/signalRoom.js"       , public: true },

            // Personal experiments
            { name: "tentacle"  , path: "./playground/tentacle.js"  , public: true },
            { name: "myFirst"   , path: "./playground/myFirst.js"   , public: true },
            { name: "myWorld"   , path: "./playground/myWorld.js"   , public: true },

            // From class
            { name: "simple"   , path: "./simple.js"   , public: true },
            { name: "shapes"   , path: "./shapes.js"   , public: true },
            { name: "jointed"  , path: "./jointed.js"  , public: true },
            { name: "interact" , path: "./interact.js" , public: true },
            { name: "beam"     , path: "./beam.js"     , public: true },
            { name: "lines"    , path: "./lines.js"    , public: true },
            { name: "linefont" , path: "./linefont.js" , public: true },
            { name: "linefont2", path: "./linefont2.js", public: true },
            { name: "buddha"   , path: "./buddha.js"   , public: true },
            { name: "beamSphere", path: "./beamSphere.js", public: true },
            { name: "construct" , path: "./construct.js" , public: true },
      ]
   };
}
