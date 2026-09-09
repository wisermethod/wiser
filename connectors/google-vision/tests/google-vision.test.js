import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

test('billed face detection needs confirmation and maps both eyes', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-vision', module: 'images', privilege: 'read' });
  const call = { action: 'google-vision.images.detect_faces', input: { image_uri: 'https://example.com/face.png' } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  const original = fake.catalog.execute;
  let request;
  fake.catalog.execute = async (args) => { request = args.arguments; return original(args); };
  const result = await gw.execute({ ...call, confirm: true });
  assert.deepEqual(result, { count: 1, faces: [{ confidence: 0.98, left_eye: { x: 10, y: 20 }, right_eye: { x: 30, y: 20 } }] });
  assert.deepEqual(request.requests[0].features, [{ type: 'FACE_DETECTION', maxResults: 10 }]);
  assert.equal(request.requests[0].image.source.imageUri, call.input.image_uri);
});

test('incomplete faces are omitted, zero coordinates survive, and base64 is wrapped', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-vision', module: 'images', privilege: 'read' });
  const action = 'google-vision.images.detect_faces';
  fake.catalog.setResult(fake.catalog.toSlug(action), (args) => {
    assert.equal(args.requests[0].image.content, 'ZXhhbXBsZQ==');
    return { responses: [{ faceAnnotations: [
      { landmarks: [{ type: 'LEFT_EYE', position: { x: 1, y: 2 } }] },
      { detectionConfidence: 0.9, landmarks: [{ type: 'LEFT_EYE', position: {} }, { type: 'RIGHT_EYE', position: { x: 2 } }] },
    ] }] };
  });
  const result = await gw.execute({ action, input: { image_base64: 'ZXhhbXBsZQ==' }, confirm: true });
  assert.equal(result.count, 1);
  assert.deepEqual(result.faces[0].left_eye, { x: 0, y: 0 });
  assert.deepEqual(result.faces[0].right_eye, { x: 2, y: 0 });
  assert.equal((await gw.execute({ action, input: {}, confirm: true })).status, 'invalid_arguments');
  assert.equal((await gw.execute({ action, input: { image_base64: 'ZXhhbXBsZQ==', image_uri: 'https://example.com/face.png' }, confirm: true })).status, 'invalid_arguments');
});

test('annotation failure is a safe stop, never a fabricated zero-face success', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-vision', module: 'images', privilege: 'read' });
  const action = 'google-vision.images.detect_faces';
  fake.catalog.setResult(fake.catalog.toSlug(action), { responses: [{ error: { code: 400 } }] });
  assert.equal((await gw.execute({ action, input: { image_uri: 'https://example.com/face.png' }, confirm: true })).status, 'vendor_error');
});
