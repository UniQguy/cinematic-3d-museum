import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Define the structure for your gallery items
interface GalleryItem {
  id: string;
  title: string;
  origin: string;
  era: string;
  status: string;
  description: string;
  modelPath: string; // e.g., 'table.glb', 'vintagetv.glb'
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss'
})
export class GalleryComponent implements AfterViewInit, OnDestroy {
  @ViewChild('galleryCanvas', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;

  // --- UI State ---
  public isLoading: boolean = true;
  public loadingProgress: number = 0;
  
  // This holds the currently displayed item's data
  public currentItem!: GalleryItem;
  private currentIndex: number = 0;

  // --- The Manifest: Add your new items here ---
  private galleryManifest: GalleryItem[] = [
    {
      id: "001",
      title: "THE VINTAGE TERMINAL",
      origin: "SECTOR 7G",
      era: "LATE 20TH CENTURY",
      status: "DORMANT",
      description: "An ancient viewing apparatus. Traces of static still linger on the cathode ray tube.",
      modelPath: "vintagetv.glb" 
    },
    {
      id: "002",
      title: "OBSIDIAN SPHERE",
      origin: "UNKNOWN TRENCH",
      era: "PRE-CATACLYSM",
      status: "RESONATING",
      description: "A perfectly smooth sphere that absorbs all light. It hums with a faint, low frequency.",
      modelPath: "item1.glb" // Replace with your actual model
    },
    {
      id: "003",
      title: "BRASS NAVIGATOR",
      origin: "SUNKEN GALLEON",
      era: "18TH CENTURY",
      status: "CORRODED",
      description: "An intricate mechanical device used for celestial navigation, now seized by rust and salt.",
      modelPath: "item2.glb" // Replace with your actual model
    }
  ];

  // --- Three.js Variables ---
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationFrameId: number | null = null;
  
  private tableModel: THREE.Group | null = null;
  private currentItemModel: THREE.Group | null = null;
  
  // Store loaded models to avoid reloading
  private loadedModels: Map<string, THREE.Group> = new Map();
  private godRays: THREE.SpotLight[] = [];
  
  // Throttle scrolling
  private isAnimating: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {
    // Initialize with the first item
    this.currentItem = this.galleryManifest[0];
  }

  ngAfterViewInit(): void {
    document.body.style.overflow = 'hidden'; // Prevent normal scrolling
    this.initScene();
  }

  private initScene(): void {
    const container = this.canvasContainer.nativeElement;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010a12);
    this.scene.fog = new THREE.FogExp2(0x010a12, 0.04); // Slightly thicker fog for the room

    // Isometric-style Camera Setup
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(20, 15, 20); // Top-corner view
    this.camera.lookAt(0, 0, 0); // Looking at the center (the table)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    container.appendChild(this.renderer.domElement);

    // Post-processing for that deep-sea glow
    const renderScene = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.3, 0.2);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderScene);
    this.composer.addPass(bloomPass);

    // Basic Ambient Light
    this.scene.add(new THREE.AmbientLight(0x0a2a4a, 0.8)); 

    // Create the underwater God Rays
    this.createGodRays();

    // Start rendering loop
    this.startAnimationLoop();

    // Load assets
    this.loadAssets();
  }

  private createGodRays() {
    const rayColors = [0x44ffcc, 0x88ccff, 0x44ffcc]; 
    rayColors.forEach((color, index) => {
        const ray = new THREE.SpotLight(color, 200); 
        ray.position.set((index - 1) * 10, 30, -20); // High up, slightly back
        ray.target.position.set(0, 0, 0); // Pointing at the table
        ray.angle = Math.PI / 6;      
        ray.penumbra = 0.8;           
        ray.decay = 1.5;                
        ray.distance = 100;
        ray.castShadow = true;
        this.scene.add(ray);
        this.scene.add(ray.target);
        this.godRays.push(ray);
    });
  }

  private async loadAssets(): Promise<void> {
    const loadingManager = new THREE.LoadingManager();
    
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.loadingProgress = Math.floor((itemsLoaded / itemsTotal) * 100);
      this.cdr.detectChanges();
    };

    loadingManager.onLoad = () => {
      setTimeout(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
        // Setup initial scene state after loading
        this.setupInitialPlacements();
      }, 800);
    };

    const loader = new GLTFLoader(loadingManager);

    try {
      // 1. Load the Pedestal (Table)
      const tableGltf = await loader.loadAsync('table.glb');
      this.tableModel = tableGltf.scene;
      
      // Enable shadows
      this.tableModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // 2. Pre-load all items in the manifest
      for (const item of this.galleryManifest) {
        if (item.modelPath) {
          const gltf = await loader.loadAsync(item.modelPath);
          
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          this.loadedModels.set(item.id, gltf.scene);
        }
      }
    } catch (error) {
      console.error("Error loading gallery assets:", error);
    }
  }

  private setupInitialPlacements() {
    if (this.tableModel) {
      this.tableModel.position.set(0, -5, 0); // Adjust Y based on your table's origin
      // Scale if necessary: this.tableModel.scale.set(5, 5, 5);
      this.scene.add(this.tableModel);
    }

    // Display the first item
    this.displayItem(this.currentIndex);
  }

  private displayItem(index: number) {
    const itemData = this.galleryManifest[index];
    const model = this.loadedModels.get(itemData.id);

    if (model) {
      this.currentItemModel = model;
      
      // Reset position/scale/rotation
      this.currentItemModel.position.set(0, 0, 0); // Start at center (table top)
      this.currentItemModel.rotation.set(0, 0, 0);
      
      // Add to scene
      this.scene.add(this.currentItemModel);
      
      // Optional: Add a subtle entrance animation
      gsap.from(this.currentItemModel.position, { y: 10, duration: 1.5, ease: "power2.out" });
      gsap.from(this.currentItemModel.rotation, { y: Math.PI, duration: 1.5, ease: "power2.out" });
    }
    
    // Update UI data
    this.currentItem = itemData;
    this.cdr.detectChanges();
    
    // Animate UI in
    this.animateUIIn();
  }

  // --- Scroll/Wheel Event Handler ---
  @HostListener('wheel', ['$event'])
  onScroll(event: WheelEvent) {
    if (this.isLoading || this.isAnimating) return;

    const direction = event.deltaY > 0 ? 1 : -1;
    this.navigateGallery(direction);
  }

  private navigateGallery(direction: number) {
    const nextIndex = this.currentIndex + direction;

    // Bounds check
    if (nextIndex < 0 || nextIndex >= this.galleryManifest.length) return;

    this.isAnimating = true;

    // 1. Animate UI Out
    this.animateUIOut();

    // 2. Animate current item out (sweep right or left)
    if (this.currentItemModel) {
      const exitX = direction > 0 ? -30 : 30; // Move left if scrolling down, right if scrolling up
      
      gsap.to(this.currentItemModel.position, {
        x: exitX,
        duration: 1,
        ease: "power2.in",
        onComplete: () => {
          // Remove old item from scene
          if (this.currentItemModel) this.scene.remove(this.currentItemModel);
          
          // 3. Update Index and Display New Item
          this.currentIndex = nextIndex;
          
          // Animate new item in from the opposite side
          const entryX = direction > 0 ? 30 : -30;
          this.displayItemWithTransition(this.currentIndex, entryX);
        }
      });
    }
  }
  
  private displayItemWithTransition(index: number, startX: number) {
     const itemData = this.galleryManifest[index];
     const model = this.loadedModels.get(itemData.id);

     if (model) {
       this.currentItemModel = model;
       
       // Start off-screen
       this.currentItemModel.position.set(startX, 0, 0); 
       this.currentItemModel.rotation.set(0, 0, 0);
       
       this.scene.add(this.currentItemModel);
       
       // Animate to center
       gsap.to(this.currentItemModel.position, {
         x: 0,
         duration: 1.2,
         ease: "power3.out",
         onComplete: () => {
             this.isAnimating = false; // Allow scrolling again
         }
       });
     }
     
     this.currentItem = itemData;
     this.cdr.detectChanges();
     this.animateUIIn();
  }

  // --- UI Animations ---
  private animateUIIn() {
    gsap.fromTo('.data-panel', 
      { opacity: 0, x: 50 }, 
      { opacity: 1, x: 0, duration: 0.8, ease: "power2.out", delay: 0.2 }
    );
  }

  private animateUIOut() {
    gsap.to('.data-panel', { opacity: 0, x: -50, duration: 0.5, ease: "power2.in" });
  }

  public goBack() {
    // Logic to navigate back to the main expedition view
    console.log("Returning to main view...");
  }


  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);
    const time = Date.now() * 0.001;
    
    // Slow rotation for the current item to view it from all angles
    if (this.currentItemModel) {
        this.currentItemModel.rotation.y = time * 0.2;
        // Subtle floating effect
        this.currentItemModel.position.y = Math.sin(time * 1.5) * 0.2; 
    }

    // Pulse God Rays
    if (this.godRays && this.godRays.length > 0) {
        this.godRays.forEach((ray, i) => {
            ray.intensity = 500 + Math.sin(time * 2 + i) * 100;
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
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
    if (this.composer) this.composer.dispose();
    document.body.style.overflow = 'auto'; // Restore scrolling
  }
}