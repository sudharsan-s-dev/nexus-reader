import cv2
import numpy as np

def preprocess_for_ocr(image_bytes):
    """
    Applies image preprocessing techniques to enhance OCR accuracy.
    Includes grayscale, contrast enhancement, noise reduction, and binarization.
    """
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Could not decode image bytes")

        # 1. Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Contrast Limited Adaptive Histogram Equalization (CLAHE)
        # Helps with uneven lighting in scanned documents
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # 3. Noise reduction (slight blur to remove scanner noise)
        denoised = cv2.GaussianBlur(enhanced, (3, 3), 0)

        # 4. Otsu's Thresholding (Binarization)
        # Makes the background perfectly white and text perfectly black
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Encode back to bytes (PNG format preserves quality)
        success, encoded_img = cv2.imencode('.png', thresh)
        if not success:
            raise ValueError("Failed to encode processed image")

        return encoded_img.tobytes()

    except Exception as e:
        print(f"Image preprocessing failed: {e}")
        # Fallback to original image if anything goes wrong
        return image_bytes
