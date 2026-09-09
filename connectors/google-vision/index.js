function eye(landmarks, type) {
  const point = landmarks.find((item) => item.type === type)?.position;
  if (!point) return null;
  // Google omits zero-valued protobuf coordinates in JSON.
  const x = point.x ?? 0;
  const y = point.y ?? 0;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export const modules = {
  images: {
    async detect_faces(input, ctx) {
      const base64 = typeof input.image_base64 === 'string' && input.image_base64.length > 0;
      const uri = typeof input.image_uri === 'string' && input.image_uri.length > 0;
      if (base64 === uri) return { status: 'invalid_arguments', field: 'image_base64 or image_uri' };
      const image = base64 ? { content: input.image_base64 } : { source: { imageUri: input.image_uri } };
      const result = await ctx.catalog('google-vision.images.detect_faces', {
        requests: [{ image, features: [{ type: 'FACE_DETECTION', maxResults: 10 }] }],
      });
      const responses = result?.responses;
      // One image per call. A later batch must handle errors per response, not fail the whole array.
      if (!Array.isArray(responses) || responses.some((response) => response.error)) {
        return { status: 'vendor_error', endpoint: 'images:annotate', method: 'POST' };
      }
      const faces = [];
      for (const response of responses) {
        for (const face of response.faceAnnotations ?? []) {
          const landmarks = face.landmarks ?? [];
          const left_eye = eye(landmarks, 'LEFT_EYE');
          const right_eye = eye(landmarks, 'RIGHT_EYE');
          if (!left_eye || !right_eye) continue;
          faces.push({ confidence: face.detectionConfidence ?? 0, left_eye, right_eye });
        }
      }
      return { count: faces.length, faces };
    },
  },
};
