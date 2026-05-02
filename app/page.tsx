'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import NextImage from 'next/image';
import ThreeDVisualization from './components/ThreeDVisualization';
import Modal from './components/Modal';
import { CheckSquare } from 'lucide-react';
import { detectChessboardsBatch, detectChessboard } from './services/chessboardDetection';
import { runHandEyeCalibration, quaternionToRotationMatrix } from './services/handEyeCalibration';

type ImportedPose = {
  file_name: string;
  image_id?: string;
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  w?: number;
  xq?: number;
  yq?: number;
  zq?: number;
};

const Home: React.FC = () => {
  // State definitions
  const [calibrationType, setCalibrationType] = useState<'eye-in-hand' | 'eye-to-hand'>('eye-in-hand');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [tcpPoses, setTcpPoses] = useState<Array<{ x: number; y: number; z: number; w: number; xq: number; yq: number; zq: number }>>([]);
  const [calibrationResults, setCalibrationResults] = useState<{ rotation: number[]; translation: number[] } | null>(null);
  const [chessboardDetections, setChessboardDetections] = useState<Array<{ success: boolean; imagePoints?: number[]; objectPoints?: number[]; error?: string; corners?: Array<{ x: number; y: number }>; rows?: number; cols?: number }>>([]);
  const [detectionStatuses, setDetectionStatuses] = useState<Array<'processing' | 'success' | 'error'>>([]);
  const [selectedDataIndex, setSelectedDataIndex] = useState<number | null>(null);
  
  // Multi-select state
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalShowCancel, setModalShowCancel] = useState(false);
  const [modalOnConfirm, setModalOnConfirm] = useState<(() => void) | undefined>();
  
  // Import options with default values
  const importOptions = {
    eulerUnit: 'degrees' as const
  };
  
  // Refs for image and canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Effect to handle image preview drawing
  useEffect(() => {
    if (!canvasRef.current || !imgRef.current || selectedDataIndex === null) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = imgRef.current;
    const imageSrc = imagePreviews[selectedDataIndex] || '';
    if (!imageSrc) return;
    
    // Get image dimensions from original image file if available
    let originalWidth = 0;
    let originalHeight = 0;
    
    // Create a temporary image to get original dimensions
    const tempImg = new Image();
    tempImg.onload = () => {
      originalWidth = tempImg.width;
      originalHeight = tempImg.height;
      // Set the imgRef source after getting original dimensions
      img.src = imageSrc;
    };
    tempImg.src = imageSrc;
    
    const draw = () => {
      // Clear canvas first
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Check if image dimensions are available
      if (!originalWidth || !originalHeight) return;
      
      // Get container dimensions
      const container = img.parentElement;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      // Calculate image display size (same as img element)
      const imgRatio = originalWidth / originalHeight;
      const containerRatio = containerRect.width / containerRect.height;
      
      let imgDisplayWidth, imgDisplayHeight, imgOffsetX, imgOffsetY;
      if (imgRatio > containerRatio) {
        // Image is wider than container - fit to width
        imgDisplayWidth = containerRect.width;
        imgDisplayHeight = containerRect.width / imgRatio;
        imgOffsetX = 0;
        imgOffsetY = (containerRect.height - imgDisplayHeight) / 2;
      } else {
        // Image is taller than container - fit to height
        imgDisplayWidth = containerRect.height * imgRatio;
        imgDisplayHeight = containerRect.height;
        imgOffsetX = (containerRect.width - imgDisplayWidth) / 2;
        imgOffsetY = 0;
      }
      
      // Match canvas resolution to container size for sharp lines
      canvas.width = containerRect.width;
      canvas.height = containerRect.height;
      
      // Match canvas style size to container size
      canvas.style.width = `${containerRect.width}px`;
      canvas.style.height = `${containerRect.height}px`;
      
      // Get detection result for the selected image
      const detection = chessboardDetections[selectedDataIndex];
      if (!detection || !detection.success || !detection.corners) {
        return;
      }
      
      // Calculate scale factors based on original image and display size
      const scaleX = imgDisplayWidth / originalWidth;
      const scaleY = imgDisplayHeight / originalHeight;
      
      const { corners } = detection;
      
      // Calculate point and line sizes based on display size
      const minDisplayDimension = Math.min(imgDisplayWidth, imgDisplayHeight);
      const pointSize = minDisplayDimension * 0.005; // 0.5% of minimum dimension
      const lineWidth = minDisplayDimension * 0.0025; // 0.25% of minimum dimension
      
      // Draw corners with correct offset and scale
      corners.forEach((corner, index) => {
        // Calculate corner position relative to container
        const x = imgOffsetX + corner.x * scaleX;
        const y = imgOffsetY + corner.y * scaleY;
        
        // Draw point - first corner red, others green
        ctx.beginPath();
        ctx.arc(x, y, pointSize, 0, 2 * Math.PI);
        ctx.fillStyle = index === 0 ? 'red' : 'lime';
        ctx.fill();
        
        // Draw order line connecting adjacent points
        if (index > 0) {
          const prev = corners[index - 1];
          const prevX = imgOffsetX + prev.x * scaleX;
          const prevY = imgOffsetY + prev.y * scaleY;
          
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        }
      });
    };
    
    // Use requestAnimationFrame to ensure we draw after layout update
    const rafId = requestAnimationFrame(draw);
    
    // Draw when image loads
    img.onload = () => {
      requestAnimationFrame(draw);
    };
    
    // Handle resize with ResizeObserver on both img and container
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(draw);
    });
    resizeObserver.observe(img);
    resizeObserver.observe(img.parentElement!);
    
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
      img.onload = null;
    };
  }, [selectedDataIndex, chessboardDetections, imagePreviews]);

  // Handle image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      
      // Add new images with initial processing status
      setImages(prev => [...prev, ...filesArray]);
      
      // Generate previews
      const previews = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviews(prev => [...prev, ...previews]);
      
      // Initialize detection statuses as processing
      const newStatuses = filesArray.map(() => 'processing' as const);
      setDetectionStatuses(prev => [...prev, ...newStatuses]);
      
      // Initialize empty detections for new images
      const emptyDetections = filesArray.map(() => ({ success: false }));
      setChessboardDetections(prev => [...prev, ...emptyDetections]);
      
      // Initialize TCP poses for new images with default values
      const newPoses = filesArray.map(() => ({ x: 0, y: 0, z: 0, w: 1, xq: 0, yq: 0, zq: 0 }));
      setTcpPoses(prev => [...prev, ...newPoses]);
      
      // Auto-detect chessboards immediately after upload
      try {
        // Process each image individually to update status
        const startIndex = images.length;
        await Promise.all(filesArray.map(async (file, index) => {
          try {
            const detectionResult = await detectChessboard(file);
            
            // Update detection result for this image
            setChessboardDetections(prev => {
              const newDetections = [...prev];
              newDetections[startIndex + index] = detectionResult;
              return newDetections;
            });
            
            // Update status to success
            setDetectionStatuses(prev => {
              const newStatuses = [...prev];
              newStatuses[startIndex + index] = 'success';
              return newStatuses;
            });
          } catch (error) {
            console.error(`Auto-detection failed for image ${index + 1}:`, error);
            
            // Update status to error
            setDetectionStatuses(prev => {
              const newStatuses = [...prev];
              newStatuses[startIndex + index] = 'error';
              return newStatuses;
            });
            
            // Update detection result with error info
            setChessboardDetections(prev => {
              const newDetections = [...prev];
              newDetections[startIndex + index] = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              };
              return newDetections;
            });
          }
        }));
      } catch (error) {
        console.error('Auto-detection batch failed:', error);
      }
      
      // Reset the file input to allow selecting the same files again
      e.target.value = '';
    }
  };

  // Handle remove image
  const handleRemoveImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
    
    const newPreviews = [...imagePreviews];
    URL.revokeObjectURL(newPreviews[index]);
    newPreviews.splice(index, 1);
    setImagePreviews(newPreviews);
    
    const newPoses = [...tcpPoses];
    newPoses.splice(index, 1);
    setTcpPoses(newPoses);
    
    const newDetections = [...chessboardDetections];
    newDetections.splice(index, 1);
    setChessboardDetections(newDetections);
    
    const newStatuses = [...detectionStatuses];
    newStatuses.splice(index, 1);
    setDetectionStatuses(newStatuses);
    
    // Update selected index if it was pointing to a deleted item
    if (selectedDataIndex !== null && selectedDataIndex > index) {
      setSelectedDataIndex(selectedDataIndex - 1);
    } else if (selectedDataIndex === index) {
      setSelectedDataIndex(null);
    }
    
    // Update selectedRows - remove the deleted index and adjust remaining indices
    setSelectedRows(prev => {
      return prev
        .filter(i => i !== index) // Remove deleted index
        .map(i => i > index ? i - 1 : i); // Adjust indices greater than deleted index
    });
  };

  // Handle TCP pose change
  const handleTcpPoseChange = (index: number, field: keyof typeof tcpPoses[0], value: string) => {
    const newPoses = [...tcpPoses];
    if (!newPoses[index]) {
      newPoses[index] = { x: 0, y: 0, z: 0, w: 1, xq: 0, yq: 0, zq: 0 };
    }
    newPoses[index][field] = parseFloat(value) || (field === 'w' ? 1 : 0);
    setTcpPoses(newPoses);
  };

  // Handle calibration
  const handleCalibration = async () => {
    try {
      // Step 1: Check if we have detection results
      if (chessboardDetections.length === 0) {
        // If no detection results, run detection first
        const detectionResults = await detectChessboardsBatch(images);
        setChessboardDetections(detectionResults);
        
        // Filter out failed detections
        const successfulDetections = detectionResults.filter(result => result.success);
        
        if (successfulDetections.length < 3) {
          showModal('Calibration Error', 'Need at least 3 successful chessboard detections to perform calibration.');
          return;
        }
        
        // Step 2: Extract image points and object points
        const imagePoints = successfulDetections.map(result => result.imagePoints || []);
        const objectPoints = successfulDetections.map(result => result.objectPoints || []);
        
        // Step 3: Run hand-eye calibration
        const result = runHandEyeCalibration(
          tcpPoses,
          imagePoints,
          objectPoints,
          calibrationType
        );
        
        // Step 4: Update state with results
        setCalibrationResults({
          rotation: result.rotation,
          translation: result.translation
        });
      } else {
        // Use existing detection results
        const successfulDetections = chessboardDetections.filter(result => result.success);
        
        if (successfulDetections.length < 3) {
          showModal('Calibration Error', 'Need at least 3 successful chessboard detections to perform calibration.');
          return;
        }
        
        // Step 2: Extract image points and object points
        const imagePoints = successfulDetections.map(result => result.imagePoints || []);
        const objectPoints = successfulDetections.map(result => result.objectPoints || []);
        
        // Step 3: Run hand-eye calibration
        const result = runHandEyeCalibration(
          tcpPoses,
          imagePoints,
          objectPoints,
          calibrationType
        );
        
        // Step 4: Update state with results
        setCalibrationResults({
          rotation: result.rotation,
          translation: result.translation
        });
      }
    } catch (error) {
      console.error('Calibration failed:', error);
      showModal('Calibration Failed', 'Calibration failed. Please check the console for more details.');
    }
  };

  // Function to show custom modal
  const showModal = (title: string, message: string, showCancel: boolean = false, onConfirm?: () => void) => {
    setModalTitle(title);
    setModalMessage(message);
    setModalShowCancel(showCancel);
    setModalOnConfirm(onConfirm);
    setModalOpen(true);
  };

  // Render the component
  return (
    <div className="h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8 overflow-hidden" suppressHydrationWarning>
      <div className="mx-auto w-full h-full">
        {/* Main Layout - Two Columns */}
        <div className="grid grid-cols-3 gap-6 h-full">
          {/* Custom Modal */}
          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title={modalTitle}
            showCancel={modalShowCancel}
            onConfirm={modalOnConfirm}
          >
            <p className="text-slate-600 dark:text-slate-300">
              {modalMessage}
            </p>
          </Modal>
          {/* Left Column - Configuration and Data List */}
          <div className="col-span-2 flex flex-col gap-6 h-full overflow-hidden">
            {/* Top Configuration Panel */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 flex-shrink-0">
              <div className="flex flex-col gap-4">
                {/* Title */}
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Hand-Eye Calibration
                </h1>
                
                {/* Configuration Sections */}
                <div className="flex flex-wrap py-2">
                  {/* Calibration Type Selection */}
                  <div className="flex flex-col items-center justify-center p-4 flex-1 min-w-[calc(25%-0.5rem)] bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 text-center">
                      Calibration Type
                    </span>
                    <div className="flex flex-col gap-1.5 w-full">
                      <button
                      className={`px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 bg-black hover:bg-gray-800 text-white w-full`}
                      onClick={() => setCalibrationType('eye-in-hand')}
                    >
                        Eye-in-Hand
                      </button>
                      <button
                        className={`px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 bg-gray-200 dark:bg-gray-700 text-black dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 w-full`}
                        onClick={() => setCalibrationType('eye-to-hand')}
                      >
                        Eye-to-Hand
                      </button>
                    </div>
                  </div>
                  
                  {/* Upload Data - Combined Images and TCP Poses */}
                  <div className="flex flex-col items-center justify-center p-4 flex-1 min-w-[calc(25%-0.5rem)] bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 text-center">
                      Upload Data
                    </span>
                    <div className="flex flex-col gap-1.5 w-full">
                      {/* Upload Images Button */}
                      <label className="inline-flex items-center justify-center px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md cursor-pointer transition-colors duration-200 text-sm">
                        <input
                          type="file"
                          id="imageUpload"
                          multiple
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Images
                      </label>
                      
                      {/* Import TCP Poses Button */}
                      <div className="inline-flex items-center justify-center w-full">
                        <button 
                          className="inline-flex items-center justify-center px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md cursor-pointer transition-colors duration-200 text-sm w-full"
                          onClick={(e) => {
                            // Check if there are any images uploaded
                            if (images.length === 0) {
                              e.preventDefault();
                              showModal('Upload Images First', 'Please upload images first before importing TCP poses.');
                              return;
                            }
                            // Trigger the file input click
                            const fileInput = document.getElementById('tcpPosesInput') as HTMLInputElement;
                            fileInput?.click();
                          }}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Poses
                        </button>
                        <input 
                          id="tcpPosesInput"
                          type="file" 
                          accept=".csv,.json"
                          className="hidden"
                          onChange={(e) => {
                            // Handle file import
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              try {
                                const content = event.target?.result as string;
                                let poses: ImportedPose[] = [];
                                
                                // Parse based on file type
                                // Parse based on file type
                                if (file.name.endsWith('.json')) {
                                  // Parse JSON
                                  const jsonData = JSON.parse(content);
                                  poses = jsonData.poses || [];
                                  
                                  // Check if poses have file_name instead of image_id
                                  if (poses.length > 0 && !poses[0].file_name && poses[0].image_id) {
                                    showModal('Import Error', 'JSON file must use file_name instead of image_id');
                                    return;
                                  }
                                } else if (file.name.endsWith('.csv')) {
                                  // Parse CSV
                                  const lines = content.trim().split('\n');
                                  
                                  // Skip comment lines (starting with #)
                                  const dataLines = lines.filter(line => !line.trim().startsWith('#'));
                                  if (dataLines.length === 0) {
                                    showModal('Import Error', 'CSV file contains no data rows');
                                    return;
                                  }
                                  
                                  const headers = dataLines[0].split(',').map(h => h.trim().toLowerCase());
                                  
                                  // Check for required position headers
                                  const hasPositionHeaders = ['x', 'y', 'z'].every(header => headers.includes(header));
                                  if (!hasPositionHeaders) {
                                    showModal('Import Error', 'CSV file must contain position columns: x, y, z');
                                    return;
                                  }
                                  
                                  // Check for orientation headers
                                  const hasQuaternionHeaders = ['w', 'xq', 'yq', 'zq'].some(header => headers.includes(header));
                                  const hasEulerHeaders = ['rx', 'ry', 'rz'].some(header => headers.includes(header));
                                  
                                  if (!hasQuaternionHeaders && !hasEulerHeaders) {
                                    showModal('Import Error', 'CSV file must contain either quaternion columns (w, xq, yq, zq) or euler columns (rx, ry, rz)');
                                    return;
                                  }
                                  
                                  // Check for required file_name header
                                  if (!headers.includes('file_name')) {
                                    showModal('Import Error', 'CSV file must contain file_name column');
                                    return;
                                  }
                                  
                                  // Parse data rows
                                  poses = dataLines.slice(1).map((line, index) => {
                                    const values = line.split(',').map(v => v.trim());
                                    const pose: ImportedPose = {
                                      file_name: values[headers.indexOf('file_name')]
                                    };
                                    
                                    // Extract position values
                                    pose.x = parseFloat(values[headers.indexOf('x')]) || 0.0;
                                    pose.y = parseFloat(values[headers.indexOf('y')]) || 0.0;
                                    pose.z = parseFloat(values[headers.indexOf('z')]) || 0.0;
                                    
                                    // Extract orientation values if present
                                    if (headers.includes('rx') && headers.includes('ry') && headers.includes('rz')) {
                                      pose.rx = parseFloat(values[headers.indexOf('rx')]) || 0.0;
                                      pose.ry = parseFloat(values[headers.indexOf('ry')]) || 0.0;
                                      pose.rz = parseFloat(values[headers.indexOf('rz')]) || 0.0;
                                    } else if (headers.includes('w') && headers.includes('xq') && headers.includes('yq') && headers.includes('zq')) {
                                      pose.w = parseFloat(values[headers.indexOf('w')]) || 1.0;
                                      pose.xq = parseFloat(values[headers.indexOf('xq')]) || 0.0;
                                      pose.yq = parseFloat(values[headers.indexOf('yq')]) || 0.0;
                                      pose.zq = parseFloat(values[headers.indexOf('zq')]) || 0.0;
                                    }
                                    
                                    return pose;
                                  });
                                }
                                
                                // Update TCP poses state
                                if (poses.length > 0) {
                                  // Check if pose count matches image count
                                  if (poses.length !== images.length) {
                                    showModal('Import Error', `Pose count (${poses.length}) does not match image count (${images.length})`);
                                    return;
                                  }
                                  
                                  // Check if all pose file_names match with uploaded images
                                  const imageNames = new Set(images.map(img => img.name));
                                  const invalidPoses = poses.filter((pose) => !imageNames.has(pose.file_name));
                                  
                                  if (invalidPoses.length > 0) {
                                    const invalidNames = invalidPoses.map((pose) => pose.file_name).join(', ');
                                    showModal('Import Error', `The following file names could not be found in uploaded images: ${invalidNames}`);
                                    return;
                                  }
                                  
                                  // Create a new TCP poses array with the same length as images
                                  const newTcpPoses = [...tcpPoses];
                                  
                                  // Map poses to images based on file_name
                                  poses.forEach((pose) => {
                                    // Find the image index by matching file_name with images array
                                    const imageIndex = images.findIndex(img => img.name === pose.file_name);
                                    
                                    if (imageIndex !== -1) {
                                      // Convert pose to quaternion if needed
                                      let quaternionPose;
                                      if (pose.rx !== undefined && pose.ry !== undefined && pose.rz !== undefined) {
                                        // Convert euler angles to quaternion
                                        let rx = pose.rx || 0.0;
                                        let ry = pose.ry || 0.0;
                                        let rz = pose.rz || 0.0;
                                        
                                        // Convert to radians if needed
                                        if (importOptions.eulerUnit === 'degrees') {
                                          rx = rx * Math.PI / 180;
                                          ry = ry * Math.PI / 180;
                                          rz = rz * Math.PI / 180;
                                        }
                                        
                                        // Proper euler to quaternion conversion (XYZ order)
                                        const cr = Math.cos(rx / 2);
                                        const sr = Math.sin(rx / 2);
                                        const cp = Math.cos(ry / 2);
                                        const sp = Math.sin(ry / 2);
                                        const cy = Math.cos(rz / 2);
                                        const sy = Math.sin(rz / 2);
                                        
                                        quaternionPose = {
                                          x: pose.x || 0.0,
                                          y: pose.y || 0.0,
                                          z: pose.z || 0.0,
                                          w: cr * cp * cy + sr * sp * sy,
                                          xq: sr * cp * cy - cr * sp * sy,
                                          yq: cr * sp * cy + sr * cp * sy,
                                          zq: cr * cp * sy - sr * sp * cy
                                        };
                                      } else {
                                        // Use quaternion directly
                                        quaternionPose = {
                                          x: pose.x || 0.0,
                                          y: pose.y || 0.0,
                                          z: pose.z || 0.0,
                                          w: pose.w || 1.0,
                                          xq: pose.xq || 0.0,
                                          yq: pose.yq || 0.0,
                                          zq: pose.zq || 0.0
                                        };
                                      }
                                      
                                      // Update the TCP pose for this image index
                                      newTcpPoses[imageIndex] = quaternionPose;
                                    }
                                  });
                                  
                                  setTcpPoses(newTcpPoses);
                                  showModal('Import Success', `Successfully imported ${poses.length} TCP poses`);
                                }
                              } catch (error) {
                                console.error('Failed to parse file:', error);
                                showModal('Import Error', 'Failed to parse file. Please check the format.');
                              }
                            };
                            
                            reader.readAsText(file);
                          }}
                          />
                      </div>
                    </div>
                  </div>
                  
                  {/* Template Download Buttons */}
                  <div className="flex flex-col items-center justify-center p-4 flex-1 min-w-[calc(25%-0.5rem)] bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 text-center">
                      Template
                    </span>
                    <div className="flex flex-col gap-1.5 w-full">
                      <button 
                        className="inline-flex items-center justify-center px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md transition-colors duration-200 text-sm"
                        onClick={() => {
                          // Create JSON template with quaternion
                          const template = {
                            format: 'tcp_poses_template',
                            description: 'Template for TCP poses. Fill in the values for each image.',
                            units: {
                              position: 'mm',
                              orientation: 'quaternion'
                            },
                            quaternion_format: 'wxyz',
                            poses: [
                              {
                                file_name: 'image1.jpg',
                                x: 0.0,
                                y: 0.0,
                                z: 0.0,
                                w: 1.0,
                                xq: 0.0,
                                yq: 0.0,
                                zq: 0.0
                              },
                              {
                                file_name: 'image2.jpg',
                                x: 100.0,
                                y: 50.0,
                                z: 200.0,
                                w: 0.9,
                                xq: 0.1,
                                yq: 0.2,
                                zq: 0.3
                              }
                            ]
                          };
                          
                          // Create JSON blob and download
                          const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'tcp_poses_template_quaternion.json';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        JSON
                      </button>
                       
                      <button 
                        className="inline-flex items-center justify-center px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-md transition-colors duration-200 text-sm"
                        onClick={() => {
                          // Create CSV template with only quaternion format
                          const csvContent = `# TCP Poses Template
# Position units: mm
# Quaternion format: wxyz (w=real, xq/yq/zq=imaginary)
# All angles should be represented as quaternions
file_name,x,y,z,w,xq,yq,zq
image1.jpg,0.0,0.0,0.0,1.0,0.0,0.0,0.0
image2.jpg,100.0,50.0,200.0,0.9,0.1,0.2,0.3
image3.jpg,150.0,100.0,150.0,0.8,0.2,0.3,0.4
`;
                          
                          // Create CSV blob and download
                          const blob = new Blob([csvContent], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'tcp_poses_template_quaternion.csv';
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        CSV
                      </button>
                    </div>
                  </div>
                  
                  {/* Run Calibration Button */}
                  <div className="flex flex-col items-center justify-center p-4 flex-1 min-w-[calc(25%-0.5rem)] bg-white dark:bg-slate-800 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 text-center">
                      Options
                    </span>
                    <div className="flex flex-col gap-1.5 w-full">
                      <button
                      onClick={handleCalibration}
                      className="bg-black hover:bg-gray-800 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                      disabled={images.length < 3 || tcpPoses.length < 3 || detectionStatuses.length < 3 || !detectionStatuses.every(status => status === 'success')}
                    >
                      Run Calibration
                    </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Data List */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Data List
                </h2>
                <div className="flex gap-2">
                  {/* Multi-select toggle */}
                  <button
                    onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
                    className={`p-2 rounded-md transition-colors ${isMultiSelectMode ? 'bg-black text-white dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'}`}
                    title={isMultiSelectMode ? "Exit multi-select" : "Multi-select"}
                  >
                    <CheckSquare className="w-5 h-5" />
                  </button>
                  {/* Delete selected button */}
                  <button
                    onClick={() => {
                      if (selectedRows.length > 0) {
                        // Delete selected rows without confirmation
                        // Sort rows in descending order to avoid index shifting issues
                        const sortedRows = [...selectedRows].sort((a, b) => b - a);
                        
                        // Create new arrays with all selected rows removed at once
                        const newImages = images.filter((_, i) => !selectedRows.includes(i));
                        const newPreviews = imagePreviews.filter((_, i) => !selectedRows.includes(i));
                        const newPoses = tcpPoses.filter((_, i) => !selectedRows.includes(i));
                        const newDetections = chessboardDetections.filter((_, i) => !selectedRows.includes(i));
                        const newStatuses = detectionStatuses.filter((_, i) => !selectedRows.includes(i));
                        
                        // Revoke object URLs for deleted images
                        selectedRows.forEach(index => {
                          URL.revokeObjectURL(imagePreviews[index]);
                        });
                        
                        // Update all state arrays at once
                        setImages(newImages);
                        setImagePreviews(newPreviews);
                        setTcpPoses(newPoses);
                        setChessboardDetections(newDetections);
                        setDetectionStatuses(newStatuses);
                        
                        // Update selected index if it was pointing to a deleted item
                        if (selectedDataIndex !== null) {
                          const isDeleted = selectedRows.includes(selectedDataIndex);
                          if (isDeleted) {
                            setSelectedDataIndex(null);
                          } else {
                            // Calculate new index based on deleted rows
                            const newIndex = selectedDataIndex - selectedRows.filter(i => i < selectedDataIndex).length;
                            setSelectedDataIndex(newIndex);
                          }
                        }
                        
                        // Clear selection and exit multi-select mode
                        setSelectedRows([]);
                        setIsMultiSelectMode(false);
                      }
                    }}
                    className="p-2 rounded-md text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={selectedRows.length === 0}
                    title="Delete selected items"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Data Table Container - Fixed height with proper scrolling */}
              <div className="overflow-y-auto flex-1">
                {imagePreviews.length === 0 ? (
                  <div className="text-center bg-slate-50 dark:bg-slate-700 rounded-lg flex flex-col items-center justify-center h-full py-4">
                    <svg className="w-12 h-12 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <p className="text-slate-500 dark:text-slate-400">
                      No data uploaded yet. Please upload chessboard images and TCP poses.
                    </p>
                  </div>
                ) : (
                  <div className="min-w-full">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 table-fixed">
                      <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0 z-10">
                        <tr>
                          <th scope="col" className="w-16 px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {isMultiSelectMode ? (
                              <div className="w-4 h-4 flex items-center justify-center cursor-pointer" onClick={() => {
                                if (selectedRows.length === imagePreviews.length && imagePreviews.length > 0) {
                                  // Deselect all rows
                                  setSelectedRows([]);
                                } else {
                                  // Select all rows
                                  setSelectedRows(imagePreviews.map((_, i) => i));
                                }
                              }}>
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedRows.length === imagePreviews.length && imagePreviews.length > 0 ? 'border-black bg-black dark:border-white dark:bg-white' : 'border-slate-300 dark:border-slate-500'}`}>
                                  {selectedRows.length === imagePreviews.length && imagePreviews.length > 0 && (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={selectedRows.length === imagePreviews.length && imagePreviews.length > 0 ? 'white' : 'black'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="2 6 5 9 10 2" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            ) : (
                              '#'
                            )}
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Image
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Filename
                          </th>
                          <th scope="col" className="w-32 px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Detection
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            X (mm)
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Y (mm)
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            Z (mm)
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            W
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            XQ
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            YQ
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            ZQ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                        {imagePreviews.map((preview, index) => {
                          const pose = tcpPoses[index] || { x: 0, y: 0, z: 0, w: 1, xq: 0, yq: 0, zq: 0 };
                          return (
                            <tr 
                              key={index} 
                              className={`hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors duration-150 cursor-pointer ${selectedDataIndex === index ? 'bg-slate-100 dark:bg-slate-700' : ''} ${selectedRows.includes(index) ? 'bg-slate-100 dark:bg-slate-700' : ''}`}
                              onClick={() => {
                                if (isMultiSelectMode) {
                                  // Toggle selection in multi-select mode
                                  setSelectedRows(prev => {
                                    if (prev.includes(index)) {
                                      return prev.filter(i => i !== index);
                                    } else {
                                      return [...prev, index];
                                    }
                                  });
                                } else {
                                  // Single selection mode
                                  setSelectedDataIndex(index);
                                }
                              }}
                            >
                              <td className="w-16 px-6 py-4 whitespace-nowrap">
                                {isMultiSelectMode ? (
                                  <div className="w-4 h-4 flex items-center justify-center cursor-pointer" onClick={(e) => {
                                    e.stopPropagation();
                                    if (selectedRows.includes(index)) {
                                      setSelectedRows(prev => prev.filter(i => i !== index));
                                    } else {
                                      setSelectedRows(prev => [...prev, index]);
                                    }
                                  }}>
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedRows.includes(index) ? 'border-black bg-black dark:border-white dark:bg-white' : 'border-slate-300 dark:border-slate-500'}`}>
                                      {selectedRows.includes(index) && (
                                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="2 6 5 9 10 2" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-500 dark:text-slate-400">{index + 1}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-slate-300 dark:border-slate-600 relative">
                                  <NextImage
                                    src={preview}
                                    alt={`Chessboard ${index + 1}`}
                                    fill
                                    style={{ objectFit: 'cover' }}
                                    unoptimized
                                    suppressHydrationWarning
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">
                                {images[index]?.name || `Image ${index + 1}`}
                              </td>
                              <td className="w-32 px-6 py-4 whitespace-nowrap">
                                {/* Detection Status Indicator */}
                                {(() => {
                                  const status = detectionStatuses[index] || 'processing';
                                  switch (status) {
                                    case 'processing':
                                      return (
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse"></div>
                                          <span className="text-sm text-yellow-600 dark:text-yellow-400">Processing</span>
                                        </div>
                                      );
                                    case 'success':
                                      return (
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                          <span className="text-sm text-green-600 dark:text-green-400">Success</span>
                                        </div>
                                      );
                                    case 'error':
                                      return (
                                        <div className="flex items-center gap-2">
                                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                          <span className="text-sm text-red-600 dark:text-red-400">Error</span>
                                        </div>
                                      );
                                    default:
                                      return null;
                                  }
                                })()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'x', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.x || 0.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'y', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.y || 0.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'z', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.z || 0.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'w', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.w || 1.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'xq', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.xq || 0.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'yq', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.yq || 0.0}
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  onChange={(e) => handleTcpPoseChange(index, 'zq', e.target.value)}
                                  className="w-16 px-2 py-1 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                  value={pose.zq || 0.0}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              

            </div>
          </div>

          {/* Right Column - Preview & Results */}
          <div className="col-span-1 flex flex-col gap-6 h-full overflow-hidden">
            {/* Detection Preview */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 flex flex-col min-h-0" style={{ height: '50%' }}>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Detection Preview
              </h2>
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden flex flex-col min-h-0" style={{ height: 'calc(100% - 2rem)' }}>
                {/* Image and Detection Results - Always takes available height */}
                <div className="relative min-h-0 flex-1">
                  {selectedDataIndex !== null ? (
                    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                      {/* Image container with fixed size */}
                      <div className="w-full h-full flex items-center justify-center overflow-hidden">
                        {/* Image element for display */}
                        <img
                          ref={imgRef}
                          alt={`Detection preview ${selectedDataIndex + 1}`}
                          className="object-contain max-w-full max-h-full"
                          style={{ minWidth: 0, minHeight: 0 }}
                        />
                      </div>
                      {/* Canvas for drawing detection results */}
                      <canvas
                        ref={canvasRef}
                        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center p-4">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">
                          {imagePreviews.length > 0 ? 'Click on a data row to view its detection results' : 'Upload images to see detection preview'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Detection Info - Only appears when data is selected, takes minimal necessary height */}
                {selectedDataIndex !== null && (
                  <div className="bg-slate-100 dark:bg-slate-700 p-4 text-slate-900 dark:text-white overflow-auto">
                    <h3 className="font-medium">Image {selectedDataIndex + 1}: {images[selectedDataIndex]?.name}</h3>
                    <div className="mt-2 text-sm">
                      {chessboardDetections[selectedDataIndex] ? (
                        chessboardDetections[selectedDataIndex].success ? (
                          <div className="flex flex-wrap gap-4">
                            <span className="flex items-center text-green-400">
                              ✅ Detection: Success
                            </span>
                            <span>
                              Corners: {chessboardDetections[selectedDataIndex].corners?.length || 0}
                            </span>
                            {chessboardDetections[selectedDataIndex].rows && chessboardDetections[selectedDataIndex].cols && (
                              <span>
                                Size: {chessboardDetections[selectedDataIndex].rows}x{chessboardDetections[selectedDataIndex].cols}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-red-400">
                            ❌ Detection: Failed
                            {chessboardDetections[selectedDataIndex].error && (
                              <span className="ml-2">{chessboardDetections[selectedDataIndex].error}</span>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-yellow-400">⏳ Detection pending...</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Calibration Results and 3D Visualization */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 flex flex-col min-h-0" style={{ height: '50%' }}>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                Calibration Results
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0" style={{ height: 'calc(100% - 2rem)' }}>
                {/* Calibration Results */}
                <div className="flex flex-col min-h-0" style={{ height: '100%' }}>
                  {calibrationResults ? (
                    <div className="space-y-4 overflow-y-auto" style={{ height: '100%' }}>
                      <div>
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Rotation Matrix
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 font-mono text-sm overflow-auto">
                          <pre className="whitespace-pre-wrap">
{(() => {
  // Convert quaternion to rotation matrix
  const rotationMatrix = quaternionToRotationMatrix(calibrationResults.rotation);
  // Format as 3x3 matrix
  const formattedMatrix = [
    [rotationMatrix[0], rotationMatrix[1], rotationMatrix[2]],
    [rotationMatrix[3], rotationMatrix[4], rotationMatrix[5]],
    [rotationMatrix[6], rotationMatrix[7], rotationMatrix[8]]
  ];
  return JSON.stringify(formattedMatrix, null, 2);
})()}
                          </pre>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                          Translation Vector
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-3 font-mono text-sm overflow-auto">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(calibrationResults.translation, null, 2)}</pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center" style={{ height: '100%' }}>
                      <p className="text-lg font-medium mb-2">No calibration results yet</p>
                      <p className="text-sm">Upload images and TCP poses, then run calibration</p>
                    </div>
                  )}
                </div>
                
                {/* 3D Visualization */}
                <div className="flex flex-col min-h-0" style={{ height: '100%' }}>
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    3D Visualization
                  </h3>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden" style={{ height: 'calc(100% - 1.5rem)' }}>
                      <ThreeDVisualization 
                        tcpPoses={tcpPoses} 
                        calibrationType={calibrationType} 
                        calibrationResults={calibrationResults} 
                      />
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;