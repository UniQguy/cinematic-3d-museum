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
  private artifactModel: THREE.Group | null = null;   // The Buddha
  private artifact2Model: THREE.Group | null = null;  // The Deepest Anomaly
  
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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010a12);
    // Tuned fog perfectly for deep Z-axis flying
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.035); 

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 40, 5); 

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

    // --- MASSIVE Z-AXIS PLANKTON FIELD ---
    const particleCount = 2000;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount); 

    for(let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePos[i3] = (Math.random() - 0.5) * 100;     
        particlePos[i3 + 1] = (Math.random() - 0.5) * 60; 
        // Flow stretches insanely deep (Z: 20 to -180) to cover the whole flight
        particlePos[i3 + 2] = (Math.random() * 200) - 180; 
        particlePhases[i] = Math.random() * Math.PI * 2;  
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));
    const glowingCyan = new THREE.Color(0x44ffcc).multiplyScalar(2.5); 
    const particleMat = new THREE.PointsMaterial({ color: glowingCyan, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.particles);

    // Prevent black screen while waiting
    this.startAnimationLoop();

    await this.create3DText();

    // --- STAGE 1: MAIN STATUE (Z = 0) ---
    try {
      const gltf = await new GLTFLoader().loadAsync('statue.glb');
      this.oceanModel = gltf.scene;
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

    // --- STAGE 2: THE BUDDHA (Z = -65) ---
    try {
      const gltfArtifact = await new GLTFLoader().loadAsync('artifact.glb');
      this.artifactModel = gltfArtifact.scene;
      const box = new THREE.Box3().setFromObject(this.artifactModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 10 / Math.max(size.x, size.y, size.z);
      this.artifactModel.scale.set(scale, scale, scale);
      
      // POSITION: Pushed Right (X=14), Deep Z (-65)
      this.artifactModel.position.set((-center.x * scale) + 14, (-center.y * scale) - 5, (-center.z * scale) - 65);
      
      // TILT: Sunken and severe
      this.artifactModel.rotation.z = -0.5; 
      this.artifactModel.rotation.x = -0.3; 
      this.artifactModel.rotation.y = -0.4; 
      
      this.artifactModel.userData = { baseY: this.artifactModel.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifactModel);
    } catch (e) { console.error("Missing artifact.glb", e); }

    // --- STAGE 3: THE DEEP ANOMALY (Z = -130) ---
    try {
      const gltfArtifact2 = await new GLTFLoader().loadAsync('artifact2.glb');
      this.artifact2Model = gltfArtifact2.scene;
      const box = new THREE.Box3().setFromObject(this.artifact2Model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 14 / Math.max(size.x, size.y, size.z); 
      this.artifact2Model.scale.set(scale, scale, scale);
      
      // POSITION: Pushed Left (X=-16), Insanely Deep Z (-130)
      this.artifact2Model.position.set((-center.x * scale) - 16, (-center.y * scale) - 2, (-center.z * scale) - 130);
      
      this.artifact2Model.userData = { baseY: this.artifact2Model.position.y, phase: Math.random() * Math.PI };
      this.scene.add(this.artifact2Model);
    } catch (e) { console.error("Missing artifact2.glb", e); }

    this.playCinematicIntro(); 
  }

  private async create3DText(): Promise<void> {
    await document.fonts.ready; 
    const canvas = document.createElement('canvas');
    canvas.width = 4096; canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 600px "Cinzel", serif'; ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    
    // Perfectly centered typography so OBLIVION isn't cut off
    ctx.fillText('ABYSS', canvas.width / 2, canvas.height / 2 - 280);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 10;
    ctx.strokeText('OBLIVION', canvas.width / 2, canvas.height / 2 + 280);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    // DoubleSide allows us to physically fly THROUGH the text without it glitching
    const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true, 
        opacity: 0, 
        depthWrite: false, 
        fog: true,
        side: THREE.DoubleSide 
    });
    
    // Expanded PlaneGeometry to fit the text perfectly
    this.bgTextMesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 80), material);
    this.bgTextMesh.position.set(0, 6, -25); 
    this.scene.add(this.bgTextMesh);
  }

  private playCinematicIntro(): void {
    // Text fades in instantly so you see it in all its glory right away
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
    const tl = gsap.timeline({ scrollTrigger: { trigger: this.scrollTrack.nativeElement, start: "top top", end: "bottom bottom", scrub: 1.5 } });

    // --- GRAB TEXT PANELS & HIDE THEM ---
    const detailPanels = document.querySelectorAll('.detail');
    if (detailPanels.length >= 3) {
        gsap.set(detailPanels[1], { opacity: 0, y: 40 }); // Buddha Text (Hidden)
        gsap.set(detailPanels[2], { opacity: 0, y: 40 }); // Anomaly Text (Hidden)
    }

    // --- STAGE 1: Dive to Statue (Scroll Timeline: 0.0 to 2.0) ---
    tl.to(this.camera.position, { y: 0, z: 8, duration: 2, ease: "none" }, 0);
    tl.to(this.cameraTarget, { y: 4, duration: 2, ease: "none" }, 0);
    if (this.bgTextMesh) tl.to(this.bgTextMesh.position, { y: 15, duration: 2, ease: "none" }, 0);

    // --- STAGE 2: Fly FORWARD, Drift RIGHT to Buddha (Scroll Timeline: 2.5 to 5.5) ---
    // Notice the start time is 2.5. This gives a 0.5s pause to read the first panel.
    tl.to(this.camera.position, { x: 8, y: -2, z: -55, duration: 3, ease: "power2.inOut" }, 2.5);
    tl.to(this.cameraTarget, { x: 14, y: -4, z: -65, duration: 3, ease: "power2.inOut" }, 2.5);

    // FIX: Reveal Buddha text ONLY AT TIME 5.5 (Exactly when the camera stops flying)
    if (detailPanels.length >= 3) {
        tl.to(detailPanels[1], { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 5.5);
    }

    // --- STAGE 3: Fly DEEPER, Drift LEFT to Anomaly (Scroll Timeline: 6.5 to 9.5) ---
    // Start time 6.5 gives a 1-second reading window for the Buddha text before flying away.
    tl.to(this.camera.position, { x: -8, y: -1, z: -120, duration: 3, ease: "power2.inOut" }, 6.5);
    tl.to(this.cameraTarget, { x: -16, y: -2, z: -130, duration: 3, ease: "power2.inOut" }, 6.5);

    // FIX: Reveal Anomaly text ONLY AT TIME 9.5 (Exactly when the camera stops flying)
    if (detailPanels.length >= 3) {
        tl.to(detailPanels[2], { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 9.5);
    }
  }

  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;

    this.camera.lookAt(this.cameraTarget);

    if (!this.isIntroPlaying) {
        this.camera.position.x += Math.sin(time * 0.5) * 0.005;
        this.camera.position.y += Math.cos(time * 0.4) * 0.005;
    }
    
    // Adrenaline Plankton Physics
    if (this.particles) {
        const pos = this.particles.geometry.attributes['position'].array as Float32Array;
        const phases = this.particles.geometry.attributes['aPhase'].array as Float32Array;
        for(let i = 0; i < pos.length / 3; i++) {
            const i3 = i * 3;
            pos[i3 + 1] += 0.08; 
            pos[i3] += Math.sin(time * 1.5 + phases[i]) * 0.03;
            pos[i3 + 2] += Math.cos(time * 1.5 + phases[i]) * 0.03;
            if (pos[i3 + 1] > 30) pos[i3 + 1] = -30;
        }
        this.particles.geometry.attributes['position'].needsUpdate = true;
        this.particles.rotation.y = time * 0.12; 
    }

    // Heavy, sunken bobbing for Buddha
    if (this.artifactModel && this.artifactModel.userData['baseY'] !== undefined) {
        const data = this.artifactModel.userData;
        this.artifactModel.position.y = data['baseY'] + Math.sin(time * 0.4 + data['phase']) * 0.8;
    }

    // Eerie, floating physics for the Deep Anomaly
    if (this.artifact2Model && this.artifact2Model.userData['baseY'] !== undefined) {
        const data = this.artifact2Model.userData;
        this.artifact2Model.position.y = data['baseY'] + Math.sin(time * 0.7 + data['phase']) * 2.0; 
        this.artifact2Model.rotation.z = Math.sin(time * 0.5) * 0.2;
        this.artifact2Model.rotation.y += 0.002; 
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