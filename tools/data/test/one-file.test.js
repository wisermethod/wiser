import { deliveryTests } from '../../lib/tests/one-file.js';
deliveryTests('data', new URL('../', import.meta.url));
