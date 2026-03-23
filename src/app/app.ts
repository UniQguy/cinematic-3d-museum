import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollTrack', { static: true }) scrollTrack!: ElementRef<HTMLDivElement>;

  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer; 
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private oceanModel!: THREE.Group; 
  private artifactModel!: THREE.Group; 
  private particles!: THREE.Points; 
  private bgTextMesh!: THREE.Mesh; 
  
  private animationFrameId: number | null = null;
  private cameraTarget = new THREE.Vector3(0, -10, 0); 
  private isIntroPlaying = true;

  ngAfterViewInit(): void {
    this.initThreeJsScene();
  }

  private async initThreeJsScene(): Promise<void> {
    const container = this.canvasContainer.nativeElement;

    // 1. SETUP SCENE & CAMERA
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010a12);
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.035); 

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 40, 5); 

    // 2. SETUP VFX PIPELINE
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; 
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.5, 0.2);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.scene.add(new THREE.AmbientLight(0x0a2a4a, 1.5)); 
    const sunBeam = new THREE.DirectionalLight(0x44eeff, 4);
    sunBeam.position.set(5, 20, 10);
    this.scene.add(sunBeam);

    // 3. SETUP PLANKTON
    const particleCount = 200; 
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount); 

    for(let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePos[i3] = (Math.random() - 0.5) * 60;     
        particlePos[i3 + 1] = (Math.random() - 0.5) * 60; 
        particlePos[i3 + 2] = (Math.random() - 0.5) * 120; // Spread deep into the Z-axis
        particlePhases[i] = Math.random() * Math.PI * 2;  
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));
    const glowingCyan = new THREE.Color(0x44ffcc).multiplyScalar(1.5); 
    const particleMat = new THREE.PointsMaterial({ color: glowingCyan, size: 0.06, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.particles);

    // 🔥 TURN ON THE ENGINE IMMEDIATELY 🔥
    // This stops the black screen. The particles will animate while we wait for the 3D models.
    this.startAnimationLoop();

    // 4. LOAD HEAVY ASSETS ASYNCHRONOUSLY
    await this.create3DText();

    try {
      const gltfStatue = await new GLTFLoader().loadAsync('statue.glb');
      this.oceanModel = gltfStatue.scene;

      let statueMesh: THREE.Mesh | null = null;
      let maxVolume = 0;
      this.oceanModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
          const volume = size.x * size.y * size.z;
          if (volume > maxVolume) { maxVolume = volume; statueMesh = child as THREE.Mesh; }
        }
      });

      if (statueMesh) {
          const box = new THREE.Box3().setFromObject(statueMesh);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const scale = 12 / size.y;
          this.oceanModel.scale.set(scale, scale, scale);
          this.oceanModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
          this.oceanModel.position.y -= 2;
      }
      this.scene.add(this.oceanModel);
    } catch (error) { console.error("Error loading statue", error); }

    try {
      const gltfArtifact = await new GLTFLoader().loadAsync('artifact.glb');
      this.artifactModel = gltfArtifact.scene;

      const box = new THREE.Box3().setFromObject(this.artifactModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 8 / maxDim;
      this.artifactModel.scale.set(scale, scale, scale);

      // Push it MASSIVELY deep into the Z-axis (Z = -80)
      this.artifactModel.position.set(-center.x * scale, (-center.y * scale) - 2, (-center.z * scale) - 80);

      this.artifactModel.userData = { baseY: this.artifactModel.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifactModel);
    } catch (error) { console.error("Error loading artifact.glb.", error); }

    // 5. TRIGGER THE MASTER SEQUENCE ONCE EVERYTHING IS LOADED
    this.playCinematicIntro(); 
  }

  private async create3DText(): Promise<void> {
    await document.fonts.ready; 
    const canvas = document.createElement('canvas');
    canvas.width = 4096; canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 600px "Cinzel", serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('ABYSS', canvas.width / 2, canvas.height / 2 - 300);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 10;
    ctx.strokeText('OBLIVION', canvas.width / 2, canvas.height / 2 + 300);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.bgTextMesh = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), material);
    this.bgTextMesh.position.set(0, 6, -25); 
    this.scene.add(this.bgTextMesh);
  }

  private playCinematicIntro(): void {
    gsap.to(this.camera.position, { y: 8, z: 15, duration: 4.5, ease: "power3.inOut" });
    gsap.to(this.cameraTarget, { y: 2, z: 0, duration: 4.5, ease: "power3.inOut",
        onComplete: () => {
            document.body.style.overflowY = 'auto'; 
            gsap.to('.ui-reveal-layer', { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" });
            if (this.bgTextMesh) gsap.to((this.bgTextMesh.material as THREE.Material), { opacity: 1, duration: 3, ease: "power2.inOut" });
            this.isIntroPlaying = false;
            this.setupScrollAnimation();
        }
    });
  }

  private setupScrollAnimation(): void {
    const tl = gsap.timeline({ scrollTrigger: { trigger: this.scrollTrack.nativeElement, start: "top top", end: "bottom bottom", scrub: 1.5 } });
    
    // Phase 1: Dive down to the statue's face 
    tl.to(this.camera.position, { y: 0, z: 8, ease: "none" }, 0);
    tl.to(this.cameraTarget, { y: 4, ease: "none" }, 0);
    if (this.bgTextMesh) tl.to(this.bgTextMesh.position, { y: 20, ease: "none" }, 0);

    // Phase 2: Fly PAST the statue and approach the Submarine at Z: -80
    tl.to(this.camera.position, { z: -65, y: -1, ease: "power1.inOut" }, ">");
    tl.to(this.cameraTarget, { z: -80, y: -2, ease: "power1.inOut" }, "<");
  }

  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;

    this.camera.lookAt(this.cameraTarget);

    if (!this.isIntroPlaying) {
        this.camera.position.x = Math.sin(time * 0.5) * 0.4;
    }
    
    // Particles
    if (this.particles) {
        const pos = this.particles.geometry.attributes['position'].array as Float32Array;
        const phases = this.particles.geometry.attributes['aPhase'].array as Float32Array;
        for(let i = 0; i < pos.length / 3; i++) {
            const i3 = i * 3;
            pos[i3 + 1] += 0.02; 
            pos[i3] += Math.sin(time * 0.5 + phases[i]) * 0.01;
            if (pos[i3 + 1] > 30) pos[i3 + 1] = -30;
        }
        this.particles.geometry.attributes['position'].needsUpdate = true;
        this.particles.rotation.y = time * 0.02; 
    }

    // Weightless Submarine Physics (Using strict bracket notation to avoid TS errors)
    if (this.artifactModel && this.artifactModel.userData) {
        const data = this.artifactModel.userData;
        if (data['baseY'] !== undefined) {
            this.artifactModel.position.y = data['baseY'] + Math.sin(time * 0.6 + data['phase']) * 1.5;
            this.artifactModel.rotation.z = Math.sin(time * 0.4) * 0.15;
            this.artifactModel.rotation.x = Math.cos(time * 0.5) * 0.1;
            this.artifactModel.rotation.y += 0.001; 
        }
    }

    this.composer.render();
  };

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.camera && this.renderer && this.composer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight); 
      ScrollTrigger.refresh(); 
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
    if (this.composer) this.composer.dispose();
    document.body.style.overflowY = 'auto'; 
    ScrollTrigger.getAll().forEach(t => t.kill()); 
  }
}