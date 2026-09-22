export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            // HW1
            { name: "coach"     , path: "./hw1/coach.js"            , public: true },
            { name: "marionette", path: "./hw1/marionette.js"       , public: true },

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
      ]
   };
}
