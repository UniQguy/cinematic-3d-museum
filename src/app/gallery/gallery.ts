import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

interface GalleryItemData {
  num: string; 
  title: string; 
  origin: string; 
  era: string; 
  classification: string; 
  body: string; 
  glb: string;
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.html',
  styleUrl: './gallery.scss'
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  @Output() closeGallery = new EventEmitter<void>();
  @ViewChild('galleryCanvas', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;

  public isLoading: boolean = true;
  public loadingProgress: number = 0;
  
  public currentItem!: GalleryItemData;
  private currentIndex: number = 0;
  private isAnimating: boolean = false;

  // --- THE MANIFEST ---
  public galleryManifest: GalleryItemData[] = [
    { num: '01', title: 'SILENT GUARDIAN', origin: 'ATLANTIC TRENCH', era: 'C. 1950', classification: 'BRONZE RELIC', body: 'A forged bronze masterpiece discovered at maximum depth. Its hollow structure is perfectly preserved by bioluminescent marine life.', glb: 'artifact.glb' },
    { num: '02', title: 'FALLEN COLOSSUS', origin: 'NEW YORK HARBOR', era: 'C. 1886', classification: 'COPPER ICON', body: 'A corroded copper fragment, eternally resting on its side, bleeding technical residue into abyssal currents.', glb: 'statue.glb' },
    { num: '03', title: 'THE LOST RELIC', origin: 'UNKNOWN DEEP ANOMALY', era: 'C. 1400', classification: 'ROYAL ARTIFACT', body: 'A highly preserved artifact remarkably intact despite crushing pressures. Traces of ancient techniques remain visible.', glb: 'artifact2.glb' },
    { num: '04', title: 'HOUSE RELIC A', origin: 'OLD SANATAN DHARMA', era: 'C. 1920', classification: 'GODS STATUE', body: 'Ganesha, the elephant-headed Hindu deity son of Shiva and Parvati, is revered as the remover of obstacles, patron of arts and sciences, and god of wisdom and beginnings.', glb: 'item1.glb' },
    { num: '05', title: 'STATUE OF UNITY', origin: 'CLASSIFIED ZONE', era: 'GREAT ERA', classification: 'ACKNOWLEDGEMENT', body: 'The Statue of Unity is the worlds tallest statue (182 meters), dedicated to the Iron Man of India, Sardar Vallabhbhai Patel.', glb: 'item2.glb' },
    { num: '06', title: 'BRAHMOS MISSILE', origin: 'DRDO', era: '1998', classification: 'ARMED MISSILE', body: 'The BrahMos is a highly versatile, Indo-Russian joint-venture supersonic cruise missile known as the worlds fastest, capable of precision strikes on land and sea targets from multiple platforms at Mach 2.8–3.0. ', glb: 'item3.glb' },
    { num: '07', title: 'INDIA GATE', origin: 'DELHI INDIA', era: '1933', classification: 'NOW A TOURIST PLACE', body: 'The India Gate is a 42-meter-high, iconic sandstone archway in New Delhi, serving as a national war memorial. Designed by Sir Edwin Lutyens and unveiled in 1933, it honors over 70,000 soldiers of the British Indian Army who died in World War I and the Afghan War.', glb: 'item4.glb' }
  ];

  // --- THREE.JS CORE ---
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationFrameId: number | null = null;
  
  private tableModel: THREE.Group | null = null;
  private currentItemGroup = new THREE.Group();
  private loadedModels: Map<string, THREE.Group> = new Map();
  private godRays: THREE.SpotLight[] = [];

  constructor(private cdr: ChangeDetectorRef) {
    this.currentItem = this.galleryManifest[0];
  }

  ngAfterViewInit(): void {
    this.initScene();
  }

  private initScene(): void {
    const container = this.canvasContainer.nativeElement;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010a12);
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.02); 

    // TOP-CORNER ISOMETRIC CAMERA
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(25, 20, 25); 
    this.camera.lookAt(0, -2, 0); 

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // CINEMATIC RENDERER SETTINGS
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; 
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    this.renderer.toneMappingExposure = 1.5; 
    
    container.appendChild(this.renderer.domElement);

    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.3, 0.2);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    this.scene.add(this.currentItemGroup);

    // --- ENHANCED LIGHTING RIG ---
    
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2)); 

    // Main Sun Light (Warm)
    const sunLight = new THREE.DirectionalLight(0xffeedd, 3.5); 
    sunLight.position.set(-20, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    this.scene.add(sunLight);

    // Cinematic Fill Light (Cool Blue) to illuminate dark background furniture
    const fillLight = new THREE.DirectionalLight(0xaaccff, 2.0);
    fillLight.position.set(20, 15, -20);
    this.scene.add(fillLight);

    // Cinematic God Rays
    const windowRay1 = new THREE.SpotLight(0xffddaa, 800);
    windowRay1.position.set(-30, 25, -10);
    windowRay1.angle = Math.PI / 6;
    windowRay1.penumbra = 0.8;
    windowRay1.target.position.set(0, 0, 0);
    this.scene.add(windowRay1);
    this.scene.add(windowRay1.target);
    this.godRays.push(windowRay1); 

    this.startAnimationLoop();
    this.loadAssets();
  }

  private loadAssets(): void {
    const manager = new THREE.LoadingManager();
    
    manager.onProgress = (url, loaded, total) => {
      this.loadingProgress = Math.floor((loaded / total) * 100);
      this.cdr.detectChanges();
    };

    manager.onLoad = () => {
      setTimeout(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
        this.setupEnvironment();
      }, 800);
    };

    const loader = new GLTFLoader(manager);
    
    const safeLoad = (key: string, filename: string) => {
        loader.load(filename, (gltf) => {
            gltf.scene.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            this.loadedModels.set(key, gltf.scene);
        }, undefined, (error) => {
            console.warn(`Could not load ${filename}. Generating fallback box.`);
            const fallbackMesh = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshStandardMaterial({color: 0x555555, wireframe: true}));
            const group = new THREE.Group(); group.add(fallbackMesh);
            this.loadedModels.set(key, group);
        });
    };

    // Load All Background Environment Pieces
    safeLoad('table', 'table.glb');
    safeLoad('drawer', 'drawer.glb');
    safeLoad('tv', 'vintagetv.glb');
    safeLoad('throne', 'throne.glb'); 
    
    // Load Manifest Items
    this.galleryManifest.forEach(item => {
        if (!this.loadedModels.has(item.glb)) {
            safeLoad(item.glb, item.glb);
        }
    });
  }

  private setupEnvironment() {
    const floorY = -8; // Absolute floor level for the room

    // 1. PLACE CENTER TABLE (Focal Point)
    const table = this.loadedModels.get('table');
    if(table) {
        table.scale.set(4.5, 4.5, 4.5); 
        const box = new THREE.Box3().setFromObject(table);
        table.position.set(0, floorY - box.min.y, 0); 
        this.scene.add(table);
        this.tableModel = table;
    }

    // 2. PLACE DRAWER & TV (Background Left)
    const drawer = this.loadedModels.get('drawer');
    const tv = this.loadedModels.get('tv');
    if(drawer) {
        const dBoxInitial = new THREE.Box3().setFromObject(drawer);
        const dSize = dBoxInitial.getSize(new THREE.Vector3());
        const dScale = 12 / dSize.y; 
        drawer.scale.set(dScale, dScale, dScale);
        
        drawer.rotation.set(0, Math.PI / 5, 0);
        
        const dBoxScaled = new THREE.Box3().setFromObject(drawer);
        const dCenter = dBoxScaled.getCenter(new THREE.Vector3());
        
        drawer.position.set(-18 - dCenter.x, floorY - dBoxScaled.min.y, -25 - dCenter.z);
        this.scene.add(drawer);

        if(tv) {
            const tBoxInitial = new THREE.Box3().setFromObject(tv);
            const tSize = tBoxInitial.getSize(new THREE.Vector3());
            const tScale = 4 / tSize.y;
            tv.scale.set(tScale, tScale, tScale);
            
            tv.rotation.set(0, Math.PI / 5, 0);
            
            const dBoxFinal = new THREE.Box3().setFromObject(drawer);
            const tBoxScaled = new THREE.Box3().setFromObject(tv);
            const tCenter = tBoxScaled.getCenter(new THREE.Vector3());
            
            tv.position.set(-18 - tCenter.x, dBoxFinal.max.y - tBoxScaled.min.y, -25 - tCenter.z);
            this.scene.add(tv);
        }
    }

    // 3. PLACE THRONE (Background Right)
    const throne = this.loadedModels.get('throne');
    if(throne) {
        const thBoxInitial = new THREE.Box3().setFromObject(throne);
        const thSize = thBoxInitial.getSize(new THREE.Vector3());
        const thScale = 10 / thSize.y;
        throne.scale.set(thScale, thScale, thScale);
        
        // FIXED: Using .set(x, y, z) to explicitly push the throne backward (-0.25 on X)
        // If it still leans too far forward, make -0.25 more negative (e.g., -0.5)
        // If it leans too far back, make it closer to 0.
        throne.rotation.set(-0.25, -Math.PI / 5, 0); 
        
        const thBoxScaled = new THREE.Box3().setFromObject(throne);
        const thCenter = thBoxScaled.getCenter(new THREE.Vector3());
        
        throne.position.set(18 - thCenter.x, floorY - thBoxScaled.min.y, -20 - thCenter.z);
        this.scene.add(throne);
    }

    // Display first item on the table
    this.displayItem(0, 0);
  }

  // --- SCROLL WHEEL LISTENER ---
  @HostListener('window:wheel', ['$event'])
  onScroll(event: WheelEvent) {
    if (this.isLoading || this.isAnimating) return;

    const direction = event.deltaY > 0 ? 1 : -1;
    const nextIndex = this.currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= this.galleryManifest.length) return;

    this.isAnimating = true;

    // Animate Hologram UI Out
    gsap.to('.holo-panel', { opacity: 0, x: direction > 0 ? -50 : 50, duration: 0.4, ease: "power2.in" });

    // Animate 3D Model Out
    const exitX = direction > 0 ? -30 : 30; 
    gsap.to(this.currentItemGroup.position, {
      x: exitX,
      opacity: 0,
      duration: 0.8,
      ease: "power2.in",
      onComplete: () => {
        this.currentItemGroup.clear();
        this.currentIndex = nextIndex;
        const entryX = direction > 0 ? 30 : -30;
        this.displayItem(this.currentIndex, entryX);
      }
    });
  }

  private displayItem(index: number, startX: number) {
     const itemData = this.galleryManifest[index];
     this.currentItem = itemData;
     this.cdr.detectChanges(); 

     const model = this.loadedModels.get(itemData.glb);

     if (model) {
       const clone = model.clone();
       
       const box = new THREE.Box3().setFromObject(clone);
       const size = box.getSize(new THREE.Vector3());
       const center = box.getCenter(new THREE.Vector3());
       const targetSize = 5; 
       const scale = targetSize / Math.max(size.x, size.y, size.z);
       clone.scale.set(scale, scale, scale);

       const tableY = this.tableModel ? new THREE.Box3().setFromObject(this.tableModel).max.y : -2;
       clone.position.set(-center.x * scale, tableY - (box.min.y * scale) + 0.5, -center.z * scale); 
       
       this.currentItemGroup.add(clone);
       
       this.currentItemGroup.position.set(startX, 0, 0);
       gsap.to(this.currentItemGroup.position, { x: 0, duration: 1.2, ease: "power3.out", onComplete: () => { this.isAnimating = false; } });
       
       if(this.godRays[0]) gsap.to(this.godRays[0], { intensity: 1500, duration: 0.5, yoyo: true, repeat: 1 }); 
     } else {
       this.isAnimating = false; 
     }
     
     gsap.fromTo('.holo-panel', 
       { opacity: 0, x: startX > 0 ? 50 : -50 }, 
       { opacity: 1, x: 0, duration: 0.8, ease: "power2.out", delay: 0.2, stagger: 0.1 }
     );
  }

  public returnToSurface() {
    this.closeGallery.emit(); 
  }

  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;
    
    if (this.currentItemGroup.children.length > 0) {
        this.currentItemGroup.rotation.y = time * 0.4; 
        this.currentItemGroup.position.y = Math.sin(time * 2) * 0.2; 
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
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
    if (this.composer) this.composer.dispose();
  }
}