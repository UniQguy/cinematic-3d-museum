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
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.030); 

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 40, 5); 

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; 
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.2, 0.5, 0.2
    );

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.scene.add(new THREE.AmbientLight(0x0a2a4a, 1.5)); 
    const sunBeam = new THREE.DirectionalLight(0x44eeff, 4);
    sunBeam.position.set(5, 20, 10);
    this.scene.add(sunBeam);

    // --- 6. UPGRADED PLANKTON PHYSICS SETUP ---
    const particleCount = 1500;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particlePhases = new Float32Array(particleCount); // Gives each particle a unique dance

    for(let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePos[i3] = (Math.random() - 0.5) * 40;     // X
        particlePos[i3 + 1] = (Math.random() - 0.5) * 40; // Y
        particlePos[i3 + 2] = (Math.random() - 0.5) * 40; // Z
        particlePhases[i] = Math.random() * Math.PI * 2;  // Unique rhythm
    }
    
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhases, 1));
    
    const glowingCyan = new THREE.Color(0x44ffcc).multiplyScalar(2.5); 
    const particleMat = new THREE.PointsMaterial({
        color: glowingCyan, size: 0.12, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending 
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.scene.add(this.particles);

    await this.create3DText();

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
      
      this.startAnimationLoop();
      this.playCinematicIntro(); 

    } catch (error) { console.error("Error loading statue", error); }
  }

  private async create3DText(): Promise<void> {
    await document.fonts.ready; 

    const canvas = document.createElement('canvas');
    canvas.width = 4096; 
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.font = '400 600px "Cinzel", serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillText('ABYSS', canvas.width / 2, canvas.height / 2 - 300);
    
    ctx.font = '400 600px "Cinzel", serif';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 10;
    ctx.strokeText('OBLIVION', canvas.width / 2, canvas.height / 2 + 300);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0, 
      depthWrite: false,
      fog: true 
    });
    
    const geometry = new THREE.PlaneGeometry(120, 60);
    this.bgTextMesh = new THREE.Mesh(geometry, material);
    this.bgTextMesh.position.set(0, 6, -25); 
    this.scene.add(this.bgTextMesh);
  }

  private playCinematicIntro(): void {
    gsap.to(this.camera.position, {
        y: 8,     
        z: 15,    
        duration: 4.5,
        ease: "power3.inOut"
    });

    gsap.to(this.cameraTarget, {
        y: 2,     
        z: 0,
        duration: 4.5,
        ease: "power3.inOut",
        onComplete: () => {
            document.body.style.overflowY = 'auto'; 
            
            gsap.to('.ui-reveal-layer', { opacity: 1, y: 0, duration: 1.5, ease: "power2.out" });

            if (this.bgTextMesh) {
                gsap.to((this.bgTextMesh.material as THREE.Material), { opacity: 1, duration: 3, ease: "power2.inOut" });
            }

            this.isIntroPlaying = false;
            this.setupScrollAnimation();
        }
    });
  }

  private setupScrollAnimation(): void {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: this.scrollTrack.nativeElement,
        start: "top top",
        end: "bottom bottom",
        scrub: 1.5, 
      }
    });

    tl.to(this.camera.position, { y: 0, z: 8, ease: "none" }, 0);
    tl.to(this.cameraTarget, { y: 4, ease: "none" }, 0);

    if (this.bgTextMesh) {
        tl.to(this.bgTextMesh.position, { y: 20, ease: "none" }, 0);
    }
  }

  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;

    this.camera.lookAt(this.cameraTarget);

    if (!this.isIntroPlaying) {
        this.camera.position.x = Math.sin(time * 0.5) * 0.4;
    }
    
    // --- ADRENALINE-INJECTED PLANKTON PHYSICS ---
    if (this.particles) {
        const pos = this.particles.geometry.attributes['position'].array as Float32Array;
        const phases = this.particles.geometry.attributes['aPhase'].array as Float32Array;
        
        for(let i = 0; i < pos.length / 3; i++) {
            const i3 = i * 3;
            
            // 1. Faster Upward Float (Increased from 0.03 to 0.08)
            pos[i3 + 1] += 0.08; 
            
            // 2. Fast, Organic Swirling Movement
            pos[i3] += Math.sin(time * 1.5 + phases[i]) * 0.03;
            pos[i3 + 2] += Math.cos(time * 1.5 + phases[i]) * 0.03;

            if (pos[i3 + 1] > 15) pos[i3 + 1] = -15;
        }
        this.particles.geometry.attributes['position'].needsUpdate = true;
        
        // Faster cloud rotation so it feels like a vortex
        this.particles.rotation.y = time * 0.12; 
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