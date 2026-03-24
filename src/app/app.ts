import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
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
  
  // Preloader Element Reference
  @ViewChild('preloaderOverlay', { static: true }) preloaderOverlay!: ElementRef<HTMLDivElement>;

  // HUD Depth Tracker References
  @ViewChild('depthValue', { static: false }) depthValue!: ElementRef<HTMLSpanElement>;
  @ViewChild('depthIndicator', { static: false }) depthIndicator!: ElementRef<HTMLDivElement>;

  // MENU REFERENCE
  @ViewChild('menuOverlay', { static: false }) menuOverlay!: ElementRef<HTMLDivElement>;

  // AUDIO REFERENCE
  @ViewChild('bgMusic', { static: false }) bgMusic!: ElementRef<HTMLAudioElement>;

  // State variables for UI
  public loadingProgress: number = 0;
  public isLoaded: boolean = false;
  public isMuted: boolean = false; // Audio starts unmuted
  public isMenuOpen: boolean = false;

  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer; 
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  
  private oceanModel!: THREE.Group; 
  private artifactModel: THREE.Group | null = null;  
  private artifact2Model: THREE.Group | null = null;  
  private artifact3Model: THREE.Group | null = null;  
  private artifact4Model: THREE.Group | null = null;  
  private artifact5Model: THREE.Group | null = null;  
  
  private particles!: THREE.Points; 
  private bgTextMesh!: THREE.Mesh; 
  
  private animationFrameId: number | null = null;
  private cameraTarget = new THREE.Vector3(0, -10, 0); 
  private isIntroPlaying = true;

  private neonLight1!: THREE.PointLight;
  private neonLight2!: THREE.PointLight;
  private godRays: THREE.SpotLight[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    // Initial scroll lock until user clicks Enter
    document.body.style.overflowY = 'hidden'; 
    this.initThreeJsScene();
  }

  private async initThreeJsScene(): Promise<void> {
    const container = this.canvasContainer.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010a12);
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.035); 

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 40, 5); 

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; 
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.15);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.scene.add(new THREE.AmbientLight(0x0a2a4a, 1.5)); 
    const sunBeam = new THREE.DirectionalLight(0x44eeff, 4);
    sunBeam.position.set(5, 20, 10);
    this.scene.add(sunBeam);

    // PLANKTON FIELD
    const particleCount = 4000;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount); 

    for(let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePos[i3] = (Math.random() - 0.5) * 100;     
        particlePos[i3 + 1] = (Math.random() - 0.5) * 100; 
        particlePos[i3 + 2] = (Math.random() * 520) - 500; 
        particlePhases[i] = Math.random() * Math.PI * 2;  
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));
    const glowingCyan = new THREE.Color(0x44ffcc).multiplyScalar(2.5); 
    const particleMat = new THREE.PointsMaterial({ color: glowingCyan, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.particles);

    this.startAnimationLoop();
    await this.create3DText();

    // ========================================================
    // SCENE LOADING MANAGER
    // ========================================================
    const loadingManager = new THREE.LoadingManager();
    
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.loadingProgress = Math.floor((itemsLoaded / itemsTotal) * 100);
      this.cdr.detectChanges(); // Force Angular to update the HTML text immediately
    };

    loadingManager.onLoad = () => {
      // Small delay to let user see 100% before button pops up
      setTimeout(() => {
        this.isLoaded = true;
        this.cdr.detectChanges();
      }, 500);
    };

    const gltfLoader = new GLTFLoader(loadingManager);

    // --- STAGES LOADED VIA MANAGER ---
    try {
      const gltf1 = await gltfLoader.loadAsync('statue.glb');
      this.oceanModel = gltf1.scene;
      let statueMesh: THREE.Mesh | null = null;
      let maxVolume = 0;
      this.oceanModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const size = new THREE.Box3().setFromObject(child).getSize(new THREE.Vector3());
          if (size.y > size.x && size.y > size.z) {
             const volume = size.x * size.y * size.z;
             if (volume > maxVolume) { maxVolume = volume; statueMesh = child as THREE.Mesh; }
          }
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
    } catch (e) { console.error("Error loading statue", e); }

    try {
      const gltfArtifact = await gltfLoader.loadAsync('artifact.glb');
      this.artifactModel = gltfArtifact.scene;
      const box = new THREE.Box3().setFromObject(this.artifactModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 10 / Math.max(size.x, size.y, size.z);
      this.artifactModel.scale.set(scale, scale, scale);
      this.artifactModel.position.set((-center.x * scale) + 14, (-center.y * scale) - 5, (-center.z * scale) - 65);
      this.artifactModel.rotation.set(-0.3, -0.4, -0.5); 
      this.artifactModel.userData = { baseY: this.artifactModel.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifactModel);
    } catch (e) { console.error("Missing artifact.glb", e); }

    try {
      const gltfArtifact2 = await gltfLoader.loadAsync('artifact2.glb');
      this.artifact2Model = gltfArtifact2.scene;
      const box = new THREE.Box3().setFromObject(this.artifact2Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 14 / Math.max(size.x, size.y, size.z); 
      this.artifact2Model.scale.set(scale, scale, scale);
      this.artifact2Model.position.set((-center.x * scale) - 16, (-center.y * scale) - 2, (-center.z * scale) - 130);
      this.artifact2Model.userData = { baseY: this.artifact2Model.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifact2Model);
    } catch (e) { console.error("Missing artifact2.glb", e); }

    try {
      const gltfArtifact3 = await gltfLoader.loadAsync('artifact3.glb');
      this.artifact3Model = gltfArtifact3.scene;
      const box = new THREE.Box3().setFromObject(this.artifact3Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 16 / Math.max(size.x, size.y, size.z); 
      this.artifact3Model.scale.set(scale, scale, scale);
      this.artifact3Model.position.set((-center.x * scale) - 14, (-center.y * scale) + 0, (-center.z * scale) - 195);
      this.artifact3Model.rotation.set(0.2, -0.3, -0.2); 
      this.artifact3Model.userData = { baseY: this.artifact3Model.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifact3Model);
    } catch (e) { console.error("Missing artifact3.glb", e); }

    try {
      const gltfArtifact4 = await gltfLoader.loadAsync('artifact4.glb');
      this.artifact4Model = gltfArtifact4.scene;
      const box = new THREE.Box3().setFromObject(this.artifact4Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 18 / Math.max(size.x, size.y, size.z); 
      this.artifact4Model.scale.set(scale, scale, scale);
      
      this.artifact4Model.position.set((-center.x * scale), (-center.y * scale) - 15, (-center.z * scale) - 260);
      this.artifact4Model.rotation.set(-Math.PI / 2, 0, 0); 

      this.artifact4Model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;      
            mesh.receiveShadow = true;   
            if (mesh.material) {
                const mat = mesh.material as THREE.MeshStandardMaterial;
                mat.metalness = 0.9;     
                mat.roughness = 0.1;     
                mat.needsUpdate = true;
            }
        }
      });
      
      this.artifact4Model.userData = { baseY: this.artifact4Model.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifact4Model);

      const droneLight = new THREE.SpotLight(0xcceeff, 150); 
      droneLight.position.set(2, 10, -255); 
      droneLight.angle = Math.PI / 3;      
      droneLight.penumbra = 1.0;           
      droneLight.decay = 2;                
      droneLight.distance = 60;            
      droneLight.castShadow = true;
      droneLight.target.position.set(0, -15, -260); 
      this.scene.add(droneLight);
      this.scene.add(droneLight.target);
    } catch (e) { console.error("Missing artifact4.glb", e); }

    try {
      const gltfArtifact5 = await gltfLoader.loadAsync('artifact5.glb');
      this.artifact5Model = gltfArtifact5.scene;
      const box = new THREE.Box3().setFromObject(this.artifact5Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      
      const scale = 35 / Math.max(size.x, size.y, size.z); 
      this.artifact5Model.scale.set(scale, scale, scale);
      
      this.artifact5Model.position.set((-center.x * scale), (-center.y * scale) - 5, (-center.z * scale) - 350);
      this.artifact5Model.userData = { baseY: this.artifact5Model.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifact5Model);

      const rayColors = [0xffaa44, 0xffcc88, 0xffaa44];
      rayColors.forEach((color, index) => {
          const ray = new THREE.SpotLight(color, 600); 
          ray.position.set((index - 1.5) * 8, 15, -365); 
          ray.target.position.set((index - 1.5) * 10, -10, -300); 
          ray.angle = Math.PI / 4;      
          ray.penumbra = 0.8;           
          ray.decay = 1.5;                
          ray.distance = 150;
          this.scene.add(ray);
          this.scene.add(ray.target);
          this.godRays.push(ray);
      });
    } catch (e) { console.error("Missing artifact5.glb", e); }
  }

  // ========================================================
  // AUDIO TOGGLE LOGIC
  // ========================================================
  public toggleSound(): void {
    if (!this.bgMusic) return;
    
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      gsap.to(this.bgMusic.nativeElement, { volume: 0, duration: 1, onComplete: () => this.bgMusic.nativeElement.pause() });
    } else {
      this.bgMusic.nativeElement.play();
      gsap.to(this.bgMusic.nativeElement, { volume: 0.4, duration: 1 });
    }
  }

  // ========================================================
  // MENU OVERLAY LOGIC
  // ========================================================
  public toggleMenu(): void {
    if (!this.menuOverlay) return;

    this.isMenuOpen = !this.isMenuOpen;
    const menuEl = this.menuOverlay.nativeElement;
    const menuTexts = menuEl.querySelectorAll('.menu-text');

    if (this.isMenuOpen) {
      // Animate Menu IN
      gsap.to(menuEl, { opacity: 1, y: 0, duration: 0.8, ease: "power3.inOut", pointerEvents: "auto" });
      
      // Stagger animate links sliding UP
      gsap.to(menuTexts, { 
        y: 0, 
        duration: 0.8, 
        stagger: 0.1, 
        ease: "power3.out", 
        delay: 0.4 
      });
      
      // Optional: Pause background audio slightly
      if (this.bgMusic && !this.isMuted) gsap.to(this.bgMusic.nativeElement, { volume: 0.1, duration: 0.5 });

    } else {
      // Animate Menu OUT
      gsap.to(menuTexts, { y: '100%', duration: 0.4, ease: "power2.in" });
      gsap.to(menuEl, { opacity: 0, y: '-100%', duration: 0.8, ease: "power3.inOut", delay: 0.2, pointerEvents: "none" });
      
      // Restore volume
      if (this.bgMusic && !this.isMuted) gsap.to(this.bgMusic.nativeElement, { volume: 0.4, duration: 0.5, delay: 0.5 });
    }
  }

  // ========================================================
  // TRIGGERED WHEN USER CLICKS "ENTER EXPEDITION"
  // ========================================================
  public startExperience(): void {
    if (this.bgMusic) {
        this.bgMusic.nativeElement.volume = 0.4;
        this.bgMusic.nativeElement.play().catch(e => console.log("Audio play blocked", e));
    }

    gsap.to(this.preloaderOverlay.nativeElement, {
        opacity: 0,
        duration: 1.5,
        ease: "power2.inOut",
        onComplete: () => {
            this.preloaderOverlay.nativeElement.style.display = 'none';
        }
    });

    this.playCinematicIntro();
  }

  private async create3DText(): Promise<void> {
    await document.fonts.ready; 
    const canvas = document.createElement('canvas');
    canvas.width = 4096; canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 600px "Cinzel", serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('ABYSS', canvas.width / 2, canvas.height / 2 - 280);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 10;
    ctx.strokeText('OBLIVION', canvas.width / 2, canvas.height / 2 + 280);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, fog: true, side: THREE.DoubleSide });
    this.bgTextMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), material);
    
    this.bgTextMesh.position.set(0, 6, -25); 
    this.bgTextMesh.rotation.set(-0.1, 0.1, -0.05);
    
    this.scene.add(this.bgTextMesh);
  }

  private playCinematicIntro(): void {
    if (this.bgTextMesh) {
        gsap.to((this.bgTextMesh.material as THREE.Material), { opacity: 1, duration: 3, ease: "power2.out" });
    }
    gsap.to(this.camera.position, { y: 8, z: 15, duration: 4.5, ease: "power3.inOut" });
    gsap.to(this.cameraTarget, { y: 2, z: 0, duration: 4.5, ease: "power3.inOut",
        onComplete: () => {
            document.body.style.overflowY = 'auto'; 
            gsap.to('.ui-reveal-layer', { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" });
            this.isIntroPlaying = false;
            this.setupScrollAnimation();
        }
    });
  }

  private setupScrollAnimation(): void {
    const sections = document.querySelectorAll('.scroll-section');
    const delayedTexts = document.querySelectorAll('.delayed-text');

    if (delayedTexts.length > 0) gsap.set(delayedTexts, { opacity: 0, y: 80 });

    const tl = gsap.timeline({ 
        scrollTrigger: { 
            trigger: this.scrollTrack.nativeElement, 
            start: "top top", 
            end: "bottom bottom", 
            scrub: 1,
            onUpdate: (self) => {
                const currentDepth = Math.floor(self.progress * 450);
                if (this.depthValue) {
                    this.depthValue.nativeElement.innerText = currentDepth.toString();
                }
                if (this.depthIndicator) {
                    this.depthIndicator.nativeElement.style.height = `${self.progress * 100}%`;
                }
            }
        } 
    });

    const introText = sections[0]?.querySelector('.content-block');
    if (introText) tl.to(introText, { opacity: 0, y: -50, duration: 0.5 }, 0);
    if (this.bgTextMesh) tl.to(this.bgTextMesh.position, { y: 25, duration: 1 }, 0);

    tl.to(this.camera.position, { x: 8, y: -2, z: -55, ease: "power1.inOut", duration: 1 }, 0)
      .to(this.cameraTarget, { x: 14, y: -4, z: -65, ease: "power1.inOut", duration: 1 }, 0);
    if (delayedTexts[0]) {
        tl.fromTo(delayedTexts[0], { opacity: 0, y: 50 }, { opacity: 1, y: 0, ease: "power2.out", duration: 0.4 }, 0.6)
          .to(delayedTexts[0], { opacity: 0, y: -50, ease: "power2.in", duration: 0.3 }, 1.2);
    }

    tl.to(this.camera.position, { x: -8, y: -1, z: -120, ease: "power1.inOut", duration: 1 }, 1)
      .to(this.cameraTarget, { x: -16, y: -2, z: -130, ease: "power1.inOut", duration: 1 }, 1);
    if (delayedTexts[1]) {
        tl.fromTo(delayedTexts[1], { opacity: 0, y: 50 }, { opacity: 1, y: 0, ease: "power2.out", duration: 0.4 }, 1.6)
          .to(delayedTexts[1], { opacity: 0, y: -50, ease: "power2.in", duration: 0.3 }, 2.2);
    }

    tl.to(this.camera.position, { x: 8, y: -2, z: -185, ease: "power1.inOut", duration: 1 }, 2)
      .to(this.cameraTarget, { x: -14, y: 0, z: -195, ease: "power1.inOut", duration: 1 }, 2);
    if (delayedTexts[2]) {
        tl.fromTo(delayedTexts[2], { opacity: 0, y: 50 }, { opacity: 1, y: 0, ease: "power2.out", duration: 0.4 }, 2.6)
          .to(delayedTexts[2], { opacity: 0, y: -50, ease: "power2.in", duration: 0.3 }, 3.2);
    }

    tl.to(this.camera.position, { x: 15, y: 15, z: -250, ease: "power1.in", duration: 0.5 }, 3)
      .to(this.cameraTarget, { x: 0, y: -15, z: -260, ease: "power1.in", duration: 0.5 }, 3)
      .to(this.camera.position, { x: -15, y: 10, z: -265, ease: "power1.out", duration: 0.5 }, 3.5)
      .to(this.cameraTarget, { x: 0, y: -15, z: -260, ease: "power1.out", duration: 0.5 }, 3.5);
    if (delayedTexts[3]) {
        tl.fromTo(delayedTexts[3], { opacity: 0, y: 50 }, { opacity: 1, y: 0, ease: "power2.out", duration: 0.4 }, 3.6)
          .to(delayedTexts[3], { opacity: 0, y: -50, ease: "power2.in", duration: 0.3 }, 4.2);
    }

    tl.to(this.camera.position, { x: 20, y: -5, z: -320, ease: "power1.inOut", duration: 0.4 }, 4)
      .to(this.cameraTarget, { x: 0, y: -10, z: -350, ease: "power1.inOut", duration: 0.4 }, 4);
    tl.to(this.camera.position, { x: 0, y: -5, z: -335, ease: "none", duration: 0.3 }, 4.4)
      .to(this.cameraTarget, { x: 0, y: -5, z: -350, ease: "none", duration: 0.3 }, 4.4);
    tl.to(this.camera.position, { x: 0, y: 10, z: -380, ease: "power2.out", duration: 0.3 }, 4.7)
      .to(this.cameraTarget, { x: 0, y: 20, z: -450, ease: "power2.out", duration: 0.3 }, 4.7);

    if (delayedTexts[4]) {
        tl.fromTo(delayedTexts[4], 
            { opacity: 0, scale: 0.1, y: 150 }, 
            { opacity: 1, scale: 1, y: 0, ease: "power2.out", duration: 0.3 }, 
            4.7
        );
    }
  }

  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;
    this.camera.lookAt(this.cameraTarget);

    if (this.particles) {
        const pos = this.particles.geometry.attributes['position'].array as Float32Array;
        const phases = this.particles.geometry.attributes['aPhase'].array as Float32Array;
        for(let i = 0; i < pos.length / 3; i++) {
            const i3 = i * 3;
            pos[i3 + 1] += 0.08; 
            pos[i3] += Math.sin(time * 1.5 + phases[i]) * 0.03;
            pos[i3 + 2] += Math.cos(time * 1.5 + phases[i]) * 0.03;
            if (pos[i3 + 1] > 40) pos[i3 + 1] = -40; 
        }
        this.particles.geometry.attributes['position'].needsUpdate = true;
        this.particles.rotation.y = time * 0.12; 
    }

    if (this.bgTextMesh && !this.isIntroPlaying) {
        this.bgTextMesh.rotation.z = -0.05 + Math.sin(time * 0.5) * 0.05;
        this.bgTextMesh.rotation.x = -0.1 + Math.sin(time * 0.3) * 0.05;
    }

    if (this.artifactModel && this.artifactModel.userData['baseY'] !== undefined) {
        this.artifactModel.position.y = this.artifactModel.userData['baseY'] + Math.sin(time * 0.4 + this.artifactModel.userData['phase']) * 0.8;
    }

    if (this.artifact2Model && this.artifact2Model.userData['baseY'] !== undefined) {
        this.artifact2Model.position.y = this.artifact2Model.userData['baseY'] + Math.sin(time * 0.7 + this.artifact2Model.userData['phase']) * 2.0; 
        this.artifact2Model.rotation.z = Math.sin(time * 0.5) * 0.2;
        this.artifact2Model.rotation.y += 0.002; 
    }

    if (this.artifact3Model && this.artifact3Model.userData['baseY'] !== undefined) {
        this.artifact3Model.position.y = this.artifact3Model.userData['baseY'] + Math.sin(time * 0.5 + this.artifact3Model.userData['phase']) * 1.2; 
        this.artifact3Model.rotation.x = 0.2 + Math.sin(time * 0.3) * 0.05; 
    }

    if (this.artifact4Model && this.artifact4Model.userData['baseY'] !== undefined) {
        this.artifact4Model.rotation.z = Math.sin(time * 0.2) * 0.05; 
    }

    if (this.artifact5Model && this.artifact5Model.userData['baseY'] !== undefined) {
        this.artifact5Model.position.y = this.artifact5Model.userData['baseY'] + Math.sin(time * 0.3 + this.artifact5Model.userData['phase']) * 0.5; 
    }

    if (this.godRays && this.godRays.length > 0) {
        this.godRays.forEach((ray, i) => {
            ray.intensity = 400 + Math.sin(time * 1.5 + (i * 2.2)) * 200;
        });
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