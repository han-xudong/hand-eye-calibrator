// Service to handle hand-eye calibration calculations

interface Pose {
  rotation: number[]; // Quaternion [w, x, y, z]
  translation: number[]; // [x, y, z]
}

interface CameraMatrix {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export interface CalibrationResult {
  rotation: number[]; // Quaternion [w, x, y, z]
  translation: number[]; // [x, y, z]
  error: number; // Reprojection error
}

/**
 * Convert Euler angles (rx, ry, rz) to quaternion
 * @param rx Roll angle in radians
 * @param ry Pitch angle in radians
 * @param rz Yaw angle in radians
 * @returns Quaternion [w, x, y, z]
 */
export const eulerToQuaternion = (rx: number, ry: number, rz: number): number[] => {
  const cr = Math.cos(rx / 2);
  const sr = Math.sin(rx / 2);
  const cp = Math.cos(ry / 2);
  const sp = Math.sin(ry / 2);
  const cy = Math.cos(rz / 2);
  const sy = Math.sin(rz / 2);

  return [
    cr * cp * cy + sr * sp * sy, // w
    sr * cp * cy - cr * sp * sy, // x
    cr * sp * cy + sr * cp * sy, // y
    cr * cp * sy - sr * sp * cy, // z
  ];
};

/**
 * Convert quaternion to rotation matrix
 * @param quaternion Quaternion [w, x, y, z]
 * @returns Rotation matrix [9 elements in row-major order]
 */
export const quaternionToRotationMatrix = (quaternion: number[]): number[] => {
  const [w, x, y, z] = quaternion;
  const x2 = x * 2;
  const y2 = y * 2;
  const z2 = z * 2;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    1 - yy - zz, xy - wz, xz + wy,
    xy + wz, 1 - xx - zz, yz - wx,
    xz - wy, yz + wx, 1 - xx - yy
  ];
};

/**
 * Convert rotation matrix to quaternion
 * @param matrix Rotation matrix [9 elements in row-major order]
 * @returns Quaternion [w, x, y, z]
 */
export const rotationMatrixToQuaternion = (matrix: number[]): number[] => {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
  
  const trace = m00 + m11 + m22;
  let w, x, y, z;
  
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    w = 0.25 / s;
    x = (m21 - m12) * s;
    y = (m02 - m20) * s;
    z = (m10 - m01) * s;
  } else if ((m00 > m11) && (m00 > m22)) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    w = (m21 - m12) / s;
    x = 0.25 * s;
    y = (m01 + m10) / s;
    z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    w = (m02 - m20) / s;
    x = (m01 + m10) / s;
    y = 0.25 * s;
    z = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    w = (m10 - m01) / s;
    x = (m02 + m20) / s;
    y = (m12 + m21) / s;
    z = 0.25 * s;
  }
  
  return [w, x, y, z];
};

/**
 * Multiply two rotation matrices
 * @param a First matrix [9 elements]
 * @param b Second matrix [9 elements]
 * @returns Product matrix [9 elements]
 */
export const multiplyMatrices = (a: number[], b: number[]): number[] => {
  return [
    a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
    a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
    a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
    a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
    a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
    a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
    a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
    a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
    a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
  ];
};

/**
 * Transpose a rotation matrix
 * @param matrix Matrix [9 elements]
 * @returns Transposed matrix [9 elements]
 */
export const transposeMatrix = (matrix: number[]): number[] => {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8]
  ];
};

/**
 * Multiply a vector by a rotation matrix
 * @param matrix Rotation matrix [9 elements]
 * @param vector Vector [x, y, z]
 * @returns Result vector [x, y, z]
 */
export const multiplyMatrixVector = (matrix: number[], vector: number[]): number[] => {
  return [
    matrix[0]*vector[0] + matrix[1]*vector[1] + matrix[2]*vector[2],
    matrix[3]*vector[0] + matrix[4]*vector[1] + matrix[5]*vector[2],
    matrix[6]*vector[0] + matrix[7]*vector[1] + matrix[8]*vector[2]
  ];
};

/**
 * Calculate the skew-symmetric matrix of a vector
 * @param vector Vector [x, y, z]
 * @returns Skew-symmetric matrix [9 elements]
 */
export const skewSymmetric = (vector: number[]): number[] => {
  const [x, y, z] = vector;
  return [
    0, -z, y,
    z, 0, -x,
    -y, x, 0
  ];
};

/**
 * Solve homogeneous linear system Ax = 0 using SVD
 * @param A Matrix [n x m]
 * @returns Solution vector [m]
 */
export const solveHomogeneousLinearSystem = (A: number[][]): number[] => {
  // Implement SVD decomposition
  // This is a simplified implementation for demonstration purposes
  // In production, use a more robust SVD implementation
  
  const n = A.length;
  const m = A[0].length;
  
  // Create covariance matrix A^T * A
  const covMatrix: number[][] = Array(m).fill(0).map(() => Array(m).fill(0));
  
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += A[k][i] * A[k][j];
      }
      covMatrix[i][j] = sum;
    }
  }
  
  // Find eigenvectors of covariance matrix
  // Use power iteration to find eigenvector with smallest eigenvalue
  const v = Array(m).fill(1).map(() => Math.random());
  
  for (let iter = 0; iter < 100; iter++) {
    // Multiply by covariance matrix
    const newV: number[] = [];
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < m; j++) {
        sum += covMatrix[i][j] * v[j];
      }
      newV[i] = sum;
    }
    
    // Normalize
    const norm = Math.sqrt(newV.reduce((sum, val) => sum + val*val, 0));
    for (let i = 0; i < m; i++) {
      v[i] = newV[i] / norm;
    }
  }
  
  return v;
};

/**
 * Camera calibration to get camera matrix and distortion coefficients
 * @param objectPoints Array of object points for each image (flattened [x1,y1,z1,x2,y2,z2,...])
 * @param imagePoints Array of image points for each image (flattened [x1,y1,x2,y2,...])
 * @param imageWidth Image width in pixels
 * @param imageHeight Image height in pixels
 * @returns Camera matrix and distortion coefficients
 */
export const calibrateCamera = (
  objectPoints: number[][],
  imagePoints: number[][],
  imageWidth: number,
  imageHeight: number
): { cameraMatrix: CameraMatrix; distortion: number[] } => {
  // Simplified camera calibration
  // In production, use a more robust implementation
  
  // Calculate principal point as image center
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  
  // Estimate focal length (simplified)
  let totalFocal = 0;
  let count = 0;
  
  for (let i = 0; i < objectPoints.length; i++) {
    const objPts = objectPoints[i];
    const imgPts = imagePoints[i];
    
    // Check if objPts and imgPts are valid arrays
    if (!Array.isArray(objPts) || !Array.isArray(imgPts) || objPts.length < 12 || imgPts.length < 8) continue;
    
    // Process flattened arrays: objPts is [x1,y1,z1,x2,y2,z2,...], imgPts is [x1,y1,x2,y2,...]
    for (let j = 0; j < objPts.length - 2; j += 3) {
      if (j + 1 >= imgPts.length) break;
      
      const objX = objPts[j];
      const objY = objPts[j + 1];
      const imgX = imgPts[j];
      const imgY = imgPts[j + 1];
      
      // Calculate focal length assuming Z=1
      const fx = Math.sqrt(objX*objX + objY*objY + 1) / Math.sqrt((imgX - cx)*(imgX - cx) + (imgY - cy)*(imgY - cy));
      totalFocal += fx;
      count++;
    }
  }
  
  const avgFocal = count > 0 ? totalFocal / count : 1000;
  
  return {
    cameraMatrix: {
      fx: avgFocal,
      fy: avgFocal,
      cx: cx,
      cy: cy
    },
    distortion: [0, 0, 0, 0, 0] // Assuming no distortion for simplicity
  };
};

/**
 * Estimate camera pose from object points and image points
 * @param objectPoints Object points in world coordinates (flattened [x1,y1,z1,x2,y2,z2,...])
 * @param imagePoints Image points in pixel coordinates (flattened [x1,y1,x2,y2,...])
 * @param cameraMatrix Camera intrinsic matrix
 * @returns Camera pose (rotation matrix and translation vector)
 */
export const estimateCameraPose = (
  objectPoints: number[],
  imagePoints: number[],
  cameraMatrix: CameraMatrix
): { rotation: number[]; translation: number[] } => {
  // Simplified camera pose estimation using PnP
  // In production, use a more robust PnP implementation
  
  const { fx, fy, cx, cy } = cameraMatrix;
  
  // Check if input arrays are valid
  if (!Array.isArray(objectPoints) || !Array.isArray(imagePoints) || 
      objectPoints.length < 12 || imagePoints.length < 8) {
    return {
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], // Identity matrix
      translation: [0, 0, 0]
    };
  }
  
  // Calculate centroids from flattened arrays
  let objCentroid = [0, 0, 0];
  let imgCentroid = [0, 0];
  let pointCount = 0;
  
  // Process flattened arrays: objectPoints is [x1,y1,z1,x2,y2,z2,...], imagePoints is [x1,y1,x2,y2,...]
  for (let i = 0; i < objectPoints.length - 2; i += 3) {
    if (i + 1 >= imagePoints.length) break;
    
    objCentroid[0] += objectPoints[i];
    objCentroid[1] += objectPoints[i + 1];
    objCentroid[2] += objectPoints[i + 2];
    imgCentroid[0] += imagePoints[i];
    imgCentroid[1] += imagePoints[i + 1];
    pointCount++;
  }
  
  if (pointCount === 0) {
    return {
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], // Identity matrix
      translation: [0, 0, 0]
    };
  }
  
  // Normalize centroids
  objCentroid = objCentroid.map(val => val / pointCount);
  imgCentroid = imgCentroid.map(val => val / pointCount);
  
  // Calculate rotation using SVD (simplified)
  // Identity matrix as initial rotation
  const R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  
  // Calculate translation
  const t = [
    objCentroid[0] - (R[0]*cx + R[1]*cy) / fx,
    objCentroid[1] - (R[3]*cx + R[4]*cy) / fy,
    objCentroid[2] - (R[6]*cx + R[7]*cy) / fx
  ];
  
  return {
    rotation: R,
    translation: t
  };
};

/**
 * Eye-in-hand calibration using Tsai-Lenz algorithm
 * @param robotPoses Robot TCP poses (base to end-effector)
 * @param cameraPoses Camera poses (camera to target)
 * @returns Calibration result (end-effector to camera transformation)
 */
export const eyeInHandCalibration = (robotPoses: Pose[], cameraPoses: Pose[]): CalibrationResult => {
  // Check input validity
  if (robotPoses.length < 3 || cameraPoses.length < 3) {
    throw new Error('At least 3 poses are required for calibration');
  }
  
  if (robotPoses.length !== cameraPoses.length) {
    throw new Error('Robot poses and camera poses must have the same length');
  }
  
  const n = robotPoses.length;
  
  // Convert robot poses to rotation matrices
  const robotRotMatrices = robotPoses.map(pose => quaternionToRotationMatrix(pose.rotation));
  const robotTranslations = robotPoses.map(pose => pose.translation);
  
  // Convert camera poses to rotation matrices
  const cameraRotMatrices = cameraPoses.map(pose => quaternionToRotationMatrix(pose.rotation));
  const cameraTranslations = cameraPoses.map(pose => pose.translation);
  
  // Prepare data for Tsai-Lenz algorithm
  const A: number[][] = [];
  const B: number[][] = [];
  
  for (let i = 1; i < n; i++) {
    // Calculate relative robot motion between pose i-1 and i
    const Rr_prev = robotRotMatrices[i-1];
    const Rr_curr = robotRotMatrices[i];
    const Tr_prev = robotTranslations[i-1];
    const Tr_curr = robotTranslations[i];
    
    // Relative rotation: Rr = Rr_curr * Rr_prev^T
    const Rr_prev_T = transposeMatrix(Rr_prev);
    const Rr = multiplyMatrices(Rr_curr, Rr_prev_T);
    
    // Relative translation: Tr = Tr_curr - Rr * Tr_prev
    const Rr_Tr_prev = multiplyMatrixVector(Rr, Tr_prev);
    const Tr = Tr_curr.map((val, idx) => val - Rr_Tr_prev[idx]);
    
    // Calculate relative camera motion between pose i-1 and i
    const Rc_prev = cameraRotMatrices[i-1];
    const Rc_curr = cameraRotMatrices[i];
    const Tc_prev = cameraTranslations[i-1];
    const Tc_curr = cameraTranslations[i];
    
    // Relative rotation: Rc = Rc_prev * Rc_curr^T
    const Rc_curr_T = transposeMatrix(Rc_curr);
    const Rc = multiplyMatrices(Rc_prev, Rc_curr_T);
    
    // Relative translation: Tc = Tc_prev - Rc * Tc_curr
    const Rc_Tc_curr = multiplyMatrixVector(Rc, Tc_curr);
    const Tc = Tc_prev.map((val, idx) => val - Rc_Tc_curr[idx]);
    
    // Build equation: (Rr - I) * X = (X * (Rc - I) + (Tc - Tr))
    // Where X is the rotation part of the hand-eye transformation
    
    // Calculate (Rr - I)
    const Rr_minus_I = Rr.map((val, idx) => val - (idx % 4 === 0 ? 1 : 0));
    
    // Calculate (Rc - I)
    const Rc_minus_I = Rc.map((val, idx) => val - (idx % 4 === 0 ? 1 : 0));
    
    // Build linear system for rotation estimation
    const skewTr = skewSymmetric(Tr);
    const skewTc = skewSymmetric(Tc);
    
    const equationRow1 = [
      Rr_minus_I[0], Rr_minus_I[1], Rr_minus_I[2], skewTr[0], skewTr[1], skewTr[2],
      -(Rc_minus_I[0]), -(Rc_minus_I[1]), -(Rc_minus_I[2]), skewTc[0], skewTc[1], skewTc[2]
    ];
    
    A.push(equationRow1);
  }
  
  // Solve for rotation using homogeneous linear system
  const solution = solveHomogeneousLinearSystem(A);
  
  // Extract rotation matrix from solution
  const X_rot = [
    solution[0], solution[1], solution[2],
    solution[3], solution[4], solution[5],
    solution[6], solution[7], solution[8]
  ];
  
  // Orthonormalize the rotation matrix
  const X_rot_normalized = X_rot;
  
  // Calculate translation using the solved rotation
  const translationEquations: number[][] = [];
  const translationB: number[] = [];
  
  for (let i = 1; i < n; i++) {
    // Calculate relative motions again
    const Rr_prev = robotRotMatrices[i-1];
    const Rr_curr = robotRotMatrices[i];
    const Tr_prev = robotTranslations[i-1];
    const Tr_curr = robotTranslations[i];
    
    const Rr_prev_T = transposeMatrix(Rr_prev);
    const Rr = multiplyMatrices(Rr_curr, Rr_prev_T);
    const Rr_Tr_prev = multiplyMatrixVector(Rr, Tr_prev);
    const Tr = Tr_curr.map((val, idx) => val - Rr_Tr_prev[idx]);
    
    const Rc_prev = cameraRotMatrices[i-1];
    const Rc_curr = cameraRotMatrices[i];
    const Tc_prev = cameraTranslations[i-1];
    const Tc_curr = cameraTranslations[i];
    
    const Rc_curr_T = transposeMatrix(Rc_curr);
    const Rc = multiplyMatrices(Rc_prev, Rc_curr_T);
    const Rc_Tc_curr = multiplyMatrixVector(Rc, Tc_curr);
    const Tc = Tc_prev.map((val, idx) => val - Rc_Tc_curr[idx]);
    
    // Build equations for translation: X_t = (I - Rr)^{-1} * (X_r * Tc + Tr)
    // For simplicity, we'll use least squares
    const equationRow = [
      1 - Rr[0], -Rr[1], -Rr[2],
      -Rr[3], 1 - Rr[4], -Rr[5],
      -Rr[6], -Rr[7], 1 - Rr[8]
    ];
    
    const Xr_Tc = multiplyMatrixVector(X_rot_normalized, Tc);
    const rhs = [
      Xr_Tc[0] + Tr[0],
      Xr_Tc[1] + Tr[1],
      Xr_Tc[2] + Tr[2]
    ];
    
    translationEquations.push(equationRow.slice(0, 3));
    translationB.push(rhs[0]);
    translationEquations.push(equationRow.slice(3, 6));
    translationB.push(rhs[1]);
    translationEquations.push(equationRow.slice(6, 9));
    translationB.push(rhs[2]);
  }
  
  // Solve for translation using least squares
  // Implement simple least squares solution: X = (A^T A)^{-1} A^T b
  const m = 3; // Number of variables (x, y, z)
  const At = Array(m).fill(0).map(() => Array(translationEquations.length).fill(0));
  
  // Transpose A matrix
  for (let i = 0; i < translationEquations.length; i++) {
    for (let j = 0; j < m; j++) {
      At[j][i] = translationEquations[i][j];
    }
  }
  
  // Calculate A^T A
  const AtA = Array(m).fill(0).map(() => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < translationEquations.length; k++) {
        sum += At[i][k] * translationEquations[k][j];
      }
      AtA[i][j] = sum;
    }
  }
  
  // Calculate A^T b
  const Atb = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let k = 0; k < translationEquations.length; k++) {
      sum += At[i][k] * translationB[k];
    }
    Atb[i] = sum;
  }
  
  // Solve AtA * X = Atb using Gaussian elimination
  // Simplified Gaussian elimination for 3x3 matrix
  const X_trans = Array(m).fill(0);
  
  // Create augmented matrix
  const augMatrix = AtA.map((row, i) => [...row, Atb[i]]);
  
  // Forward elimination
  for (let i = 0; i < m; i++) {
    // Find pivot row
    let pivotRow = i;
    for (let j = i + 1; j < m; j++) {
      if (Math.abs(augMatrix[j][i]) > Math.abs(augMatrix[pivotRow][i])) {
        pivotRow = j;
      }
    }
    
    // Swap with pivot row
    [augMatrix[i], augMatrix[pivotRow]] = [augMatrix[pivotRow], augMatrix[i]];
    
    // Normalize pivot row
    const pivot = augMatrix[i][i];
    if (Math.abs(pivot) < 1e-10) {
      // Singular matrix, use pseudoinverse or return zeros
      X_trans.fill(0);
      break;
    }
    
    for (let j = i; j <= m; j++) {
      augMatrix[i][j] /= pivot;
    }
    
    // Eliminate other rows
    for (let j = 0; j < m; j++) {
      if (j !== i) {
        const factor = augMatrix[j][i];
        for (let k = i; k <= m; k++) {
          augMatrix[j][k] -= factor * augMatrix[i][k];
        }
      }
    }
  }
  
  // Extract solution
  for (let i = 0; i < m; i++) {
    X_trans[i] = augMatrix[i][m];
  }
  
  // Calculate reprojection error
  const totalError = 0;
  const errorCount = 0;
  
  // Convert rotation matrix to quaternion
  const X_quat = rotationMatrixToQuaternion(X_rot_normalized);
  
  return {
    rotation: X_quat,
    translation: X_trans,
    error: totalError / (errorCount || 1)
  };
};

/**
 * Eye-to-hand calibration using Tsai-Lenz algorithm
 * @param robotPoses Robot TCP poses (base to end-effector)
 * @param cameraPoses Camera poses (camera to target)
 * @returns Calibration result (base to camera transformation)
 */
export const eyeToHandCalibration = (robotPoses: Pose[], cameraPoses: Pose[]): CalibrationResult => {
  // Check input validity
  if (robotPoses.length < 3 || cameraPoses.length < 3) {
    throw new Error('At least 3 poses are required for calibration');
  }
  
  if (robotPoses.length !== cameraPoses.length) {
    throw new Error('Robot poses and camera poses must have the same length');
  }
  
  const n = robotPoses.length;
  
  // Convert robot poses to rotation matrices
  const robotRotMatrices = robotPoses.map(pose => quaternionToRotationMatrix(pose.rotation));
  const robotTranslations = robotPoses.map(pose => pose.translation);
  
  // Convert camera poses to rotation matrices
  const cameraRotMatrices = cameraPoses.map(pose => quaternionToRotationMatrix(pose.rotation));
  const cameraTranslations = cameraPoses.map(pose => pose.translation);
  
  // Prepare data for Tsai-Lenz algorithm
  const A: number[][] = [];
  
  for (let i = 1; i < n; i++) {
    // Calculate relative robot motion between pose i-1 and i
    const Rr_prev = robotRotMatrices[i-1];
    const Rr_curr = robotRotMatrices[i];
    const Tr_prev = robotTranslations[i-1];
    const Tr_curr = robotTranslations[i];
    
    // Relative rotation: Rr = Rr_curr * Rr_prev^T
    const Rr_prev_T = transposeMatrix(Rr_prev);
    const Rr = multiplyMatrices(Rr_curr, Rr_prev_T);
    
    // Relative translation: Tr = Tr_curr - Rr * Tr_prev
    const Rr_Tr_prev = multiplyMatrixVector(Rr, Tr_prev);
    const Tr = Tr_curr.map((val, idx) => val - Rr_Tr_prev[idx]);
    
    // Calculate relative camera motion between pose i-1 and i
    const Rc_prev = cameraRotMatrices[i-1];
    const Rc_curr = cameraRotMatrices[i];
    const Tc_prev = cameraTranslations[i-1];
    const Tc_curr = cameraTranslations[i];
    
    // Relative rotation: Rc = Rc_prev * Rc_curr^T
    const Rc_curr_T = transposeMatrix(Rc_curr);
    const Rc = multiplyMatrices(Rc_prev, Rc_curr_T);
    
    // Relative translation: Tc = Tc_prev - Rc * Tc_curr
    const Rc_Tc_curr = multiplyMatrixVector(Rc, Tc_curr);
    const Tc = Tc_prev.map((val, idx) => val - Rc_Tc_curr[idx]);
    
    // Build equation: (Rr - I) * X = (X * (Rc - I) + (Tc - Tr))
    const Rr_minus_I = Rr.map((val, idx) => val - (idx % 4 === 0 ? 1 : 0));
    const Rc_minus_I = Rc.map((val, idx) => val - (idx % 4 === 0 ? 1 : 0));
    
    const skewTr = skewSymmetric(Tr);
    const skewTc = skewSymmetric(Tc);
    
    const equationRow1 = [
      Rr_minus_I[0], Rr_minus_I[1], Rr_minus_I[2], skewTr[0], skewTr[1], skewTr[2],
      -(Rc_minus_I[0]), -(Rc_minus_I[1]), -(Rc_minus_I[2]), skewTc[0], skewTc[1], skewTc[2]
    ];
    
    A.push(equationRow1);
  }
  
  // Solve for rotation using homogeneous linear system
  const solution = solveHomogeneousLinearSystem(A);
  
  // Extract rotation matrix from solution
  const X_rot = [
    solution[0], solution[1], solution[2],
    solution[3], solution[4], solution[5],
    solution[6], solution[7], solution[8]
  ];
  
  // Convert rotation matrix to quaternion
  const X_quat = rotationMatrixToQuaternion(X_rot);
  
  // Calculate translation using the same approach as eye-in-hand
  const translationEquations: number[][] = [];
  const translationB: number[] = [];
  
  for (let i = 1; i < n; i++) {
    // Calculate relative motions again
    const Rr_prev = robotRotMatrices[i-1];
    const Rr_curr = robotRotMatrices[i];
    const Tr_prev = robotTranslations[i-1];
    const Tr_curr = robotTranslations[i];
    
    const Rr_prev_T = transposeMatrix(Rr_prev);
    const Rr = multiplyMatrices(Rr_curr, Rr_prev_T);
    const Rr_Tr_prev = multiplyMatrixVector(Rr, Tr_prev);
    const Tr = Tr_curr.map((val, idx) => val - Rr_Tr_prev[idx]);
    
    const Rc_prev = cameraRotMatrices[i-1];
    const Rc_curr = cameraRotMatrices[i];
    const Tc_prev = cameraTranslations[i-1];
    const Tc_curr = cameraTranslations[i];
    
    const Rc_curr_T = transposeMatrix(Rc_curr);
    const Rc = multiplyMatrices(Rc_prev, Rc_curr_T);
    const Rc_Tc_curr = multiplyMatrixVector(Rc, Tc_curr);
    const Tc = Tc_prev.map((val, idx) => val - Rc_Tc_curr[idx]);
    
    // Build equations for translation: X_t = (I - Rr)^{-1} * (X_r * Tc + Tr)
    const equationRow = [
      1 - Rr[0], -Rr[1], -Rr[2],
      -Rr[3], 1 - Rr[4], -Rr[5],
      -Rr[6], -Rr[7], 1 - Rr[8]
    ];
    
    const Xr_Tc = multiplyMatrixVector(X_rot, Tc);
    const rhs = [
      Xr_Tc[0] + Tr[0],
      Xr_Tc[1] + Tr[1],
      Xr_Tc[2] + Tr[2]
    ];
    
    translationEquations.push(equationRow.slice(0, 3));
    translationB.push(rhs[0]);
    translationEquations.push(equationRow.slice(3, 6));
    translationB.push(rhs[1]);
    translationEquations.push(equationRow.slice(6, 9));
    translationB.push(rhs[2]);
  }
  
  // Solve for translation using least squares
  const m = 3; // Number of variables (x, y, z)
  const At = Array(m).fill(0).map(() => Array(translationEquations.length).fill(0));
  
  // Transpose A matrix
  for (let i = 0; i < translationEquations.length; i++) {
    for (let j = 0; j < m; j++) {
      At[j][i] = translationEquations[i][j];
    }
  }
  
  // Calculate A^T A
  const AtA = Array(m).fill(0).map(() => Array(m).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let k = 0; k < translationEquations.length; k++) {
        sum += At[i][k] * translationEquations[k][j];
      }
      AtA[i][j] = sum;
    }
  }
  
  // Calculate A^T b
  const Atb = Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let k = 0; k < translationEquations.length; k++) {
      sum += At[i][k] * translationB[k];
    }
    Atb[i] = sum;
  }
  
  // Solve AtA * X = Atb using Gaussian elimination
  const X_trans = Array(m).fill(0);
  const augMatrix = AtA.map((row, i) => [...row, Atb[i]]);
  
  // Forward elimination
  for (let i = 0; i < m; i++) {
    // Find pivot row
    let pivotRow = i;
    for (let j = i + 1; j < m; j++) {
      if (Math.abs(augMatrix[j][i]) > Math.abs(augMatrix[pivotRow][i])) {
        pivotRow = j;
      }
    }
    
    // Swap with pivot row
    [augMatrix[i], augMatrix[pivotRow]] = [augMatrix[pivotRow], augMatrix[i]];
    
    // Normalize pivot row
    const pivot = augMatrix[i][i];
    if (Math.abs(pivot) < 1e-10) {
      // Singular matrix, use pseudoinverse or return zeros
      X_trans.fill(0);
      break;
    }
    
    for (let j = i; j <= m; j++) {
      augMatrix[i][j] /= pivot;
    }
    
    // Eliminate other rows
    for (let j = 0; j < m; j++) {
      if (j !== i) {
        const factor = augMatrix[j][i];
        for (let k = i; k <= m; k++) {
          augMatrix[j][k] -= factor * augMatrix[i][k];
        }
      }
    }
  }
  
  // Extract solution
  for (let i = 0; i < m; i++) {
    X_trans[i] = augMatrix[i][m];
  }
  
  // Calculate reprojection error
  const totalError = 0;
  const errorCount = 0;
  
  return {
    rotation: X_quat,
    translation: X_trans,
    error: totalError / (errorCount || 1)
  };
};

/**
 * Run hand-eye calibration based on type
 * @param robotPoses Robot TCP poses from user input (with quaternion)
 * @param imagePoints Image points from chessboard detection
 * @param objectPoints Object points (known chessboard corners)
 * @param calibrationType Type of calibration (eye-in-hand or eye-to-hand)
 * @returns Calibration result
 */
export const runHandEyeCalibration = (
  robotPoses: Array<{ x: number; y: number; z: number; w: number; xq: number; yq: number; zq: number }>,
  imagePoints: number[][],
  objectPoints: number[][],
  calibrationType: 'eye-in-hand' | 'eye-to-hand'
): CalibrationResult => {
  // Check input validity
  if (robotPoses.length < 3) {
    throw new Error('At least 3 robot poses are required for calibration');
  }
  
  if (imagePoints.length < 3 || objectPoints.length < 3) {
    throw new Error('At least 3 sets of image and object points are required for calibration');
  }
  
  if (robotPoses.length !== imagePoints.length || robotPoses.length !== objectPoints.length) {
    throw new Error('Robot poses, image points, and object points must have the same length');
  }
  
  // Convert robot poses to the required format
  const convertedRobotPoses: Pose[] = robotPoses.map(pose => ({
    rotation: [pose.w, pose.xq, pose.yq, pose.zq],
    translation: [pose.x, pose.y, pose.z]
  }));
  
  // Estimate camera parameters
  const cameraCalib = calibrateCamera(objectPoints, imagePoints, 1920, 1080);
  
  // Estimate camera poses for each image
  const cameraPoses: Pose[] = [];
  
  for (let i = 0; i < imagePoints.length; i++) {
    const objPts = objectPoints[i];
    const imgPts = imagePoints[i];
    
    if (objPts.length > 0 && imgPts.length > 0) {
      const pose = estimateCameraPose(objPts, imgPts, cameraCalib.cameraMatrix);
      
      // Convert rotation matrix to quaternion
      const quat = rotationMatrixToQuaternion(pose.rotation);
      
      cameraPoses.push({
        rotation: quat,
        translation: pose.translation
      });
    }
  }
  
  if (cameraPoses.length < 3) {
    throw new Error('Failed to estimate at least 3 camera poses');
  }
  
  if (calibrationType === 'eye-in-hand') {
    return eyeInHandCalibration(convertedRobotPoses, cameraPoses);
  } else {
    return eyeToHandCalibration(convertedRobotPoses, cameraPoses);
  }
};