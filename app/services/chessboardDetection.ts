// Service to handle chessboard detection using Hugging Face API

// Based on the actual FastAPI app.py code
const HUGGING_FACE_API_URL = 'https://han-xudong-opencv-camera-calibration.hf.space';

export interface ChessboardDetectionResult {
  success: boolean;
  corners?: Array<{ x: number; y: number }>;
  rows?: number;
  cols?: number;
  width?: number;
  height?: number;
  imagePoints?: number[];
  objectPoints?: number[];
  error?: string;
}

export interface CalibrationResult {
  success: boolean;
  rms?: number;
  camera_matrix?: number[];
  dist_coeffs?: number[];
  rvecs?: number[][];
  tvecs?: number[][];
  perViewErrors?: number[];
  error?: string;
}

export const detectChessboard = async (image: File, rows = 0, cols = 0): Promise<ChessboardDetectionResult> => {
  try {
    console.log('Processing image:', image.name);
    
    // Create FormData with the exact fields expected by FastAPI
    const formData = new FormData();
    formData.append('image', image);
    formData.append('rows', rows.toString());
    formData.append('cols', cols.toString());
    
    // Use the exact endpoint from app.py: /detect
    const response = await fetch(`${HUGGING_FACE_API_URL}/detect`, {
      method: 'POST',
      body: formData,
      // No Content-Type header - let browser set it with boundary
    });
    
    console.log('API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('API response error:', errorText);
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('API response:', JSON.stringify(result, null, 2));
    
    // Parse the result according to the exact FastAPI response format from app.py
    if (result.success === true) {
      // Success case - extract all fields from the API response
      return {
        success: true,
        corners: result.corners || [],
        rows: result.rows,
        cols: result.cols,
        width: result.width,
        height: result.height,
        // Calculate image points from corners (required for hand-eye calibration)
        imagePoints: result.corners ? result.corners.flatMap((c: { x: number; y: number }) => [c.x, c.y]) : [],
        // Generate object points using the detected chessboard size
        objectPoints: result.corners && result.rows && result.cols 
          ? generateObjectPoints(result.corners, result.rows, result.cols) 
          : [],
        error: undefined,
      };
    } else {
      // Failure case - return error message
      return {
        success: false,
        error: result.error || 'Unknown detection error',
      };
    }
  } catch (error) {
    console.error('Chessboard detection failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Helper function to generate object points for chessboard
const generateObjectPoints = (corners: Array<{ x: number; y: number }>, rows: number, cols: number): number[] => {
  if (!corners || corners.length === 0) return [];
  
  // Create object points assuming 30mm square size
  const squareSize = 30.0;
  const objectPoints: number[] = [];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      objectPoints.push(c * squareSize);
      objectPoints.push(r * squareSize);
      objectPoints.push(0.0);
    }
  }
  
  return objectPoints;
};

// New function for camera calibration
// This would be called after detecting corners in multiple images
export const calibrateCamera = async (data: { images: Array<{ corners: Array<{ x: number; y: number }>; rows: number; cols: number }> }): Promise<CalibrationResult> => {
  try {
    // Use the exact endpoint from app.py: /calibrate
    const response = await fetch(`${HUGGING_FACE_API_URL}/calibrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Calibration response:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error('Camera calibration failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const detectChessboardsBatch = async (images: File[]): Promise<ChessboardDetectionResult[]> => {
  return Promise.all(images.map(image => detectChessboard(image)));
};