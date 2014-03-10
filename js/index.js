var Plasmid = function(canvascontainer) {
	this.projector = new THREE.Projector();
	//The container for the canvas which will be rendered on
	this.canvascontainer = canvascontainer;
	//Timing
	this.deltaTime = 0;
	this.lastLoop = 0;
	this.currentTime = 0;
	//Resizing
	this.size = new THREE.Vector3();
	//References to important objects
	this.renderer = null;
	this.scene = null;
	this.camera = null;
	this.composer = null;
	//Whether or not to use the post-processing chain
	this.usePostProcess = true;
	this.useParticles = true;
	this.useAnaglpyh = window.location.hash == "#a";
	//Modifiers
	this.INLEVEL = 128;
	this.HISTORY = 256;
	//Constants
	this.LOADING = 0;
	this.DISABLED = 1;
	this.MAIN = 2;
	this.CREDITS = 3;
	this.LEVEL = 10 | this.INLEVEL | this.HISTORY;
	this.LEVELSELECT = 11;
	this.ARCADE = 20;
	this.LEVELEDITOR = 6 | this.INLEVEL | this.HISTORY;
	this.lerpspeed = 0.05; //How fast to lerp
	this.lerpepsilon = 0.001; //When to stop lerping (closeness)
	this.lerpqueue = [];
	//Defines the current visible screen
	this.state = this.LOADING;
	//Contains information for the loading screen
	this.loading = {
		progress: 0,
		ring: {
			size: 700,
			lerpspeed: 0.1,
			position: new THREE.Vector3(0, 0, 5),
			material: new THREE.ShaderMaterial({
				transparent: true,
				blending: THREE.AdditiveBlending,
				uniforms: {
					"progress": {
						"type": "f",
						"value": 0
					},
					"time": {
						"type": "f",
						"value": 0
					}
				},
				vertexShader: [
					"varying vec2 vUv;",
					"void main() {",
					"vUv = uv;",
					"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
					"}"
				].join("\n"),
				fragmentShader: [
					"uniform float progress;",
					"uniform float time;",
					"varying vec2 vUv;",
					//Taken from http://lolengine.net/blog/2013/07/27/rgb-to-hsv-in-glsl.
					"vec3 hsv2rgb(vec3 c) {",
					"vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);",
					"vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);",
					"return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);",
					"}",
					"void main() {",
					"vec2 center=vUv-vec2(0.5,0.5);",
					"float radius=length(center);",
					"float angle=1.0-(atan(center.y,center.x)+3.1415926)/6.2831853;",
					"if(radius>0.5||radius<0.42||mod(angle*200.0,1.0)<0.5){",
					"discard;",
					"};",
					"float value=mod(angle+0.75,1.0)<progress?1.0:0.3;",
					"float hue=mod(angle*2.0-time*0.2,1.0);",
					"gl_FragColor=vec4(hsv2rgb(vec3(hue,1.0,value)),1.0);",
					"}"
				].join("\n")
			})
		}
	}
	//Defines constants for interaction and the camera
	this.interaction = {
		maxHeight: 0, //The (approximate) maximum visible height of the interaction plane when viewed through the camera
		interactionDistance: 50, //The z-distance from the origin of interactable objects
		interactableDistance: 100, //Minimum distance for the cursor to buttons and other interactable objects
		interactableAspect: 2, //The width/height aspect ratio for buttons
		levelViewDistance: 1000, //The default z-distance from the origin of the camera
		menuViewDistance: 1100, //The main-menu z-distance from the origin of the camera
		adjustedProjectionDistance: 60, //The compensation factor for the approximate inverse projection
		cursor: {
			position: new THREE.Vector3(),
			projected: new THREE.Vector3(),
			visible: false,
			down: false,
			handleUp: false,
			handleMove: false,
			handleDown: false,
			handleVisibility: false
		},
		selection: {
			nearest: null, //Used by level_nearest()
			nearestDistance: Infinity, //Used by level_nearest()
			distance: 150, //Minimum distance in order to select.
			selecting: false,
			fromHandle: null,
			toHandle: null
		}
	}
	//Defines the current camera field of view and look-at target
	this.view = {
		fov: 45, //The field of view of the camera
		near: 0.1, //The near value of the camera
		far: 10000, //The far value of the camera
		lookAt: new THREE.Vector3(0, 0, 0), //Where the camera should look (lerped)
		_lookAt: new THREE.Vector3(0, 0, 0), //Where the camera should look
		position: new THREE.Vector3(0, 0, this.interaction.menuViewDistance), //The camera's intended position (lerped)
		_position: new THREE.Vector3(0, 0, this.interaction.menuViewDistance), //The camera's intended position
		tilt: new THREE.Vector3(0, 0, 0),
		_tilt: new THREE.Vector3(0, 0, 0),
		maxTilt: 100, //The max amount to tilt
		defaultspeed: 0.05, //How fast to change, by default
		tiltspeed: 0.1, //How fast to change on device orientation, by default
		returnspeed: 0.02, //How fast to return to the cursor
		returning: false, //Returning to the cursor?
		snap: 0, //The speed to transition the tilt
	}
	//Defines which image assets are needed, and stores them once loaded.
	this.images = {
		source: {
			particle: "Particle.png",
			logo: "Logo.png",
			rays: "Rays.png",
			handle: "Handle.png",
			complete: "Complete.png",
			counter: "Counter.png",
			history: "History.png",
			mainmenu: "MainMenu.png",
			menucontrols: "MenuControls.png",
			credits: "Credits.png"
		},
		count: 0,
		loaded: 0
	}
	//Holds settings for text, to be used where needed
	this.textmaterialsettings = {
		map: null,
		opacity: 0,
		blending: THREE.AdditiveBlending,
		transparent: true,
		depthWrite: false
	}
	//Holds and initializes all text
	this.text = {
		logo: {
			width: 400,
			position: new THREE.Vector3(0, 0, 250), //Where to place the logo
			map: "logo",
			opacity: function() {
				return this.state == this.MAIN ? 1 : 0;
			}
		},
		credits: {
			width: 400,
			position: new THREE.Vector3(0, 0, 250), //Where to place the credits
			map: "credits",
			opacity: null
		},
		completionType: {
			width: 280,
			//The text that says "genome" or "plasmid" in "plasmid complete"
			position: new THREE.Vector3(0, 100, 150), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			offset: new THREE.Vector2(0, 2 / 3),
			map: "complete",
			opacity: null
		},
		completionText: {
			width: 400,
			//The text that says "complete" in "plasmid complete"
			position: new THREE.Vector3(0, 0, 251), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			offset: new THREE.Vector2(0, 1 / 3),
			map: "complete",
			opacity: null
		},
		counter: {
			//The number representing the mutations remaining
			width: 120,
			position: new THREE.Vector3(0, 0, 252), //Where to place the text
			repeat: new THREE.Vector2(1 / 5, 1 / 3),
			map: "counter",
			opacity: function() {
				return (this.state & this.INLEVEL) != 0 ? 1 : 0;
			}
		},
		counterlabel: {
			//The text that says "mutations left"
			width: 400,
			position: new THREE.Vector3(0, -170, 151), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			map: "counter",
			opacity: function() {
				return (this.state & this.INLEVEL) != 0 ? 1 : 0;
			}
		},
		undo: {
			width: 200,
			position: new THREE.Vector3(-0, -300, this.interaction.interactionDistance), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			offset: new THREE.Vector2(0, 2 / 3),
			map: "history",
			opacity: function() {
				return this.level_can_undo() ? 1 : 0;
			},
			handler: function() {
				if ((this.state & this.HISTORY) != 0) {
					this.level_undo();
					return false;
				}
			}
		},
		redo: {
			width: 200,
			position: new THREE.Vector3(0, -300, this.interaction.interactionDistance), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			offset: new THREE.Vector2(0, 1 / 3),
			map: "history",
			opacity: function() {
				return this.level_can_redo() ? 1 : 0;
			},
			handler: function() {
				if ((this.state & this.HISTORY) != 0) {
					this.level_redo();
					return false;
				}
			}
		},
		reset: {
			width: 200,
			position: new THREE.Vector3(-0, 300, this.interaction.interactionDistance), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 3),
			offset: new THREE.Vector2(0, 0),
			map: "history",
			opacity: function() {
				return this.level_can_reset() ? 1 : 0;
			},
			handler: function() {
				if ((this.state & this.HISTORY) != 0) {
					this.level_reset();
					return false;
				}
			}
		},
		pause: {
			width: 300,
			position: new THREE.Vector3(0, 300, this.interaction.interactionDistance), //Where to place the text
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 1 / 4),
			map: "menucontrols",
			opacity: function() {
				return (this.state & this.INLEVEL) != 0;
			},
			handler: function() {
				if ((this.state & this.INLEVEL) != 0) {
					this.state = this.MAIN;
					this.update_ui();
					return false;
				}
			}
		},
		campaign: {
			width: 400,
			position: new THREE.Vector3(550, 0, this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, 0),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 3 / 4),
			map: "mainmenu",
			opacity: function() {
				return this.state == this.MAIN ? 1 : 0;
			},
			handler: function() {
				if (this.state == this.MAIN) {
					this.state = this.LEVEL;
					this.level_load();
					return false;
				}
			}
		},
		reactor: {
			width: 400,
			position: new THREE.Vector3(550 * Math.cos(-0.3), 550 * Math.sin(-0.3), this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, -0.3),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 1 / 4),
			map: "mainmenu",
			opacity: function() {
				return this.state == this.MAIN ? 0.1 : 0;
			},
			handler: function() {}
		},
		detonator: {
			width: 400,
			position: new THREE.Vector3(550 * Math.cos(-0.6), 550 * Math.sin(-0.6), this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, -0.6),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 2 / 4),
			map: "mainmenu",
			opacity: function() {
				return this.state == this.MAIN ? 0.1 : 0;
			},
			handler: function() {}
		},
		practice: {
			width: 400,
			position: new THREE.Vector3(550 * Math.cos(0.3), 550 * Math.sin(0.3), this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, 0.3),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 0),
			map: "mainmenu",
			opacity: function() {
				return this.state == this.MAIN ? 0.1 : 0;
			},
			handler: function() {}
		},
		nextlevel: {
			width: 400,
			position: new THREE.Vector3(-550 * Math.cos(0.3), 550 * Math.sin(0.3), this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, -0.3),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 3 / 4),
			map: "menucontrols",
			opacity: function() {
				return this.state == this.MAIN ? this.level_can_next() ? 1 : 0.1 : 0;
			},
			handler: function() {
				if (this.state == this.MAIN && this.level_can_next()) {
					this.level_next();
					return false;
				}
			}
		},
		previouslevel: {
			width: 400,
			position: new THREE.Vector3(-550, 0, this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, 0),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 2 / 4),
			map: "menucontrols",
			opacity: function() {
				return this.state == this.MAIN ? this.level_can_previous() ? 1 : 0.1 : 0;
			},
			handler: function() {
				if (this.state == this.MAIN && this.level_can_previous()) {
					this.level_previous();
					return false;
				}
			}
		},
		help: {
			width: 400,
			position: new THREE.Vector3(-550 * Math.cos(-0.3), 550 * Math.sin(-0.3), this.interaction.interactionDistance),
			rotation: new THREE.Euler(0, 0, 0.2),
			repeat: new THREE.Vector2(1, 1 / 4),
			offset: new THREE.Vector2(0, 0),
			map: "menucontrols",
			opacity: function() {
				return this.state == this.MAIN ? 1 : 0;
			},
			handler: function() {
				if (this.state == this.MAIN) {
					window.location = "about:blank";
				}
			}
		}
	}
	//Contains objects that make up the main menu, along with the menu state
	// this.mainmenu = {
	// }
	//Contains objects and variables for the credits
	this.credits = {
		scroll: 0, //The credit scroll amount [0-1]
		_scroll: 0, //Whether or not to show credits (0|1)
		duration: 30, //How many seconds it should take
	}
	//Contains objects that constitute the background, as well as their settings
	this.ambient = {
		rays: {
			object: null,
			material: new THREE.MeshBasicMaterial({
				blending: THREE.AdditiveBlending,
				opacity: 0.1,
				transparent: true
			}),
			geometry: null,
			raySpeed: 0.02 //How fast the rays move
		},
		particles: {
			object: null,
			boxSize: new THREE.Vector3(1500, 1000, 1800),
			geometry: new THREE.BufferGeometry(),
			numParticles: 256,
			toMaxVelocity: 15,
			minVelocity: 1,
			material: new THREE.ShaderMaterial({
				transparent: true,
				blending: THREE.AdditiveBlending,
				//depthWrite: false,
				//depthTest: false,
				uniforms: {
					"opacity": {
						"type": "f",
						"value": this.useAnaglpyh ? 1 : 0.3
					},
					"map": {
						"type": "t",
						"value": null
					},
					"size": {
						"type": "f",
						"value": 10
					},
					"scale": {
						"type": "f",
						"value": 512
					},
					"boxSize": {
						"type": "v3",
						"value": new THREE.Vector3(0, 0, 0)
					},
					"offset": {
						"type": "v3",
						"value": new THREE.Vector3(0, 0, 0)
					},
					"time": {
						"type": "f",
						"value": 0
					}
				},
				attributes: {
					"velocity": {
						"type": "f",
						"value": null
					}
				},
				vertexShader: [
					"uniform float size;",
					"uniform float scale;",
					"uniform float time;",
					"uniform vec3 boxSize;",
					"uniform vec3 offset;",
					"attribute float velocity;",
					"varying float fade;",
					"void main(){",
					"vec3 pos=position + boxSize*offset;",
					"pos.y+=time*velocity;",
					"pos.x=mod(pos.x,boxSize.x)-boxSize.x*0.5;",
					"pos.y=mod(pos.y,boxSize.y)-boxSize.y*0.5;",
					"pos.z=mod(pos.z,boxSize.z)-boxSize.z*0.5;",
					"fade=min(1.0,3.0-3.0*abs(pos.z/(boxSize.z*0.5)));",
					"vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );",
					"gl_PointSize = size * ( scale / length( mvPosition.xyz ) );",
					"gl_Position = projectionMatrix * mvPosition;",
					"}"
				].join("\n"),
				fragmentShader: [
					"uniform float opacity;",
					"uniform sampler2D map;",
					"varying float fade;",
					"void main() {",
					"gl_FragColor = texture2D( map, vec2( gl_PointCoord.x, 1.0 - gl_PointCoord.y ) );",
					"gl_FragColor.w = opacity * fade;",
					"}"
				].join("\n")
			})
		},
		background: {
			object: null,
			lerpspeed: 0.05,
			material: new THREE.MeshBasicMaterial({
				color: 0xFFFFFF,
				vertexColors: THREE.VertexColors
			}),
			updateColors: function() {
				this.ambient.background.object.geometry.colorsNeedUpdate = true;
			},
			geometry: null,
			colorBottom: new THREE.Color(0x000000),
			colorTop: new THREE.Color(0x000000)
		}
	}
	//Defines shaders for use with post-processing.
	this.shaders = {
		displace: {
			uniforms: {
				"tDiffuse": {
					type: "t",
					value: null
				},
				"phase": {
					type: "f",
					value: 0
				},
				"resolution": {
					type: "v3",
					value: 0
				}
			},
			vertexShader: [
				"varying vec2 vUv;",
				"void main() {",
				"vUv = uv;",
				"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
				"}"
			].join("\n"),
			fragmentShader: [
				"uniform sampler2D tDiffuse;",
				"uniform float phase;",
				"uniform vec3 resolution;",
				"varying vec2 vUv;",
				"void main() {",
				"vec2 toCenter=(vUv-vec2(0.5,0.5));",
				"toCenter.y*=resolution.y/resolution.x;",
				"float factor=0.05*max(0.0,1.0-15.0*abs(-1.5*phase+0.1+length(toCenter)));",
				"gl_FragColor=texture2D(tDiffuse,vUv+normalize(toCenter)*factor);",
				"}"
			].join("\n")
		},
		desaturate: {
			uniforms: {
				"tDiffuse": {
					type: "t",
					value: null
				},
				"amount": {
					type: "f",
					value: 0
				}
			},
			vertexShader: [
				"varying vec2 vUv;",
				"void main() {",
				"vUv = uv;",
				"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
				"}"
			].join("\n"),
			fragmentShader: [
				"uniform sampler2D tDiffuse;",
				"uniform float amount;",
				"varying vec2 vUv;",
				"void main() {",
				"gl_FragColor=texture2D(tDiffuse,vUv);",
				"float luma=dot(vec3(0.2126,0.7152,0.0722),gl_FragColor.xyz)*amount;",
				"gl_FragColor.x=gl_FragColor.x*(1.0-amount)+luma;",
				"gl_FragColor.y=gl_FragColor.y*(1.0-amount)+luma;",
				"gl_FragColor.z=gl_FragColor.z*(1.0-amount)+luma;",
				"}"
			].join("\n")
		},
		vignette: {
			uniforms: {
				"tDiffuse": {
					type: "t",
					value: null
				}
			},
			vertexShader: [
				"varying vec2 vUv;",
				"void main() {",
				"vUv = uv;",
				"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
				"}"
			].join("\n"),
			fragmentShader: [
				"uniform sampler2D tDiffuse;",
				"varying vec2 vUv;",
				"void main() {",
				"float toCenter= length(vec2(0.9,1.0)*(vUv-vec2(0.5,0.5)));",
				"gl_FragColor=texture2D(tDiffuse,vUv)*clamp(1.0-toCenter*toCenter,0.2,1.0);",
				"}"
			].join("\n")
		},
		chromaticAbberation: {
			uniforms: {
				"tDiffuse": {
					type: "t",
					value: null
				},
				"amount": {
					type: "f",
					value: 0.998
				}
			},
			vertexShader: [
				"varying vec2 vUv;",
				"void main() {",
				"vUv = uv;",
				"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
				"}"
			].join("\n"),
			fragmentShader: [
				"uniform sampler2D tDiffuse;",
				"uniform float amount;",
				"varying vec2 vUv;",
				"void main(){",
				"gl_FragColor=texture2D(tDiffuse,vUv);",
				"gl_FragColor.y=texture2D(tDiffuse,vec2(0.5,0.5)+(vUv+vec2(-0.5,-0.5))*amount).y;",
				"gl_FragColor.z=texture2D(tDiffuse,vec2(0.5,0.5)+(vUv+vec2(-0.5,-0.5))*(1.0/amount)).z;",
				"}",
			].join("\n")
		},
		fxaa: {
			uniforms: {
				"tDiffuse": {
					type: "t",
					value: null
				},
				"resolution": {
					type: "v3",
					value: this.size
				}
			},
			vertexShader: [
				"varying vec2 vUv;",
				"void main() {",
				"vUv = uv;",
				"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
				"}"
			].join("\n"),
			fragmentShader: [
				"uniform sampler2D tDiffuse;",
				"uniform vec3 resolution;",
				"varying vec2 vUv;",

				"void main() {",

				"float FXAA_SPAN_MAX = 8.0;",
				"float FXAA_REDUCE_MUL = 1.0/8.0;",
				"float FXAA_REDUCE_MIN = (1.0/128.0);",

				"vec2 invSize = vec2(1.0/resolution.x, 1.0/resolution.y);",

				"vec3 rgbNW = texture2D(tDiffuse, vUv + (vec2(-1.0, -1.0) * invSize)).xyz;",
				"vec3 rgbNE = texture2D(tDiffuse, vUv + (vec2(+1.0, -1.0) * invSize)).xyz;",
				"vec3 rgbSW = texture2D(tDiffuse, vUv + (vec2(-1.0, +1.0) * invSize)).xyz;",
				"vec3 rgbSE = texture2D(tDiffuse, vUv + (vec2(+1.0, +1.0) * invSize)).xyz;",
				"vec3 rgbM  = texture2D(tDiffuse, vUv).xyz;",

				"vec3 luma = vec3(0.299, 0.587, 0.114);",
				"float lumaNW = dot(rgbNW, luma);",
				"float lumaNE = dot(rgbNE, luma);",
				"float lumaSW = dot(rgbSW, luma);",
				"float lumaSE = dot(rgbSE, luma);",
				"float lumaM  = dot( rgbM, luma);",

				"float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));",
				"float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));",

				"vec2 dir;",
				"dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));",
				"dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));",

				"float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);",

				"float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);",

				"dir = min(vec2(FXAA_SPAN_MAX,  FXAA_SPAN_MAX), ",
				"max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * invSize;",

				"vec3 rgbA = (1.0/2.0) * (",
				"texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).xyz +",
				"texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).xyz);",
				"vec3 rgbB = rgbA * (1.0/2.0) + (1.0/4.0) * (",
				"texture2D(tDiffuse, vUv + dir * (0.0/3.0 - 0.5)).xyz +",
				"texture2D(tDiffuse, vUv + dir * (3.0/3.0 - 0.5)).xyz);",
				"float lumaB = dot(rgbB, luma);",

				"if((lumaB < lumaMin) || (lumaB > lumaMax)){",
				"gl_FragColor.xyz=rgbA;",
				"} else {",
				"gl_FragColor.xyz=rgbB;",
				"}",
				"gl_FragColor.a = 1.0;",
				"}"
			].join("\n")
		}
	}
	//Contains data for each level and level pack. Time to call in the level designers!
	this.levelpacks = [
		//Intro
		{
			ambient: {
				//music:"",
				background: {
					colorTop: new THREE.Color(0x009900),
					colorBottom: new THREE.Color(0x002200)
				},
				palette: [
					new THREE.Color(0x008800),
					new THREE.Color(0x5AFF9F),
					new THREE.Color(0xCCFF00),
					new THREE.Color(0x00CC00)
				]
			},
			levels: [
				//1 x Single
				{
					"segments": [{
						"from": 1,
						"to": 0
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 1
				},
				//2 x singles across the circle
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 2,
						"to": 1
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 0,
						"to": 3
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 2
				},
				//2 x singles next to each other
				{
					"segments": [{
						"from": 1,
						"to": 0
					}, {
						"from": 2,
						"to": 1
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 2
				},
				// 1 x Double
				{
					"segments": [{
						"from": 2,
						"to": 1
					}, {
						"from": 1,
						"to": 0
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 1
				},
				//Single next to a double 
				{
					"segments": [{
						"from": 1,
						"to": 0
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 2,
						"to": 1
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 2
				}
			]
		},
		//Testing the waters
		{
			ambient: {
				//music:"",
				background: {
					colorTop: new THREE.Color(0x6666CC),
					colorBottom: new THREE.Color(0x003355)
				},
				palette: [
					new THREE.Color(0x4650AD),
					new THREE.Color(0x06FFC5),
					new THREE.Color(0x71DEE8),
					new THREE.Color(0x0099FF)
				]
			},
			levels: [
				//2 x Double switch
				{
					"segments": [{
						"from": 2,
						"to": 1
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 0,
						"to": 1
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 2
				},
				//2 x Double, 1 x Single
				{
					"segments": [{
						"from": 2,
						"to": 1
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 1,
						"to": 0
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 3
				},
				//Transposition: 1 x Double, 2 x Single
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 3,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 3
				},
				//2 x Single, 1 x Double
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 0,
						"to": 3
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 3
				},
				//3 x Double!
				{
					"segments": [{
						"from": 2,
						"to": 1
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 0,
						"to": 3
					}, {
						"from": 1,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3]
					],
					"generations": 3
				}
			]
		},
		//Heating up
		{
			ambient: {
				//music:"",
				background: {
					colorTop: new THREE.Color(0xDD0000),
					colorBottom: new THREE.Color(0xCC8800)
				},
				palette: [
					new THREE.Color(0xFF1F00),
					new THREE.Color(0xFFA000),
					new THREE.Color(0xFFFB00),
					new THREE.Color(0xFF6C00),
					new THREE.Color(0xFFFF55)
				]
			},
			levels: [
				//2 x Double, 1 x Single, non-intersecting
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 3,
						"to": 4
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 4,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3, 4]
					],
					"generations": 3
				},
				//2 x Single on both ends of a 1 x Double, non-intersecting
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 3,
						"to": 4
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 4,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3, 4]
					],
					"generations": 3
				},
				//2 x Double (Intersecting) and 1 x Single, non-intersecting.
				{
					"segments": [{
						"from": 1,
						"to": 2
					}, {
						"from": 4,
						"to": 0
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 3,
						"to": 4
					}, {
						"from": 1,
						"to": 0
					}],
					"locations": [
						[0, 1, 2, 3, 4]
					],
					"generations": 3
				},
				//3 x Double, all with 1 overlap, no repeats.
				{
					"segments": [{
						"from": 1,
						"to": 0
					}, {
						"from": 2,
						"to": 3
					}, {
						"from": 4,
						"to": 0
					}, {
						"from": 2,
						"to": 1
					}, {
						"from": 3,
						"to": 4
					}],
					"locations": [
						[0, 1, 2, 3, 4]
					],
					"generations": 3
				},
				//2 x Single, each on a 2 x Double. Later?
				{
					"segments": [{
						"from": 0,
						"to": 1
					}, {
						"from": 3,
						"to": 2
					}, {
						"from": 1,
						"to": 2
					}, {
						"from": 4,
						"to": 0
					}, {
						"from": 4,
						"to": 3
					}],
					"locations": [
						[0, 1, 2, 3, 4]
					],
					"generations": 4
				},
			]
		}
		/*, {
		ambient: {
			//music:"",
			background: {
				colorTop: new THREE.Color(0xCC00CC),
				colorBottom: new THREE.Color(0xFFFF00)
			},
			palette: [
				new THREE.Color(0xCC00CC),
				new THREE.Color(0xFFDD00),
				new THREE.Color(0xDDDD00)
			]
		},
		levels: []
	}*/
	]
	//Contains the state of the current level and necessary data to show the level
	this.current = {
		segments: [], //An array holding the current segments and their meshes that are needed for the current level
		pack: null, //A reference to the current (game data) level pack
		level: null, //A reference to the current (game data) level
		save: null, //A reference to the save data to the current level, containing location and history
		handles: [], //An array holding all handle objects
		locations: null,
		history: null,
		generation: 0
	}
	//Contains assets and settings relevant the level ring and UI
	this.level = {
		completion: {
			complete: 0, //The completeness amount [0-1]
			_complete: 0, //Whether or not to complete (0|1)
			ringspeed: 0.2, //How fast to lerp the segments when complete
			blastspeed: 0.02, //How fast to lerp the blast
			handleopacityspeed: 0.1, //How fast to lerp handle opacity
			textopacityspeed: 0.05, //How fast to lerp text opacity
			rearDistance: -500, //From what rear distance to begin transitioning forwards
			ringopacityspeed: 0.02, //How fast to transition opacity of the ring
			duration: 3.5, //How many seconds it should take
		},
		object: new THREE.Object3D(), //The object that holds the entire level.
		handle: {
			visible: false,
			size: 100,
			inwards: 0.2, //How far (relative to the ring thickness) to move inwards
			material: new THREE.MeshBasicMaterial({
				transparent: true,
				opacity: 0,
				_opacity: 0,
				blending: THREE.AdditiveBlending,
				depthWrite: false
			})
		},
		ring: {
			subdivisions: 32, //How many sections to split each segment into
			separation: 0.1, //How many radians to keep between segments
			minRadius: 300, //The minimum (inside) radius of the ring
			thickness: 50, //The thickness of the ring
			concentric: -140, //The gap between concentric rings
			offset: 0.2, //The offset (in radians) between concentric rings
			lerpspeed: 0.1, //How fast to switch segments
			speed: 0.1, //How fast to switch segments
			zoomspeed: 1.05, //How fast to zoom upon level completion
			visible: false,
			materialSettings: {
				opacity: 0,
				color: 0xFFFFFF,
				//vertexColors: THREE.VertexColors,
				side: THREE.DoubleSide,
				transparent: true,
				//blending: THREE.AdditiveBlending,
				uniforms: {
					"opacity": {
						"type": "f",
						"value": 1
					},
					"startAngle": {
						type: "f",
						value: 0
					},
					"deltaAngle": {
						type: "f",
						value: 0
					},
					"startRadius": {
						type: "f",
						value: 0
					},
					"deltaRadius": {
						type: "f",
						value: 0
					},
					"fromColor": {
						type: "c",
						value: new THREE.Color(0xFFFFFF)
					},
					"toColor": {
						type: "c",
						value: new THREE.Color(0xFFFFFF)
					}
				},

				vertexShader: [
					"uniform float startAngle;",
					"uniform float deltaAngle;",
					"uniform float startRadius;",
					"uniform float deltaRadius;",
					"uniform vec3 fromColor;",
					"uniform vec3 toColor;",
					"varying vec3 vColor;",
					//THREE.ShaderChunk["color_pars_vertex"],

					"void main() {",

					"float radius=startRadius+deltaRadius*position.y;",
					"float theta=startAngle+deltaAngle*position.x;",

					//THREE.ShaderChunk["color_vertex"],
					"vColor = fromColor*(1.0-position.x)+toColor*position.x;",

					"gl_Position = projectionMatrix * modelViewMatrix * vec4( radius * cos(theta), radius * sin(theta), position.z, 1.0 );",
					//THREE.ShaderChunk["default_vertex"],

					"}"

				].join("\n"),

				fragmentShader: [
					"uniform float opacity;",
					"varying vec3 vColor;",
					//THREE.ShaderChunk["color_pars_fragment"],

					"void main() {",

					THREE.ShaderChunk["alphatest_fragment"],
					//THREE.ShaderChunk["color_fragment"],
					"gl_FragColor = vec4( vColor, opacity );",

					THREE.ShaderChunk["linear_to_gamma_fragment"],

					THREE.ShaderChunk["fog_fragment"],

					"}"

				].join("\n")
			}
		},
		drag: {
			_deltaAngle: 0,
			_deltaRadius: 0,
			snap: 0,
			handlespeed: 0.2, //How fast to snap to handles
			finishspeed: 0.1, //How fast to shrink to nothingness at end
			returnspeed: 0.05, //How fast to return to the cursor
			object: null,
			geometry: null,
			subdivisions: 64,
			material: new THREE.ShaderMaterial({
				blending: THREE.AdditiveBlending,
				//wireframe: true,
				uniforms: {
					"diffuse": {
						"type": "c",
						"value": new THREE.Color(0xFFFFFF)
					},
					"opacity": {
						"type": "f",
						"value": 1
					},
					"startAngle": {
						type: "f",
						value: 0
					},
					"deltaAngle": {
						type: "f",
						value: 0
					},
					"startRadius": {
						type: "f",
						value: 0
					},
					"deltaRadius": {
						type: "f",
						value: 0
					}
				},

				vertexShader: [
					"uniform float startAngle;",
					"uniform float deltaAngle;",
					"uniform float startRadius;",
					"uniform float deltaRadius;",

					"void main() {",

					"float radius=startRadius+deltaRadius*position.x;",
					"float theta=startAngle+deltaAngle*position.x;",
					"vec3 pos=vec3(radius * cos(theta), radius * sin(theta), position.z);",
					//Use some calculus! Numerical differentiation for the win!
					"vec3 deltaPos=5.0*normalize(vec3((radius-deltaRadius*0.001) * cos(theta-deltaAngle*0.001), (radius-deltaRadius*0.001) * sin(theta-deltaAngle*0.001), position.z)-pos);",
					//Then, throw in some rotation matrices
					"if(position.y>0.5){",
					"pos=vec3(pos.x+deltaPos.y,pos.y-deltaPos.x,pos.z);",
					"}",
					"else{",
					"pos=vec3(pos.x-deltaPos.y,pos.y+deltaPos.x,pos.z);",
					"}",
					"gl_Position = projectionMatrix * modelViewMatrix * vec4( pos, 1.0 );",

					"}"

				].join("\n"),

				fragmentShader: [

					"uniform vec3 diffuse;",
					"uniform float opacity;",

					"void main() {",

					THREE.ShaderChunk["alphatest_fragment"],

					"gl_FragColor = vec4( diffuse,opacity);",

					THREE.ShaderChunk["linear_to_gamma_fragment"],

					THREE.ShaderChunk["fog_fragment"],

					"}"

				].join("\n")
			})
		}
	}
	//Contains settings relevant to the level editor
	this.editor = {
		rings: 1,
		segments: 4,
		pack: this.levelpacks[1]
	}
	//The object that is saved and restored, containing current level and previous level histories.
	this.savedata = {
		levelpack: 0,
		level: 0,
		levelpacks: []
	}
	//Sets things up the first time around.
	this.setup();
}
Plasmid.prototype = {
	//Shows/hides items as appropriate.
	update_ui: function(override_lerpspeed) {
		var lerpspeed = override_lerpspeed || this.lerpspeed;
		if (this.state == this.MAIN) {
			this.level.ring.visible = true;
			this.view.position.set(0, 0, this.interaction.menuViewDistance);
			this.view.lookAt.set(0, 0, 0);
		}
		if ((this.state & this.INLEVEL) != 0) {
			//In a level
			this.view.position.set(0, 0, this.interaction.levelViewDistance);
			this.view.lookAt.set(0, 0, 0);
		}
		if (this.state == this.CREDITS) {
			this.credits._scroll = 1;
			//Hide all segments immediately
			// for (var i = 0; i < this.current.segments.length; i++) {
			// 	var segment = this.current.segments[i];
			// 	this.lerp_add(segment.object.material.uniforms.opacity, "value", 0, 1);
			// }
			//Hide everything
			this.level.ring.visible = false;
		}
		//Handle the text!
		for (var t in this.text) {
			var text = this.text[t];
			if (text.override_opacity !== null) {
				this.lerp_add(text.material, "opacity", text.override_opacity, lerpspeed);
				text.override_opacity = null;
			} else if ("opacity" in text) {
				if (typeof text.opacity == "function") {
					this.lerp_add(text.material, "opacity", text.opacity.call(this), lerpspeed);
				} else if (typeof text.opacity == "number") {
					this.lerp_add(text.material, "opacity", text.opacity, lerpspeed);
				}
			}
		}
		//Handle the handles!
		this.lerp_add(this.level.handle.material, "opacity", (this.state & this.INLEVEL) == 0 ? 0 : 1, lerpspeed);
		//Handle the segments!
		for (var i = 0; i < this.current.segments.length; i++) {
			var segment = this.current.segments[i];
			this.lerp_add(segment.object.material.uniforms.opacity, "value", this.level.ring.visible ? 1 : 0, lerpspeed);
		}
	},
	//Returns whether or not the user can reset
	level_can_reset: function() {
		return (this.state & this.HISTORY) != 0 && this.current.generation > 0;
	},
	//Returns whether or not the user can undo
	level_can_undo: function() {
		return (this.state & this.HISTORY) != 0 && this.current.generation > 0;
	},
	//Returns whether or not the user can redo
	level_can_redo: function() {
		return (this.state & this.HISTORY) != 0 && this.current.generation < this.current.history.length - 1;
	},
	//Resets the level
	level_reset: function() {
		if (this.level_can_reset()) {
			this.current.generation = 0;
			this.level_update();
		}
	},
	//Undoes the previous action
	level_undo: function() {
		if (this.level_can_undo()) {
			this.current.generation--;
			this.level_update();
		}
	},
	//Redoes. Period.
	level_redo: function() {
		if (this.level_can_redo()) {
			this.current.generation++;
			this.level_update();
		}
	},
	//Returns whether or not the user can visit the previous level.
	level_can_previous: function() {
		if ((this.savedata.level - 1) in this.levelpacks[this.savedata.levelpack].levels) {
			return true;
		} else if ((this.savedata.levelpack - 1) in this.levelpacks) {
			return true
		}
		return false;
	}, //Returns whether or not the user can visit the next level.
	level_can_next: function() {
		if ((this.savedata.level + 1) in this.savedata.levelpacks[this.savedata.levelpack]) {
			return true;
		} else if ((this.savedata.levelpack + 1) in this.savedata.levelpacks) {
			return true
		}
		return false;
	},
	//Decrements and updates the level
	level_previous: function() {
		if ((this.savedata.level - 1) in this.levelpacks[this.savedata.levelpack].levels) {
			this.savedata.level--;
			this.level_load();
			return true;
		} else {
			if ((this.savedata.levelpack - 1) in this.levelpacks) {
				this.savedata.levelpack--;
				this.savedata.level = this.levelpacks[this.savedata.levelpack].levels.length - 1;
				this.level_load();
				return true;
			}
		}
		return false;
	}, //Increments and updates the level
	level_next: function() {
		if ((this.savedata.level + 1) in this.levelpacks[this.savedata.levelpack].levels) {
			this.savedata.level++;
			this.level_load();
			return true;
		} else {
			if ((this.savedata.levelpack + 1) in this.levelpacks) {
				this.savedata.levelpack++;
				this.savedata.level = 0;
				this.level_load();
				return true;
			} else {
				if (this.level.completion._complete > 0) {
					console.log("GAME COMPLETE!");
					this.state = this.CREDITS;
					//this.update_ui();
				}
			}
		}
		return false;
	},
	//Gets the nearest handle from a position, setting the results into the interaction object
	level_nearest: function() {
		this.interaction.nearest = null;
		this.interaction.selection.nearestDistance = Infinity;
		for (var i = 0; i < this.current.handles.length; i++) {
			var dist = this.current.handles[i].object.position.distanceTo(this.interaction.cursor.projected);
			if (dist < this.interaction.selection.nearestDistance) {
				this.interaction.selection.nearestDistance = dist;
				this.interaction.selection.nearest = this.current.handles[i];
			}
		}
	},
	//Makes a move to the current level
	level_move: function(handle1, handle2) {
		if ((this.state & this.INLEVEL) != 0) {
			//Leave this copy in history.
			this.current.locations = this.utils_clone(this.current.locations);
			if (handle1.ring == handle2.ring) {
				//Reverse
				var ring = this.current.locations[handle1.ring];
				//Make sure we take the shortcut, not the long-cut
				if (handle2.segment < handle1.segment && handle2.segment + 1 + ring.length - handle1.segment > handle1.segment - handle2.segment || handle2.segment > handle1.segment && handle1.segment + ring.length - handle2.segment < handle2.segment - handle1.segment) {
					var temp = handle2;
					handle2 = handle1;
					handle1 = temp;
				}
				if (handle2.segment < handle1.segment) {
					for (var i = 0; i < ring.length; i++) {
						if (i < handle2.segment || i >= handle1.segment) {
							ring[i].reversed = !ring[i].reversed;
						}
					}
				} else {
					for (var i = handle1.segment; i < handle2.segment; i++) {
						ring[i].reversed = !ring[i].reversed;
					}
				}
				this.utils_reverse(ring, handle1.segment, handle2.segment - 1);
			}
			//Keep history
			if ((this.state & this.HISTORY) != 0 && this.current.generation > 0 && this.utils_compare(this.current.locations, this.current.history[this.current.generation - 1])) {
				this.level_undo();
			} else {
				this.current.generation++;
				if ((this.state & this.HISTORY) != 0) {
					this.current.history.splice(this.current.generation);
				}
				this.current.history[this.current.generation] = this.current.locations;
				this.level_update();
			}
			this.save();
		}
	},
	//Checks to see if the level is completed
	level_iscomplete: function() {
		if ((this.state & this.INLEVEL) == 0) {
			return false;
		}
		if ((this.state != this.LEVELEDITOR) && this.current.generation > this.current.level.generations) {
			return false;
		}
		for (var r = 0; r < this.current.locations.length; r++) {
			var ring = this.current.locations[r];
			for (var s = 0; s < ring.length; s++) {
				var first = ring[s],
					second = ring[(s + 1) % ring.length],
					firstTo = first.reversed ? this.current.level.segments[first.segment].from : this.current.level.segments[first.segment].to;
				secondFrom = second.reversed ? this.current.level.segments[second.segment].to : this.current.level.segments[second.segment].from;
				if (firstTo != secondFrom) {
					return false;
				}
			}
		}
		return true;
	},
	level_complete: function() {
		this.state = this.DISABLED;
		this.level.completion._complete = 1;
	},
	//Loads up a new level, handling the saving and restoration of level state.
	level_load: function() {
		//Find the level, if it exists.
		if (this.savedata.levelpack in this.levelpacks) {
			this.current.pack = this.levelpacks[this.savedata.levelpack];
			if (this.savedata.level in this.current.pack.levels) {
				this.current.level = this.current.pack.levels[this.savedata.level];
				//Load in or create new save data based on the level.
				if (!(this.savedata.levelpack in this.savedata.levelpacks)) {
					this.savedata.levelpacks[this.savedata.levelpack] = [];
				}
				var savePack = this.savedata.levelpacks[this.savedata.levelpack];
				if (!(this.savedata.level in savePack)) {
					//Wrap each pristine segment in modifiable segment objects
					var locations = this.utils_wrap(this.utils_clone(this.current.level.locations));
					//Create save data
					savePack[this.savedata.level] = {
						history: [locations]
					}
				}
				var saveLevel = savePack[this.savedata.level];
				this.current.save = saveLevel;
				this.current.history = this.current.save.history;
				this.current.generation = 0;
				this.level_build();
				this.save();
				return;
			}
		}
		console.error("Save is invalid!");
	},
	//Builds and sets up everything in preparation for the level
	level_build: function() {
		this.lerp_add(this.ambient.background, "colorTop", this.current.pack.ambient.background.colorTop, this.ambient.background.lerpspeed, undefined, this.ambient.background.updateColors);
		this.lerp_add(this.ambient.background, "colorBottom", this.current.pack.ambient.background.colorBottom, this.ambient.background.lerpspeed);

		//Get the current segments to match the number of segments required in the level
		while (this.current.segments.length < this.current.level.segments.length) {
			var segment = {
				object: null,
				geometry: null,
				_startAngle: 0,
				_deltaAngle: 0,
				_startRadius: 0,
				_deltaRadius: 0,
				snap: true
			};
			segment.geometry = new THREE.Geometry();

			var settings = this.level.ring.materialSettings;
			settings.uniforms = this.utils_clone(settings.uniforms);
			segment.object = new THREE.Mesh(segment.geometry, new THREE.ShaderMaterial(settings));
			this.current.segments.push(segment);
			this.level.object.add(segment.object);
		}
		while (this.current.segments.length > this.current.level.segments.length) {
			var segment = this.current.segments.pop();
			this.level.object.remove(segment.object);
		}
		//Make all the segments match the requirements for the level
		for (var s = 0; s < this.current.segments.length; s++) {
			var segment = this.current.segments[s];
			segment.snap = true;
			//Resize vertex array
			var needsUpdate = false;
			while (segment.geometry.vertices.length < this.level.ring.subdivisions * 2) {
				segment.geometry.vertices.push(new THREE.Vector3(0, 0, 0));
				needsUpdate = true;
			}
			while (segment.geometry.vertices.length > this.level.ring.subdivisions * 2) {
				segment.geometry.vertices.pop();
				needsUpdate = true;
			}
			if (needsUpdate) {
				//Set the positions in a way for the vertex shader to use
				for (var i = 0; i < this.level.ring.subdivisions; i++) {
					segment.geometry.vertices[2 * i].set(i / (this.level.ring.subdivisions - 1), 1, 0);
					segment.geometry.vertices[2 * i + 1].set(i / (this.level.ring.subdivisions - 1), 0, 0);
				}
				//Resize face array
				while (segment.geometry.faces.length < this.level.ring.subdivisions * 2 - 2) {
					segment.geometry.faces.push(new THREE.Face3());
				}
				while (segment.geometry.faces.length > this.level.ring.subdivisions * 2 - 2) {
					segment.geometry.faces.pop();
				}
				//Set face array to vertices
				for (var f = 0; f < this.level.ring.subdivisions - 1; f++) {
					segment.geometry.faces[2 * f].a = 2 * f;
					segment.geometry.faces[2 * f].b = 2 * f + 1;
					segment.geometry.faces[2 * f].c = 2 * f + 2;
					segment.geometry.faces[2 * f + 1].a = 2 * f + 3;
					segment.geometry.faces[2 * f + 1].b = 2 * f + 2;
					segment.geometry.faces[2 * f + 1].c = 2 * f + 1;
				}
			}
			//Let the vertex shader handle the positioning of vertices and the colors
		}

		//Handle the drag geometry
		var needsUpdate = false;
		if (this.level.drag.geometry == null) {
			//Create the drag path
			this.level.drag.geometry = new THREE.Geometry();
			this.level.drag.object = new THREE.Mesh(this.level.drag.geometry, this.level.drag.material);
			this.level.drag.object.position.z = this.interaction.interactionDistance;
			this.level.object.add(this.level.drag.object);
		}
		while (this.level.drag.geometry.vertices.length < this.level.drag.subdivisions * 2) {
			this.level.drag.geometry.vertices.push(new THREE.Vector3(0, 0, 0));
			needsUpdate = true;
		}
		while (this.level.drag.geometry.vertices.length > this.level.drag.subdivisions * 2) {
			this.level.drag.geometry.vertices.pop();
			needsUpdate = true;
		}
		if (needsUpdate) {
			//Set the positions in a way for the vertex shader to use
			for (var i = 0; i < this.level.drag.subdivisions; i++) {
				this.level.drag.geometry.vertices[2 * i].set(i / (this.level.drag.subdivisions - 1), 1, 0);
				this.level.drag.geometry.vertices[2 * i + 1].set(i / (this.level.drag.subdivisions - 1), 0, 0);
			}

			//Resize face array
			while (this.level.drag.geometry.faces.length < 2 * this.level.drag.subdivisions - 2) {
				this.level.drag.geometry.faces.push(new THREE.Face3());
			}
			while (this.level.drag.geometry.faces.length > 2 * this.level.drag.subdivisions - 2) {
				this.level.drag.geometry.faces.pop();
			}
			//Set face array to vertices
			for (var f = 0; f < this.level.drag.subdivisions - 1; f++) {
				this.level.drag.geometry.faces[2 * f].a = 2 * f;
				this.level.drag.geometry.faces[2 * f].b = 2 * f + 1;
				this.level.drag.geometry.faces[2 * f].c = 2 * f + 2;
				this.level.drag.geometry.faces[2 * f + 1].a = 2 * f + 3;
				this.level.drag.geometry.faces[2 * f + 1].b = 2 * f + 2;
				this.level.drag.geometry.faces[2 * f + 1].c = 2 * f + 1;
			}
		}
		this.level_update();
	},
	//Loads the editor with a provided level
	editor_load: function(level) {
		this.state = this.LEVELEDITOR;
		this.current.pack = this.editor.pack;
		this.current.level = {
			segments: level.segments,
			generations: level.generations
		};
		this.current.save = null;
		this.current.history = [];
		this.current.generation = 0;
		//this.current.segments;//DO NOT TOUCH!
		this.current.locations = this.utils_wrap(level.locations);
		this.current.history.push(this.current.locations);
		this.level_build();
		this.update_ui();
	},
	//Loads the level editor with a new level
	editor_new: function() {
		var level = {
			segments: [],
			locations: [],
			generations: 0
		}
		var counter = 0;
		for (var r = 0; r < this.editor.rings; r++) {
			var ring = level.locations[r] = [];
			for (var s = 0; s < this.editor.segments; s++) {
				level.segments.push({
					from: s,
					to: (s + 1) % this.editor.segments
				});
				ring[s] = counter;
				counter++;
			}
		}
		this.editor_load(level);
	},
	//Exports the current level
	editor_export: function() {
		var exported = {
			segments: [],
			locations: [],
			generations: this.current.generation
		};
		var counter = 0;
		for (var r = 0; r < this.current.locations.length; r++) {
			var ring = this.current.locations[r];
			exported.locations[r] = [];
			for (var s = 0; s < ring.length; s++) {
				if (ring[s].reversed) {
					exported.segments.push({
						from: this.current.level.segments[ring[s].segment].to,
						to: this.current.level.segments[ring[s].segment].from
					});
				} else {
					exported.segments.push({
						from: this.current.level.segments[ring[s].segment].from,
						to: this.current.level.segments[ring[s].segment].to
					});
				}
				exported.locations[r][s] = counter;
				counter++;
			}
		}
		prompt("Copy this:", JSON.stringify(exported));
	},
	//Updates the ring and UI when a move has been made
	level_update: function(complete) {
		//Load up the current level
		this.current.locations = this.current.history[this.current.generation];
		//Place all the segments and handles where needed
		var currentHandle = 0;
		for (var r = 0; r < this.current.locations.length; r++) {
			var ring = this.current.locations[r];
			for (var s = 0; s < ring.length; s++) {
				var segment = this.current.segments[ring[s].segment],
					startAngle = s * 2 * Math.PI / ring.length + r * this.level.ring.offset,
					deltaAngle = 2 * Math.PI / ring.length - this.level.ring.separation * (complete ? 0 : 1),
					radius = this.level.ring.minRadius + r * this.level.ring.concentric;

				if (true) { //For empty segments in the future
					var handle;
					if (currentHandle >= this.current.handles.length) {
						handle = {
							object: new THREE.Mesh(new THREE.PlaneGeometry(this.level.handle.size, this.level.handle.size), this.level.handle.material),
							ring: 0,
							segment: 0,
							theta: 0,
							radius: 0,
							normalizedRadius: 0,
							normalizedX: 0,
							normalizedY: 0
						}
						this.current.handles.push(handle);
						this.level.object.add(handle.object);
					} else {
						handle = this.current.handles[currentHandle];
					}
					handle.ring = r;
					handle.segment = s;
					handle.theta = startAngle;
					handle.normalizedRadius = (r + 1) / this.current.locations.length;
					handle.object.position.set(Math.cos(startAngle), Math.sin(startAngle), 0)
						.multiplyScalar(radius + this.level.ring.thickness * this.level.handle.inwards);
					handle.radius = handle.object.position.length();
					handle.object.position.z = this.interaction.interactionDistance;
					handle.object.rotation.z = startAngle;
					handle.normalizedX = 0;
					handle.normalizedY = 0;
					currentHandle++;
				}
				segment._startAngle = startAngle + this.level.ring.separation * 0.5 * (complete ? 0 : 1);
				segment._deltaAngle = deltaAngle;
				segment._startRadius = radius;
				segment._deltaRadius = this.level.ring.thickness;
				if (ring[s].reversed) {
					segment._startAngle += segment._deltaAngle;
					segment._deltaAngle *= -1;
					// segment._startRadius += segment._deltaRadius;
					// segment._deltaRadius *= -1;
				}
				segment.object.material.uniforms.fromColor.value.copy(this.current.pack.ambient.palette[this.current.level.segments[ring[s].segment].from]);
				segment.object.material.uniforms.toColor.value.copy(this.current.pack.ambient.palette[this.current.level.segments[ring[s].segment].to]);
				var lerpspeed;
				if (segment.snap) {
					lerpspeed = 1;
					segment.snap = false;
				} else if (complete) {
					lerpspeed = this.level.completion.ringspeed
				} else {
					lerpspeed = this.level.ring.lerpspeed;
				}
				this.lerp_add(segment.object.material.uniforms.startRadius, "value", segment._startRadius, lerpspeed);
				this.lerp_add(segment.object.material.uniforms.deltaRadius, "value", segment._deltaRadius, lerpspeed);
				this.lerp_addAngle(segment.object.material.uniforms.startAngle, "value", segment._startAngle, lerpspeed);
				this.lerp_add(segment.object.material.uniforms.deltaAngle, "value", segment._deltaAngle, lerpspeed);
				//segment.geometry.verticesNeedUpdate = true;
			}
		}
		//Remove extra handles
		while (currentHandle < this.current.handles.length) {
			this.level.object.remove(this.current.handles.pop().object);
		}
		//Sort out the generation numbers
		var number = this.utils_clamp(this.current.level.generations - this.current.generation, 0, 9);
		if (this.state == this.LEVELEDITOR) {
			number = this.current.generation;
		}
		this.text.counter.material.map.offset.x = (number % 5) / 5;
		this.text.counter.material.map.offset.y = 2 / 3 - Math.floor(number / 5) / 3;
		//Check for completion
		if (this.state == this.LEVELEDITOR) {
			this.lerp_add(this.shaders.desaturate.uniforms.amount, "value", 0, this.lerpspeed);
			if (this.level_iscomplete()) {
				//Plasmid complete
				this.text.completionType.material.map.offset.y = 2 / 3;
				this.text.completionText.override_opacity = 1;
				this.text.counter.override_opacity = 0;
			} else {
				this.text.completionText.override_opacity = 0;
				this.text.counter.override_opacity = 1;
			}
		} else if ((this.state & this.INLEVEL) != 0) {
			if (this.level_iscomplete()) {
				this.lerp_add(this.shaders.desaturate.uniforms.amount, "value", 0, this.lerpspeed);
				this.level_complete();
			} else {
				if (this.current.generation >= this.current.level.generations) {
					this.lerp_add(this.shaders.desaturate.uniforms.amount, "value", 0.5, this.lerpspeed);
				} else {
					this.lerp_add(this.shaders.desaturate.uniforms.amount, "value", 0, this.lerpspeed);
				}
			}
		}
		this.update_ui();
	},
	//Mouse callbacks
	mouse_down: function(x, y) {
		this.interaction.cursor.position.set(x, y, 0);
		this.interaction.cursor.handleDown = true;
		this.interaction.cursor.handleMove = true;
		this.interaction.cursor.down = true;
		this.view._tilt.set(x, y, 0).divide(this.size).multiplyScalar(2).addScalar(-1);
		this.view._tilt.y = -this.view._tilt.y;
	},
	mouse_up: function() {
		this.interaction.cursor.handleUp = true;
		this.interaction.cursor.down = false;
	},
	mouse_move: function(x, y) {
		this.interaction.cursor.position.set(x, y, 0);
		this.interaction.cursor.handleMove = true;
		this.view._tilt.set(x, y, 0).divide(this.size);
		this.view._tilt.x = this.utils_clamp(this.view._tilt.x, 0, 1);
		this.view._tilt.y = this.utils_clamp(this.view._tilt.y, 0, 1);
		this.view._tilt.multiplyScalar(2).addScalar(-1);
		this.view._tilt.y = -this.view._tilt.y;
		this.view.returning = true;
	},
	mouse_show: function() {
		this.interaction.cursor.handleVisibility = true;
		this.interaction.cursor.visible = true;
		this.view.returning = true;
		this.view.snap = this.view.defaultspeed;
	},
	mouse_hide: function() {
		this.interaction.cursor.handleVisibility = true;
		this.interaction.cursor.visible = false;
		this.view._tilt.set(0, 0, 0);
		this.view.returning = false;
		this.view.snap = this.view.defaultspeed;
	},
	touch_start: function(x, y) {
		this.interaction.cursor.position.set(x, y, 0);
		this.interaction.cursor.handleDown = true;
		this.interaction.cursor.handleMove = true;
		this.interaction.cursor.down = true;
		this.interaction.cursor.visible = true;
	},
	touch_end: function() {
		this.interaction.cursor.handleUp = true;
		this.interaction.cursor.down = false;
		this.interaction.cursor.visible = false;
	},
	touch_move: function(x, y) {
		this.interaction.cursor.position.set(x, y, 0);
		this.interaction.cursor.handleMove = true;
	},
	tilt: function(x, y) {
		p.view._tilt.set(x, y, 0);
		this.view.returning = false;
		this.view.snap = this.view.tiltspeed;
	},
	//Sets up everything.
	setup: function() {
		//The first thing called. Sets up everything.
		// Sets up the scene, camera, and renderer.
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.renderer = new THREE.WebGLRenderer({
			antialias: true
		});
		this.camera = new THREE.Camera(this.view.fov, this.width / this.height, this.view.near, this.view.far);
		this.scene = new THREE.Scene();
		this.scene.add(this.camera);

		//Set up post-processing
		if (this.usePostProcess) {
			var pass;
			this.composer = new THREE.EffectComposer(this.renderer);
			if (this.useAnaglpyh) {
				this.composer.addPass(new THREE.AnaglyphRenderPass(this.scene, this.camera));
			} else {
				this.composer.addPass(new THREE.RenderPass(this.scene, this.camera));
			}
			pass = new THREE.ShaderPass(this.shaders.displace);
			this.composer.addPass(pass);
			pass.material.uniforms.resolution.value = this.size;
			pass.material.uniforms.phase = this.shaders.displace.uniforms.phase;
			pass = new THREE.ShaderPass(this.shaders.desaturate);
			this.composer.addPass(pass);
			pass.material.uniforms.amount = this.shaders.desaturate.uniforms.amount;
			this.composer.addPass(new THREE.ShaderPass(this.shaders.vignette));
			this.composer.addPass(new THREE.ShaderPass(this.shaders.chromaticAbberation));
			pass = new THREE.ShaderPass(this.shaders.fxaa);
			pass.material.uniforms.resolution.value = this.size;
			pass.renderToScreen = true;
			this.composer.addPass(pass);
		}
		this.resize();
		this.canvascontainer.appendChild(this.renderer.domElement)

		//Load data
		if ("localStorage" in window) {
			if ("plasmid" in window.localStorage) {
				try {
					this.savedata = JSON.parse(window.localStorage.plasmid);
				} catch (e) {
					console.error("Save is invalid!");
				}
			}
		}
		//Start the loader!
		this.loader_load();
		this.setup_preload();
	},
	//Sets up everything you can before resources are loaded
	setup_preload: function() {
		//Sets up the level
		this.scene.add(this.level.object);
		//Get the handle texture bound
		this.level.handle.material.map = this.images.handle;

		//Sets up the ambient stuff: rays, colors, particles.
		//Background rays
		this.images.rays.wrapT = this.images.rays.wrapS = THREE.RepeatWrapping;
		this.images.rays.repeat.set(3, 3);
		this.ambient.rays.material.map = this.images.rays;
		this.ambient.rays.geometry = new THREE.PlaneGeometry(7000, 7000);
		this.ambient.rays.object = new THREE.Mesh(this.ambient.rays.geometry, this.ambient.rays.material);
		this.ambient.rays.object.position.set(500, 0, -1000);
		this.ambient.rays.object.rotation.order = "YXZ";
		this.ambient.rays.object.rotation.set(-0.5, 0.2, 0);
		this.ambient.rays.object.visible = false;
		this.scene.add(this.ambient.rays.object);

		//Background
		this.ambient.background.geometry = new THREE.PlaneGeometry(12000, 4500);
		this.ambient.background.geometry.faces[0].vertexColors.push(this.ambient.background.colorTop);
		this.ambient.background.geometry.faces[0].vertexColors.push(this.ambient.background.colorBottom);
		this.ambient.background.geometry.faces[0].vertexColors.push(this.ambient.background.colorTop);
		this.ambient.background.geometry.faces[1].vertexColors.push(this.ambient.background.colorBottom);
		this.ambient.background.geometry.faces[1].vertexColors.push(this.ambient.background.colorBottom);
		this.ambient.background.geometry.faces[1].vertexColors.push(this.ambient.background.colorTop);

		this.ambient.background.object = new THREE.Mesh(this.ambient.background.geometry, this.ambient.background.material);
		this.ambient.background.object.position.set(0, 0, -3000);
		this.ambient.background.object.visible = false;
		this.scene.add(this.ambient.background.object);

		//Setup the loading screen
		this.loading.ring.geometry = new THREE.PlaneGeometry(this.loading.ring.size, this.loading.ring.size)
		this.loading.ring.object = new THREE.Mesh(this.loading.ring.geometry, this.loading.ring.material);
		this.loading.ring.object.position = this.loading.ring.position;
		this.scene.add(this.loading.ring.object);
		//Handle particles when the loader is complete.
	},
	//Sets up the rest after resources are loaded
	setup_postload: function() {
		//Handle the particles
		if (this.useParticles && this.ambient.particles.object == null) {
			this.ambient.particles.geometry.attributes = {
				position: {
					itemSize: 3,
					array: new Float32Array(this.ambient.particles.numParticles * 3),
					numItems: this.ambient.particles.numParticles * 3
				},
				velocity: {
					itemSize: 1,
					array: new Float32Array(this.ambient.particles.numParticles),
					numItems: this.ambient.particles.numParticles
				}
			}
			this.ambient.particles.material.uniforms.boxSize.value.copy(this.ambient.particles.boxSize);
			var position = this.ambient.particles.geometry.attributes.position.array;
			for (var i = 0; i < this.ambient.particles.numParticles; i++) {
				position[3 * i] = (Math.random() - 0.5) * this.ambient.particles.boxSize.x;
				position[3 * i + 1] = (Math.random() - 0.5) * this.ambient.particles.boxSize.y;
				position[3 * i + 2] = this.ambient.particles.boxSize.z * (i / this.ambient.particles.numParticles - 0.5); //Put in sorted order
				this.ambient.particles.geometry.attributes.velocity.array[i] = Math.random() * this.ambient.particles.toMaxVelocity + this.ambient.particles.minVelocity;
			}
			this.ambient.particles.material.uniforms.map.value = this.images.particle;
			this.ambient.particles.object = new THREE.ParticleSystem(
				this.ambient.particles.geometry,
				this.ambient.particles.material
			);
			this.ambient.particles.object.renderDepth = -1e20;
			this.scene.add(this.ambient.particles.object);
		}
		//Setup text
		for (var t in this.text) {
			var text = this.text[t];
			text.override_opacity = null;
			text.material = new THREE.MeshBasicMaterial(this.utils_clone(this.textmaterialsettings));
			text.material.map = this.images[text.map].clone();
			text.material.map.needsUpdate = true;
			if ("offset" in text) {
				text.material.map.offset.copy(text.offset);
			}
			if ("repeat" in text) {
				text.material.map.repeat.copy(text.repeat);
			}
			text.object = new THREE.Mesh(
				new THREE.PlaneGeometry(text.width, text.width * text.material.map.repeat.y / text.material.map.repeat.x),
				text.material
			);
			text.object.position = text.position;
			if ("rotation" in text) {
				text.object.rotation.copy(text.rotation);
			}
			this.level.object.add(text.object);
		};
	},
	//Adds a value to be lerped over the loop timer
	lerp_addAngle: function(object, field, target, speed, callback, step) {
		this.lerp_add(object, field, target, speed, callback, step);
		for (var i = 0; i < this.lerpqueue.length; i++) {
			if (this.lerpqueue[i].object === object && this.lerpqueue[i].field === field) {
				var current = this.lerpqueue[i];
				current.angle = true;
				return;
			}
		}
	},
	//Adds a value to be lerped over the loop timer
	lerp_add: function(object, field, target, speed, callback, step) {
		//Skip if unnecessary
		if (object[field] == target) {
			return;
		}
		for (var i = 0; i < this.lerpqueue.length; i++) {
			if (this.lerpqueue[i].object === object && this.lerpqueue[i].field === field) {
				var current = this.lerpqueue[i];
				if (target !== undefined) {
					current.object["_" + current.field] = target;
				}
				current.speed = speed;
				current.callback = callback;
				current.step = step;
				return;
			}
		}
		if (target !== undefined) {
			object["_" + field] = target;
		}
		this.lerpqueue.push({
			"object": object,
			"field": field,
			"speed": speed,
			"callback": callback,
			"step": step
		});
	},
	//Lerps all values in the lerp queue
	lerp_loop: function() {
		for (var i = 0; i < this.lerpqueue.length; i++) {
			var current = this.lerpqueue[i];
			if ("angle" in current) {
				current.object[current.field] = this.utils_lerpAngle(current.object[current.field], current.object["_" + current.field], current.speed);
			} else {
				current.object[current.field] = this.utils_lerp(current.object[current.field], current.object["_" + current.field], current.speed);
			}
			if (current.step !== undefined) {
				current.step.call(this);
			}
			if (current.object[current.field] instanceof THREE.Color) {
				if (Math.abs(current.object[current.field].r - current.object["_" + current.field].r) < this.lerpepsilon &&
					Math.abs(current.object[current.field].g - current.object["_" + current.field].g) < this.lerpepsilon &&
					Math.abs(current.object[current.field].b - current.object["_" + current.field].b) < this.lerpepsilon
				) {
					current.object[current.field].copy(current.object["_" + current.field]);
					if (current.callback !== undefined) {
						current.callback.call(this);
					}
					this.lerpqueue.splice(i, 1);
					i--;
				}
			} else {
				if (Math.abs(current.object[current.field] - current.object["_" + current.field]) < this.lerpepsilon) {
					current.object[current.field] = current.object["_" + current.field];
					if (current.callback !== undefined) {
						current.callback();
					}
					this.lerpqueue.splice(i, 1);
					i--;
				}
			}
		}
	},
	//Computes and renders at (hopefully) 60 frames per second.
	loop: function() {
		//Calculate elapsed time
		this.currentTime = Date.now();
		if (this.lastLoop > 0) {
			this.deltaTime = Math.min(this.currentTime - this.lastLoop, 100) / 1000;
		}
		this.lastLoop = this.currentTime;

		//Handle all lerps
		this.lerp_loop();
		//Handle loading screen
		if (this.state == this.LOADING) {
			this.loading.ring.material.uniforms.progress.value = this.utils_lerp(this.loading.ring.material.uniforms.progress.value, this.loading.progress, this.loading.ring.lerpspeed);
			this.loading.ring.material.uniforms.time.value += this.deltaTime;
		}
		//Handle the mouse
		if (this.interaction.cursor.handleMove) {
			//Project the mouse position (approximately)
			this.interaction.cursor.position.divide(this.size);
			this.interaction.cursor.position.x = this.utils_clamp(this.interaction.cursor.position.x, 0, 1);
			this.interaction.cursor.position.y = this.utils_clamp(this.interaction.cursor.position.y, 0, 1);
			this.interaction.cursor.projected.set(this.size.x * (this.interaction.cursor.position.x - 0.5) / this.size.y, 0.5 - this.interaction.cursor.position.y, 0)
				.multiplyScalar(2 * this.interaction.maxHeight);
			if ((this.state & this.INLEVEL) != 0) {
				//Find the nearest handle if selecting
				if (this.interaction.selection.selecting) {
					this.level_nearest();
					if (this.interaction.selection.nearest == this.interaction.selection.fromHandle) {
						this.interaction.selection.toHandle = null;
					} else {
						this.interaction.selection.toHandle = this.interaction.selection.nearest;
					}
				}
			}
			this.interaction.cursor.handleMove = false;
		}
		if (this.interaction.cursor.handleDown) {
			var pressed = false;
			for (var t in this.text) {
				var text = this.text[t];
				if (
					this.utils_length(
						(this.interaction.cursor.projected.x - text.object.position.x) / this.interaction.interactableAspect,
						this.interaction.cursor.projected.y - text.object.position.y) < this.interaction.interactableDistance) {
					if ("handler" in text) {
						if (text.handler.call(this) === false) {
							pressed = true;
							break;
						}
					}
				}
			}
			if (!pressed) {
				if (this.state == this.MAIN) {

				} else if ((this.state & this.INLEVEL) != 0) {
					//Check for undo/redo/reset

					//Find the nearest handle
					this.level_nearest();
					//Select it if it is close enough
					if (this.interaction.selection.nearestDistance < this.interaction.selection.distance) {
						this.interaction.selection.selecting = true;
						this.interaction.selection.fromHandle = this.interaction.selection.nearest;
						this.interaction.selection.toHandle = null;
					}
				}
			}
			this.interaction.cursor.handleDown = false;
		}
		if (this.interaction.cursor.handleUp) {
			if (this.interaction.selection.selecting) {
				//Make a move!
				if (this.interaction.selection.toHandle != null && this.interaction.selection.toHandle != this.interaction.selection.fromHandle) {
					this.level_move(this.interaction.selection.fromHandle, this.interaction.selection.toHandle);
					//Make the drag selection slink into itself
					this.level.drag.object.material.uniforms.startAngle.value += this.level.drag._deltaAngle;
					this.level.drag.object.material.uniforms.startRadius.value += this.level.drag._deltaRadius;
					this.level.drag.object.material.uniforms.deltaAngle.value *= -1;
				}
			}
			//Not selecting anymore
			this.interaction.selection.selecting = false;
			this.interaction.cursor.handleUp = false;
		}
		//Take care of the selection
		if (this.level.drag.object != null) {
			if (this.interaction.selection.selecting && this.interaction.selection.fromHandle) {
				this.level.drag.object.visible = true;
				this.level.drag.object.material.uniforms.startAngle.value = this.interaction.selection.fromHandle.theta;
				this.level.drag.object.material.uniforms.startRadius.value = this.interaction.selection.fromHandle.radius;
				if (this.interaction.selection.toHandle == null) {
					//Follow the mouse
					this.level.drag._deltaAngle = Math.atan2(this.interaction.cursor.projected.y, this.interaction.cursor.projected.x);
					this.level.drag._deltaRadius = this.interaction.cursor.projected.length();
					this.level.drag.snap = Math.min(1, this.level.drag.snap + this.level.drag.returnspeed);
				} else {
					//Snap to a handle
					this.level.drag._deltaAngle = this.interaction.selection.toHandle.theta;
					this.level.drag._deltaRadius = this.interaction.selection.toHandle.radius;
					this.level.drag.snap = this.level.drag.handlespeed;
				}
				this.level.drag._deltaAngle -= this.level.drag.object.material.uniforms.startAngle.value;
				this.level.drag._deltaRadius -= this.level.drag.object.material.uniforms.startRadius.value;
				//Take the shortest path
				while (this.level.drag._deltaAngle > Math.PI) {
					this.level.drag._deltaAngle = -2 * Math.PI + this.level.drag._deltaAngle;
				}
				while (this.level.drag._deltaAngle < -Math.PI) {
					this.level.drag._deltaAngle = 2 * Math.PI + this.level.drag._deltaAngle;
				}
			} else {
				//Return to nothingness
				// this.level.drag.object.material.uniforms.startAngle.value = 0;
				// this.level.drag.object.material.uniforms.startRadius.value = 0;
				this.level.drag._deltaAngle = 0;
				this.level.drag._deltaRadius = 0;
				this.level.drag.snap = this.level.drag.finishspeed;
			}
			this.level.drag.object.material.uniforms.deltaAngle.value = this.utils_lerp(this.level.drag.object.material.uniforms.deltaAngle.value, this.level.drag._deltaAngle, this.level.drag.snap);
			this.level.drag.object.material.uniforms.deltaRadius.value = this.utils_lerp(this.level.drag.object.material.uniforms.deltaRadius.value, this.level.drag._deltaRadius, this.level.drag.snap);
			if (Math.abs(this.level.drag.object.material.uniforms.deltaAngle.value) < this.lerpepsilon) {
				this.level.drag.object.visible = false;
			}
		}

		//Move the camera based on the mouse
		this.view._position.lerp(this.view.position, this.lerpspeed);
		this.camera.position.copy(this.view._position);
		if (this.view.returning) {
			this.view.snap = Math.min(1, this.view.snap + this.view.returnspeed);
		}
		this.view.tilt.lerp(this.view._tilt, this.view.snap);
		this.camera.position.x += this.view.tilt.x * this.view.maxTilt;
		this.camera.position.y += this.view.tilt.y * this.view.maxTilt;
		this.view._lookAt.lerp(this.view.lookAt, this.lerpspeed);
		this.camera.lookAt(this.view._lookAt);
		//Complete credits
		if (this.credits._scroll > 0) {
			if (this.credits.scroll < 1) {
				this.credits.scroll = Math.min(this.credits.scroll + this.deltaTime / this.credits.duration, 1);
				this.text.credits.material.opacity = 1;
				this.level.object.position.y = -600 + 1200 * this.credits.scroll;
			} else {
				//Finish up
				this.credits.scroll = 0;
				this.credits._scroll = 0;
				this.text.credits.material.opacity = 0;
				this.level.object.position.y = 0;
				this.level.object.position.z = 0;
				if (this.state == this.CREDITS) {
					this.state = this.MAIN;
					this.level_update();
				}
			}
		}
		//Complete the level (if needed)
		if (this.level.completion._complete > 0) {
			if (this.level.completion.complete < 1) {
				this.level.completion.complete = Math.min(this.level.completion.complete + this.deltaTime / this.level.completion.duration, 1);
				//Time-line:
				//0:Fade handles
				//0.15:Complete plasmid
				//0.2:Blast
				//0.3:Text
				//0.6:Transition out
				//0.9:Transition in

				//Fade the handle and counter opacity
				if (this.level.completion.complete > 0 && this.level.completion._complete < 2) {
					this.update_ui(this.level.completion.handleopacityspeed);
					this.level.completion._complete = 2;
				}
				//Complete plasmid
				if (this.level.completion.complete > 0.15 && this.level.completion._complete < 3) {
					this.level.completion._complete = 3;
					this.level_update(true);
				}
				//Blast
				if (this.level.completion.complete > 0.2) {
					this.shaders.displace.uniforms.phase.value = this.utils_lerp(this.shaders.displace.uniforms.phase.value, 1, this.level.completion.blastspeed);
				}
				if (this.level.completion.complete > 0.3 && this.level.completion.complete < 0.7) {
					if (this.level.completion._complete < 4) {
						this.level.completion._complete = 4;
						if ((this.savedata.level + 1) in this.current.pack.levels) {
							//Plasmid complete
							this.text.completionType.material.map.offset.y = 2 / 3;
						} else {
							//Genome complete
							this.text.completionType.material.map.offset.y = 0;
						}
						this.text.completionText.override_opacity = 1;
						this.text.completionType.override_opacity = 1;
						this.update_ui();
					}
					var mapped = this.utils_map(this.level.completion.complete, 0.3, 0.7, 0, 0.5);
					this.level.object.position.z = mapped * mapped * this.interaction.levelViewDistance;
					p.ambient.particles.material.uniforms.offset.value.z = 0.75 * mapped * mapped;
				}

				//Fly it out
				if (this.level.completion.complete > 0.7 && this.level.completion.complete < 0.8) {
					var mapped = this.utils_map(this.level.completion.complete, 0.7, 0.8, 0.5, 1);
					this.text.completionText.material.opacity = this.utils_clamp(3.0 - 3.5 * mapped, 0, 1);
					this.text.completionType.material.opacity = this.utils_clamp(3.0 - 3.5 * mapped, 0, 1);
					this.level.object.position.z = mapped * mapped * this.interaction.levelViewDistance;
					p.ambient.particles.material.uniforms.offset.value.z = 0.75 * mapped * mapped;
				}
				//Fly in
				if (this.level.completion.complete > 0.8) {
					//Update new level
					if (this.level.completion._complete < 5) {
						this.level.completion._complete = 5;
						//Remove level complete text
						this.lerp_add(this.text.completionText.material, "opacity", 0, 1);
						this.lerp_add(this.text.completionType.material, "opacity", 0, 1);
						//Make the new level.
						this.level_next();
						if (this.state == this.CREDITS) {
							//Hide all segments
							for (var i = 0; i < this.current.segments.length; i++) {
								var segment = this.current.segments[i];
								this.lerp_add(segment.object.material.uniforms.opacity, "value", 0, 1);
							}
						} else {
							//Fade all segments in.
							for (var i = 0; i < this.current.segments.length; i++) {
								var segment = this.current.segments[i]
								segment.object.material.uniforms.opacity.value = 0;
								this.lerp_add(segment.object.material.uniforms.opacity, "value", 1, this.level.completion.ringopacityspeed);
							}
						}
					} else {
						var mapped = this.utils_map(this.level.completion.complete, 0.8, 1, 1, 0);
						this.level.object.position.z = mapped * mapped * this.level.completion.rearDistance;
						p.ambient.particles.material.uniforms.offset.value.z = 0.25 * -mapped * mapped;
					}
				}
			} else {
				//Finish up
				this.level.completion.complete = 0;
				this.level.completion._complete = 0;
				this.shaders.displace.uniforms.phase.value = 0;
				this.level.object.position.z = 0;
				if (this.state == this.CREDITS) {
					this.update_ui();
				}
				if (this.state == this.DISABLED) {
					this.state = this.LEVEL;
					this.update_ui();
				}
			}
		}

		if (this.state != this.LOADING) {
			//Move the rays
			this.images.rays.offset.x -= this.ambient.rays.raySpeed * this.deltaTime;

			//Update the particles
			if (this.ambient.particles.object && this.useParticles) {
				this.ambient.particles.material.uniforms.time.value += this.deltaTime;
				//this.ambient.particles.material.uniforms.scale.value = this.width;
			}
		}
		//Render!
		if (this.usePostProcess) {
			this.composer.render(0.01);
		} else {
			this.renderer.render(this.scene, this.camera);
		}
	},
	//Resizes everything necessary.
	resize: function() {
		this.size.set(window.innerWidth, window.innerHeight, 0);
		this.renderer.setSize(this.size.x, this.size.y);
		this.camera.projectionMatrix.makePerspective(this.view.fov, this.size.x / this.size.y, this.view.near, this.view.far);
		//Help the anaglyph shader:
		this.camera.fov = this.view.fov;
		this.camera.aspect = this.size.x / this.size.y;
		this.camera.near = this.view.near;
		this.camera.far = this.view.far;
		//Compute (approximate) world-space z that corresponds to the y value of 0 in screen space
		this.interaction.maxHeight = (this.interaction.levelViewDistance + this.interaction.adjustedProjectionDistance) * Math.atan(Math.PI * this.view.fov / 360);
		if (this.usePostProcess) {
			//this.composer.setSize(this.size.x, this.size.y);
			this.composer.reset();
		}
		//Adjust the undo/reset/redo button positions
		var distance = this.interaction.maxHeight * this.size.x / this.size.y - 150;
		this.text.undo.position.x = -distance;
		this.text.redo.position.x = distance;
		this.text.pause.position.x = distance;
		this.text.reset.position.x = -distance;
	},
	//Saves the savedata to localStorage
	save: function() {
		if ("localStorage" in window) {
			window.localStorage.plasmid = JSON.stringify(this.savedata);
		}
	},
	//Loads all the images
	loader_load: function() {
		var that = this;
		for (var image in this.images.source) {
			this.images[image] = THREE.ImageUtils.loadTexture("images/" + this.images.source[image], undefined, function() {
				that.loader_callback()
			});
			this.images[image].anisotropy = this.renderer.getMaxAnisotropy()
			this.images.count++;
		}
	},
	//Reports loader progress
	loader_callback: function() {
		this.images.loaded++;
		this.loading.progress = this.images.loaded / this.images.count;
		if (this.images.loaded >= this.images.count) {
			this.loader_complete();
		}
	},
	//Shows the main menu, after loading has completed.
	loader_complete: function() {
		this.setup_postload();
		this.state = this.MAIN;
		this.level_load();
		//Snap! Fast!
		this.view.position.copy(this.view._position);
		this.view.lookAt.copy(this.view._lookAt);
		this.ambient.background.colorBottom.copy(this.ambient.background._colorBottom);
		this.ambient.background.colorTop.copy(this.ambient.background._colorTop);
		//Show everything
		this.ambient.rays.object.visible = true;
		this.ambient.background.object.visible = true;
		this.scene.remove(this.loading.ring.object);
		//this.current.ring.object.visible = true;
	},
	//Creates a deep copy of object.
	utils_clone: function(object) {
		var clone = (object instanceof Array ? [] : object instanceof Object ? {} : false);
		if (clone !== false) {
			if ("clone" in object) {
				return object.clone();
			}
			for (var i in object) {
				clone[i] = arguments.callee(object[i]);
			}
			return clone;
		} else {
			return object;
		}
	},
	//Linearly interpolates a to b by factor n
	utils_lerp: function(a, b, n) {
		if (a instanceof THREE.Color) {
			a.r = this.utils_lerp(a.r, b.r, n);
			a.g = this.utils_lerp(a.g, b.g, n);
			a.b = this.utils_lerp(a.b, b.b, n);
			return a;
		}
		return a * (1 - n) + b * n;
	},
	//Linearly interpolates angle a (in radians) to angle b by factor n
	utils_lerpAngle: function(a, b, n) {
		if (a < b && b - a > Math.PI) {
			//Wrap to left
			return (this.utils_lerp(a, b - 2 * Math.PI, n) + 2 * Math.PI) % (2 * Math.PI);
		} else if (b < a && a - b > Math.PI) {
			//Wrap to right
			return this.utils_lerp(a, b + 2 * Math.PI, n) % (2 * Math.PI);
		} else {
			return this.utils_lerp(a, b, n);
		}
	},
	//Reverses array a from i to j.
	utils_reverse: function(a, i, j) {
		var halfway;
		if (j < i) {
			halfway = Math.floor((j + 1 + a.length - i) / 2);
		} else {
			halfway = Math.floor((j - i + 1) / 2);
		}
		for (var k = 0; k < halfway; k++) {
			var temp = a[(j - k + a.length) % a.length];
			a[(j - k + a.length) % a.length] = a[(i + k) % a.length];
			a[(i + k) % a.length] = temp;
		}
		return a;
	},
	//Clamps n in between min and max.
	utils_clamp: function(n, min, max) {
		if (n > max) {
			return max;
		}
		if (n < min) {
			return min;
		}
		return n;
	},
	//Pythagorean theorem!
	utils_length: function(x, y) {
		return Math.sqrt(x * x + y * y);
	},
	//Maps n from min1 to max1 to a new range min2 to max2
	utils_map: function(n, min1, max1, min2, max2) {
		return (max2 - min2) * (n - min1) / (max1 - min1) + min2;
	},
	//Compares a and b for the same contents
	utils_compare: function(a, b) {
		if (a instanceof Array || a instanceof Object) {
			for (var i in a) {
				if (i in b) {
					//Recursive compare
					if (!this.utils_compare(a[i], b[i])) {
						return false;
					}
				} else {
					//A field is in one but not the other
					return false;
				}
			}
		} else {
			return a == b;
		}
		return true;
	},
	//Wraps an array of locations with {segment:#,reversed:false}
	utils_wrap: function(locations) {
		for (var r = 0; r < locations.length; r++) {
			var ring = locations[r];
			for (var s = 0; s < ring.length; s++) {
				ring[s] = {
					segment: ring[s],
					reversed: false
				};
			}
		}
		return locations;
	}
};
var p = new Plasmid(document.getElementById("canvascontainer"));
window.addEventListener("resize", function() {
	p.resize();
}, true);
p.canvascontainer.addEventListener("mousedown", function(event) {
	p.mouse_down(event.pageX, event.pageY);
}, true);
window.addEventListener("mouseup", function(event) {
	p.mouse_up();
}, true);
window.addEventListener("mousemove", function(event) {
	p.mouse_move(event.pageX, event.pageY);
}, true);
window.addEventListener("mouseout", function(event) {
	p.mouse_hide();
}, true);
p.canvascontainer.addEventListener("mouseover", function(event) {
	p.mouse_show();
}, true);
p.canvascontainer.addEventListener("touchstart", function(event) {
	p.canvascontainer.webkitRequestFullScreen();
	if ("touches" in event && event.touches.length > 0) {
		p.touch_start(event.touches[0].pageX, event.touches[0].pageY);
	}
	event.preventDefault();
}, true);
p.canvascontainer.addEventListener("touchmove", function(event) {
	if ("touches" in event && event.touches.length > 0) {
		p.touch_move(event.touches[0].pageX, event.touches[0].pageY);
	}
	event.preventDefault();
}, true);
p.canvascontainer.addEventListener("touchend", function(event) {
	if ("touches" in event && event.touches.length == 0) {
		p.touch_end();
	}
	event.preventDefault();
}, true);
window.addEventListener("deviceorientation", function(event) {
	var xAxis = 0,
		yAxis = 0;
	switch (window.orientation) {
		case -90:
			xAxis = event.gamma;
			yAxis = event.beta;
			break;
		case 90:
			xAxis = event.gamma;
			yAxis = -event.beta;
			break;
		case 180:
			xAxis = -event.beta;
			yAxis = event.gamma;
			break;
		default:
			xAxis = event.beta;
			yAxis = -event.gamma;
			break;
	}
	p.tilt(
		p.utils_clamp(yAxis, -30, 30) / 30,
		p.utils_clamp(Math.abs(xAxis) - 45, -30, 30) / 30
	);
}, true);

var raf = window.requestAnimationFrame ||
	window.webkitRequestAnimationFrame ||
	window.mozRequestAnimationFrame;

function loop() {
	p.loop();
	if (raf) {
		raf(arguments.callee);
	} else {
		setTimeout(arguments.callee, 15);
	}
}
loop();