import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private artifactModel!: THREE.Group; 
  
  private animationFrameId: number | null = null;

  ngAfterViewInit(): void {
    this.initThreeJsScene();
  }

  private async initThreeJsScene(): Promise<void> {
    const container = this.canvasContainer.nativeElement;

    // 1. THE GALLERY (Scene & Camera)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 6); // Positioned straight ahead

    // 2. THE RENDERER (Calibrated for high-end physical materials)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2; // Slightly brighter for the museum vibe
    container.appendChild(this.renderer.domElement);

    // 3. THE STUDIO ENVIRONMENT (HDRI)
    try {
      const rgbeLoader = new RGBELoader();
      const envMap = await rgbeLoader.loadAsync('studio.hdr');
      envMap.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = envMap;
    } catch (error) {
      console.error("Missing studio.hdr in public folder", error);
    }

    // 4. THE MUSEUM SPOTLIGHT (Dramatic top lighting)
    const spotLight = new THREE.SpotLight(0xffffff, 5);
    spotLight.position.set(0, 5, 2);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.5; // Soft edges on the light
    this.scene.add(spotLight);

    // 5. LOAD AND TRANSFORM THE ARTIFACT
    try {
      const gltfLoader = new GLTFLoader();
      const gltf = await gltfLoader.loadAsync('statue.glb');
      this.artifactModel = gltf.scene;
      
      // THE SECRET SAUCE: Overwrite the material to pure polished marble
      const marbleMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,        // Pure white
        roughness: 0.2,         // Smooth surface
        metalness: 0.1,         // Slight metallic reflection for depth
        clearcoat: 1.0,         // A glossy coating like polished stone
        clearcoatRoughness: 0.1,
      });

      // Apply this premium material to every part of the downloaded model
      this.artifactModel.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.material = marbleMaterial;
        }
      });

      // Center the model slightly lower on the screen
      this.artifactModel.position.set(0, -1, 0); 
      
      // Pro-tip: If your downloaded model is massive, uncomment and adjust the scale below:
      // this.artifactModel.scale.set(0.5, 0.5, 0.5); 

      this.scene.add(this.artifactModel);
      this.startAnimationLoop();

    } catch (error) {
      console.error("Error loading statue.glb. Check file name and location.", error);
    }
  }

  // 6. THE CINEMATIC ROTATION
  private startAnimationLoop = (): void => {
    this.animationFrameId = requestAnimationFrame(this.startAnimationLoop);

    if (this.artifactModel) {
      // A very slow, dramatic, museum-like rotation
      this.artifactModel.rotation.y += 0.002;
    }

    this.renderer.render(this.scene, this.camera);
  };

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.camera && this.renderer) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.renderer) this.renderer.dispose();
  }
}