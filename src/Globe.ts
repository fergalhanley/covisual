/**
 * dat.globe Javascript WebGL Globe Toolkit
 * https://github.com/dataarts/webgl-globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import * as THREE from "three";
import {colorFn, scaled} from "./Utils";

const SHADERS = {
    "earth" : {
        uniforms: {
            "texture": { type: "t", value: null }
        },
        vertexShader: [
            "varying vec3 vNormal;",
            "varying vec2 vUv;",
            "void main() {",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
            "vNormal = normalize( normalMatrix * normal );",
            "vUv = uv;",
            "}"
        ].join("\n"),
        fragmentShader: [
            "uniform sampler2D texture;",
            "varying vec3 vNormal;",
            "varying vec2 vUv;",
            "void main() {",
            "vec3 diffuse = texture2D( texture, vUv ).xyz;",
            "float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );",
            "vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );",
            "gl_FragColor = vec4( diffuse + atmosphere, 1.0 );",
            "}"
        ].join("\n")
    },
    "atmosphere" : {
        uniforms: {},
        vertexShader: [
            "varying vec3 vNormal;",
            "void main() {",
            "vNormal = normalize( normalMatrix * normal );",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
            "}"
        ].join("\n"),
        fragmentShader: [
            "varying vec3 vNormal;",
            "void main() {",
            "float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 12.0 );",
            "gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 ) * intensity;",
            "}"
        ].join("\n")
    }
};

const COLOR_BLUE = colorFn("0x0000ff");
const COLOR_GREEN = colorFn("0x00ff00");
const COLOR_RED = colorFn("0xff0000");
const COLOR_WHITE = colorFn("0xffffff");

const PI_HALF = Math.PI / 2;

export default class Globe {

    private container;
    private camera;
    private scene;
    private w;
    private h;
    private mesh;
    private raycaster;
    private renderer;
    private point;
    private overRenderer;
    private curZoomSpeed = 0;
    private points;
    private mouse = { x: 0, y: 0 };
    private mouseOnDown = { x: 0, y: 0 };
    private rotation = { x: 0, y: 0 }
    private target = { x: Math.PI*3/2, y: Math.PI / 6.0 };
    private targetOnDown = { x: 0, y: 0 };
    private mouseSelect = new THREE.Vector2();
    private distance = 100000;
    private distanceTarget = 100000;
    private latLong;
    private caseNumbers = {};
    private lastGroup = null;
    private max;
    private day;
    private is_animated: boolean;
    private _baseGeometry;
    private _morphTargetId;
    private selectedLocation;
    private _time: number = 0;
    private colors = [
        COLOR_BLUE,
        COLOR_GREEN,
        COLOR_RED,
        COLOR_WHITE,
    ];
    private locationSelectedCallback = (loc) => {};

    constructor(container) {

        this.container = container;

        container.style.color = "#fff";
        container.style.font = "13px/20px Arial, sans-serif";

        let shader;
        let uniforms;
        let material;

        this.w = container.offsetWidth || window.innerWidth;
        this.h = container.offsetHeight || window.innerHeight;

        this.camera = new THREE.PerspectiveCamera(30, this.w / this.h, 1, 10000);
        this.camera.position.z = this.distance;

        this.scene = new THREE.Scene();

        let geometry = new THREE.SphereGeometry(200, 40, 30);

        shader = SHADERS["earth"];
        uniforms = THREE.UniformsUtils.clone(shader.uniforms);

        uniforms["texture"].value = THREE.ImageUtils.loadTexture("/images/world-light-min.jpg");

        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.y = Math.PI;
        this.scene.add(this.mesh);

        shader = SHADERS["atmosphere"];
        uniforms = THREE.UniformsUtils.clone(shader.uniforms);

        material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.set( 1.1, 1.1, 1.1 );
        this.scene.add(this.mesh);

        geometry = new THREE.BoxGeometry(0.75, 0.75, 1);
        geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));

        this.point = new THREE.Mesh(geometry);

        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setSize(this.w, this.h);

        this.renderer.domElement.style.position = "absolute";

        container.appendChild(this.renderer.domElement);

        container.addEventListener("mousemove", this.onMouseMoveSelect, false);
        container.addEventListener("mousedown", this.onInteractDown, false);
        container.addEventListener("touchstart", this.onInteractDown, false);
        container.addEventListener("mousewheel", this.onMouseWheel, false);
        document.addEventListener("keydown", this.onDocumentKeyDown, false);
        window.addEventListener("resize", this.onWindowResize, false);
        container.addEventListener("mouseover", () => { this.overRenderer = true }, false);
        container.addEventListener("mouseout", () => { this.overRenderer = false }, false);

        this.raycaster = new THREE.Raycaster();
    }

    public addMeta(latLongData, maxNumber) {
        this.latLong = latLongData;
        this.max = maxNumber;
    }

    public setDay(dayNumber) {
        if (this.day !== dayNumber) {
            setTimeout(() => { this.updateCaseNumbersDisplay() });
        }
        this.day = dayNumber;
    }

    public addData(data, opts) {
        var lat, lng, size, i, step = 3;
        opts.animated = opts.animated || false;
        this.is_animated = opts.animated;
        opts.format = opts.format || "magnitude"; // other option is "legend"
        if (opts.animated) {
            if (this._baseGeometry === undefined) {
                this._baseGeometry = new THREE.Geometry();
                for (i = 0; i < data.length; i += step) {
                    lat = this.latLong[i];
                    lng = this.latLong[i + 1];
                    size = 0;
                    let group = this.addPoint(i, lat, lng, size, 0, this._baseGeometry, undefined, [0, 0, 0]);
                    group = this.addPoint(i, lat, lng, size, 2, this._baseGeometry, group, [0, 0, 0]);
                    this.addPoint(i, lat, lng, size, 1, this._baseGeometry, group, [0, 0, 0]);
                }
            }
            if(this._morphTargetId === undefined) {
                this._morphTargetId = 0;
            } else {
                this._morphTargetId += 1;
            }
            opts.name = opts.name || "morphTarget"+this._morphTargetId;
        }
        var subgeo = new THREE.Geometry();
        for (i = 0; i < data.length; i += step) {
            lat = this.latLong[i];
            lng = this.latLong[i + 1];
            size = scaled(data[i], this.max) * 200;

            var caseNum = [data[i], data[i+1], data[i+1]];

            let group = this.addPoint(i, lat, lng , size, 0, subgeo, undefined, caseNum);

            size = scaled(data[i + 1], this.max) * 200;
            group = this.addPoint(i, lat - Math.sqrt(size / 10), lng, size, 2, subgeo, group, caseNum);

            size = scaled(data[i + 2], this.max) * 200;
            this.addPoint(i, lat, lng - Math.sqrt(size / 10), size, 1, subgeo, group, caseNum);

            const key = `${lat}:${lng}`;
            if (!this.caseNumbers[key]) {
                this.caseNumbers[key] = [];
            }
            this.caseNumbers[key].push(caseNum);
        }

        if (opts.animated) {
            this._baseGeometry.morphTargets.push({"name": opts.name, vertices: subgeo.vertices});
        } else {
            this._baseGeometry = subgeo;
        }
    }

    public createPoints() {
        if (this._baseGeometry !== undefined) {
            if (this.is_animated === false) {
                this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    vertexColors: THREE.FaceColors,
                    morphTargets: false,
                    opacity: 0.5,
                    transparent: true,
                }));
            } else {
                if (this._baseGeometry.morphTargets.length < 8) {
                    var padding = 8-this._baseGeometry.morphTargets.length;
                    for(var i=0; i<=padding; i++) {
                        this._baseGeometry.morphTargets.push({"name": "morphPadding"+i, vertices: this._baseGeometry.vertices});
                    }
                }
                this.points = new THREE.Mesh(this._baseGeometry, new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    vertexColors: THREE.FaceColors,
                    morphTargets: true,
                    opacity: 0.5,
                    transparent: true,
                }));
            }
            this.scene.add(this.points);
        }
    }

    private addPoint(li, lat, lng, size, c, subgeo, group, caseNum) {

        var phi = (90 - lat) * Math.PI / 180;
        var theta = (180 - lng) * Math.PI / 180;

        this.point.position.x = 200 * Math.sin(phi) * Math.cos(theta);
        this.point.position.y = 200 * Math.cos(phi);
        this.point.position.z = 200 * Math.sin(phi) * Math.sin(theta);

        this.point.lookAt(this.mesh.position);

        this.point.scale.x = Math.max(Math.sqrt(size), 0.1);
        this.point.scale.y = Math.max(Math.sqrt(size), 0.1);
        this.point.scale.z = Math.max(size, 0.1); // avoid non-invertible matrix

        var addFaces = this.point.geometry.faces.length;

        for (var i = 0; i < addFaces; i++) {
            this.point.geometry.faces[i].color = this.colors[c];
        }

        if (this.point.matrixAutoUpdate){
            this.point.updateMatrix();
        }

        subgeo.merge(this.point.geometry, this.point.matrix);
        group = group || subgeo.faces.length - addFaces;
        var start = subgeo.faces.length - addFaces;
        for (var i = start; i < subgeo.faces.length; i++) {
            subgeo.faces[i].group = group;
            subgeo.faces[i].oc = c;
            subgeo.faces[i].li = li;
            subgeo.faces[i].cn = caseNum;
        }
        return group;
    }

    private onMouseMoveSelect = ( event ) => {
        event.preventDefault();
        this.mouseSelect.x = ( event.clientX / window.innerWidth ) * 2 - 1;
        this.mouseSelect.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    };

    public onLocationSelected = (callback) => {
        this.locationSelectedCallback = callback;
    };

    private onInteractDown = (event) => {
        event.preventDefault();

        this.container.addEventListener("mousemove", this.onInteractMove, false);
        this.container.addEventListener("touchmove", this.onInteractMove, false);
        this.container.addEventListener("mouseup", this.onInteractUp, false);
        this.container.addEventListener("touchend", this.onInteractUp, false);
        this.container.addEventListener("mouseout", this.onInteractOut, false);
        this.container.addEventListener("touchcancel", this.onInteractOut, false);

        if (event.touches) {
            this.mouseOnDown.x = - event.touches[0].clientX;
            this.mouseOnDown.y = event.touches[0].clientY;
        } else {
            this.mouseOnDown.x = - event.clientX;
            this.mouseOnDown.y = event.clientY;
        }
        this.targetOnDown.x = this.target.x;
        this.targetOnDown.y = this.target.y;
        this.container.style.cursor = "move";
    };

    private onInteractMove = (event) => {
        if (event.touches) {
            this.mouse.x = - event.touches[0].clientX;
            this.mouse.y = event.touches[0].clientY;
        } else {
            this.mouse.x = - event.clientX;
            this.mouse.y = event.clientY;
        }

        const zoomDamp = this.distance / 1000;

        this.target.x = this.targetOnDown.x + (this.mouse.x - this.mouseOnDown.x) * 0.005 * zoomDamp;
        this.target.y = this.targetOnDown.y + (this.mouse.y - this.mouseOnDown.y) * 0.005 * zoomDamp;

        this.target.y = this.target.y > PI_HALF ? PI_HALF : this.target.y;
        this.target.y = this.target.y < - PI_HALF ? - PI_HALF : this.target.y;
    };

    private onInteractUp = () => {
        this.container.removeEventListener("mousemove", this.onInteractMove, false);
        this.container.removeEventListener("touchmove", this.onInteractMove, false);
        this.container.removeEventListener("mouseup", this.onInteractUp, false);
        this.container.removeEventListener("touchend", this.onInteractUp, false);
        this.container.removeEventListener("mouseout", this.onInteractOut, false);
        this.container.removeEventListener("touchcancel", this.onInteractOut, false);
        this.container.style.cursor = "auto";
    };

    private onInteractOut = () => {
        this.container.removeEventListener("mousemove", this.onInteractMove, false);
        this.container.removeEventListener("touchmove", this.onInteractMove, false);
        this.container.removeEventListener("mouseup", this.onInteractUp, false);
        this.container.removeEventListener("touchend", this.onInteractUp, false);
        this.container.removeEventListener("mouseout", this.onInteractOut, false);
        this.container.removeEventListener("touchcancel", this.onInteractOut, false);
    };

    private onMouseWheel = (event) => {
        event.preventDefault();
        if (this.overRenderer) {
            this.zoom(event.wheelDeltaY * 0.3);
        }
        return false;
    };

    private onDocumentKeyDown = (event) => {
        switch (event.keyCode) {
            case 38:
                this.zoom(100);
                event.preventDefault();
                break;
            case 40:
                this.zoom(-100);
                event.preventDefault();
                break;
        }
    };

    private onWindowResize = () => {
        this.camera.aspect = this.container.offsetWidth / this.container.offsetHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize( this.container.offsetWidth, this.container.offsetHeight );
    };

    private zoom(delta) {
        this.distanceTarget -= delta;
        this.distanceTarget = this.distanceTarget > 1000 ? 1000 : this.distanceTarget;
        this.distanceTarget = this.distanceTarget < 350 ? 350 : this.distanceTarget;
    }

    public animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.render();
    }

    private render() {
        this.zoom(this.curZoomSpeed);

        this.rotation.x += (this.target.x - this.rotation.x) * 0.1;
        this.rotation.y += (this.target.y - this.rotation.y) * 0.1;
        this.distance += (this.distanceTarget - this.distance) * 0.3;

        this.camera.position.x = this.distance * Math.sin(this.rotation.x) * Math.cos(this.rotation.y);
        this.camera.position.y = this.distance * Math.sin(this.rotation.y);
        this.camera.position.z = this.distance * Math.cos(this.rotation.x) * Math.cos(this.rotation.y);
        this.camera.lookAt(this.mesh.position);

        // find intersections

        const vector = new THREE.Vector3( this.mouseSelect.x, this.mouseSelect.y, 1 ).unproject( this.camera );
        this.raycaster.set( this.camera.position, vector.sub( this.camera.position ).normalize() );

        const intersects = this.raycaster.intersectObjects( [this.points], true );
        if ( intersects.length > 0 ) {
            const group = intersects[0].face.group;
            if (this.lastGroup !== group) {
                var li;
                for (let i = group; i < group + 36; i++) {
                    li = this.points.geometry.faces[i].li;
                    this.points.geometry.faces[i].color.set(COLOR_WHITE);
                    this.points.geometry.colorsNeedUpdate = true;
                }
                if (this.lastGroup !== null) {
                    for (let j = this.lastGroup; j < this.lastGroup + 36; j++) {
                        this.points.geometry.faces[j].color.set(this.colors[this.points.geometry.faces[j].oc]);
                        this.points.geometry.colorsNeedUpdate = true;
                    }
                }
                this.selectedLocation = {
                    id: `${this.latLong[li]}:${this.latLong[li+1]}`,
                    name: this.latLong[li+2],
                };
                this.updateCaseNumbersDisplay();
                this.lastGroup = group;
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    private updateCaseNumbersDisplay() {
        if (this.locationSelectedCallback && this.selectedLocation) {
            this.locationSelectedCallback({
                name: this.selectedLocation.name,
                cases: this.caseNumbers[this.selectedLocation.id][this.day][0],
                deaths: this.caseNumbers[this.selectedLocation.id][this.day][1],
                recovered: this.caseNumbers[this.selectedLocation.id][this.day][2],
            });
        }
    }

    public get time () {
        return this._time || 0;
    }

    public set time(t) {
        const validMorphs = [];
        const morphDict = this.points.morphTargetDictionary;
        for(const k in morphDict) {
            if(k.indexOf("morphPadding") < 0) {
                validMorphs.push(morphDict[k]);
            }
        }
        validMorphs.sort();
        const l = validMorphs.length-1;
        const scaledt = t*l+1;
        const index = Math.floor(scaledt);
        for (let i = 0; i < validMorphs.length; i++) {
            this.points.morphTargetInfluences[validMorphs[i]] = 0;
        }
        const lastIndex = index - 1;
        const leftover = scaledt - index;
        if (lastIndex >= 0) {
            this.points.morphTargetInfluences[lastIndex] = 1 - leftover;
        }
        this.points.morphTargetInfluences[index] = leftover;
        this._time = t;
    }
}
