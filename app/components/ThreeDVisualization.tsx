'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ThreeDVisualizationProps {
  tcpPoses: Array<{ x: number; y: number; z: number; w: number; xq: number; yq: number; zq: number }>;
  calibrationType: 'eye-in-hand' | 'eye-to-hand';
  calibrationResults?: { rotation: number[]; translation: number[] } | null;
}

// Helper function to create coordinate axes
const createAxes = (size: number): THREE.Group => {
  const axes = new THREE.Group();
  
  // X axis (red)
  const xGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(size, 0, 0)
  ]);
  const xMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
  const xLine = new THREE.Line(xGeometry, xMaterial);
  axes.add(xLine);
  
  // Y axis (green)
  const yGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, size, 0)
  ]);
  const yMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  const yLine = new THREE.Line(yGeometry, yMaterial);
  axes.add(yLine);
  
  // Z axis (blue)
  const zGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, size)
  ]);
  const zMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff });
  const zLine = new THREE.Line(zGeometry, zMaterial);
  axes.add(zLine);
  
  return axes;
};

// Helper function to create a simple robot TCP representation
const createTCPPose = (position: THREE.Vector3, color: number = 0x3b82f6): THREE.Group => {
  const tcp = new THREE.Group();
  
  // Base sphere for TCP position
  const tcpGeometry = new THREE.SphereGeometry(0.3, 16, 16);
  const tcpMaterial = new THREE.MeshStandardMaterial({ color });
  const tcpSphere = new THREE.Mesh(tcpGeometry, tcpMaterial);
  tcpSphere.position.copy(position);
  tcp.add(tcpSphere);
  
  // Add coordinate axes to TCP
  const tcpAxes = createAxes(1);
  tcpAxes.position.copy(position);
  tcp.add(tcpAxes);
  
  return tcp;
};

// Helper function to create a simple camera representation
const createCameraPose = (position: THREE.Vector3, color: number = 0xef4444): THREE.Group => {
  const camera = new THREE.Group();
  
  // Camera body - truncated pyramid
  const cameraGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8);
  const cameraMaterial = new THREE.MeshStandardMaterial({ color });
  const cameraBody = new THREE.Mesh(cameraGeometry, cameraMaterial);
  cameraBody.position.copy(position);
  cameraBody.rotation.x = Math.PI / 2;
  camera.add(cameraBody);
  
  // Camera lens
  const lensGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8);
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
  const lens = new THREE.Mesh(lensGeometry, lensMaterial);
  lens.position.set(position.x, position.y, position.z + 0.3);
  lens.rotation.x = Math.PI / 2;
  camera.add(lens);
  
  // Add coordinate axes to camera
  const cameraAxes = createAxes(0.8);
  cameraAxes.position.copy(position);
  camera.add(cameraAxes);
  
  return camera;
};

const ThreeDVisualization: React.FC<ThreeDVisualizationProps> = ({ tcpPoses, calibrationType, calibrationResults }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const objectsRef = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-10, -10, -10);
    scene.add(fillLight);

    // Grid helper - ground plane
    const gridHelper = new THREE.GridHelper(30, 30, 0xe2e8f0, 0x94a3b8);
    scene.add(gridHelper);

    // Origin axes
    const originAxes = createAxes(3);
    scene.add(originAxes);
    objectsRef.current.push(originAxes);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        if (containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
      // Dispose all objects
      objectsRef.current.forEach(obj => {
        scene.remove(obj);
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    };
  }, []);

  // Update visualization when TCP poses change
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Remove existing TCP and camera objects
    const existingObjects = objectsRef.current.filter(obj => 
      obj.name === 'tcp-pose' || obj.name === 'camera-pose'
    );
    existingObjects.forEach(obj => {
      sceneRef.current?.remove(obj);
      const index = objectsRef.current.indexOf(obj);
      if (index > -1) {
        objectsRef.current.splice(index, 1);
      }
    });

    // Add TCP poses visualization
    tcpPoses.forEach((pose, index) => {
      const tcpPosition = new THREE.Vector3(pose.x, pose.y, pose.z);
      
      // Create TCP visualization
      const tcpVisualization = createTCPPose(tcpPosition);
      tcpVisualization.name = 'tcp-pose';
      sceneRef.current?.add(tcpVisualization);
      objectsRef.current.push(tcpVisualization);
      
      // Create corresponding camera pose (simplified offset for now)
      // In real application, this would be based on calibration results
      const cameraPosition = new THREE.Vector3(pose.x + 1, pose.y + 1, pose.z + 1);
      const cameraVisualization = createCameraPose(cameraPosition);
      cameraVisualization.name = 'camera-pose';
      sceneRef.current?.add(cameraVisualization);
      objectsRef.current.push(cameraVisualization);
      
      // Connect TCP to camera with a line
      const connectionGeometry = new THREE.BufferGeometry().setFromPoints([
        tcpPosition,
        cameraPosition
      ]);
      const connectionMaterial = new THREE.LineBasicMaterial({ color: 0x64748b, opacity: 0.6, transparent: true });
      const connectionLine = new THREE.Line(connectionGeometry, connectionMaterial);
      connectionLine.name = 'tcp-pose';
      sceneRef.current?.add(connectionLine);
      objectsRef.current.push(connectionLine);
    });
  }, [tcpPoses]);

  // Update visualization when calibration results change
  useEffect(() => {
    if (!sceneRef.current || !calibrationResults) return;
    
    // Remove existing calibration result objects
    const existingCalibObjects = objectsRef.current.filter(obj => 
      obj.name === 'calibration-result'
    );
    existingCalibObjects.forEach(obj => {
      sceneRef.current?.remove(obj);
      const index = objectsRef.current.indexOf(obj);
      if (index > -1) {
        objectsRef.current.splice(index, 1);
      }
    });

    // Create calibration result visualization
    // This would typically show the transformation between camera and TCP
    const calibGroup = new THREE.Group();
    calibGroup.name = 'calibration-result';
    
    // For simplicity, we'll show a transformed coordinate system
    const calibAxes = createAxes(4);
    calibAxes.position.set(5, 5, 5);
    calibAxes.rotation.set(
      calibrationResults.rotation[1] || 0,
      calibrationResults.rotation[2] || 0,
      calibrationResults.rotation[3] || 0
    );
    calibGroup.add(calibAxes);
    
    sceneRef.current.add(calibGroup);
    objectsRef.current.push(calibGroup);
    
  }, [calibrationResults]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default ThreeDVisualization;